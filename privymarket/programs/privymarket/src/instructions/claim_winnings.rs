use crate::errors::MarketError;
use crate::state::{Market, MarketStatus, UserPosition};
use anchor_lang::prelude::*;
use anchor_lang::system_program::{transfer, Transfer};
use sha2::{Digest, Sha256};

#[derive(Accounts)]
pub struct ClaimWinnings<'info> {
    #[account(
        mut,
        seeds = [b"market", market.market_id.to_le_bytes().as_ref()],
        bump = market.bump
    )]
    pub market: Account<'info, Market>,

    /// CHECK: PDA vault that holds SOL for this market
    #[account(
        mut,
        seeds = [b"vault", market.key().as_ref()],
        bump
    )]
    pub vault: UncheckedAccount<'info>,

    #[account(
        mut,
        seeds = [b"position", market.key().as_ref(), user.key().as_ref()],
        bump = user_position.bump,
        has_one = user
    )]
    pub user_position: Account<'info, UserPosition>,

    #[account(mut)]
    pub user: Signer<'info>,

    pub system_program: Program<'info, System>,
}

pub fn handler(ctx: Context<ClaimWinnings>, secret: [u8; 32], position: bool) -> Result<()> {
    let user_position = &mut ctx.accounts.user_position;
    let market = &mut ctx.accounts.market;

    require!(
        market.status == MarketStatus::Resolved,
        MarketError::MarketNotResolved
    );
    require!(!user_position.claimed, MarketError::AlreadyClaimed);

    // recompute sha256(secret + position_byte) and verify it matches the stored commitment
    let position_byte: u8 = if position { 1 } else { 0 };
    let mut hasher = Sha256::new();
    hasher.update(&secret);
    hasher.update(&[position_byte]);
    let recomputed: [u8; 32] = hasher.finalize().into();

    require!(
        recomputed == user_position.commitment,
        MarketError::InvalidCommitment
    );

    let winning_outcome = market.outcome.unwrap();
    require!(position == winning_outcome, MarketError::NotAWinner);

    let bet_amount = user_position.amount;
    if position {
        market.total_yes_pool = market.total_yes_pool.checked_add(bet_amount).unwrap();
    } else {
        market.total_no_pool = market.total_no_pool.checked_add(bet_amount).unwrap();
    }

    let winning_pool = if winning_outcome {
        market.total_yes_pool
    } else {
        market.total_no_pool
    };

    let losing_pool = market.total_pool.checked_sub(winning_pool).unwrap_or(0);

    require!(winning_pool > 0, MarketError::ZeroWinningPool);

    // winnings = your bet + your proportional share of the losing pool
    let winnings = bet_amount
        .checked_add(
            bet_amount
                .checked_mul(losing_pool)
                .unwrap()
                .checked_div(winning_pool)
                .unwrap(),
        )
        .unwrap();

    require!(
        ctx.accounts.vault.lamports() >= winnings,
        MarketError::InsufficientVaultBalance
    );

    // flip claimed before transfer — prevents reentrancy
    user_position.claimed = true;

    let vault_bump = ctx.bumps.vault;
    let market_key = market.key();
    let vault_seeds: &[&[u8]] = &[b"vault", market_key.as_ref(), &[vault_bump]];

    // send winnings from vault back to user
    transfer(
        CpiContext::new_with_signer(
            ctx.accounts.system_program.to_account_info(),
            Transfer {
                from: ctx.accounts.vault.to_account_info(),
                to: ctx.accounts.user.to_account_info(),
            },
            &[vault_seeds],
        ),
        winnings,
    )?;

    Ok(())
}
