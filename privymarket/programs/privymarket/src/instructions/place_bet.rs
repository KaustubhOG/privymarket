use crate::errors::MarketError;
use crate::state::{Market, MarketStatus, UserPosition};
use anchor_lang::prelude::*;
use anchor_lang::system_program::{transfer, Transfer};

#[derive(Accounts)]
pub struct PlaceBet<'info> {
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
        init,
        payer = user,
        space = UserPosition::LEN,
        seeds = [b"position", market.key().as_ref(), user.key().as_ref()],
        bump
    )]
    pub user_position: Account<'info, UserPosition>,

    #[account(mut)]
    pub user: Signer<'info>,

    pub system_program: Program<'info, System>,
}

pub fn handler(ctx: Context<PlaceBet>, commitment: [u8; 32], amount: u64) -> Result<()> {
    require!(amount > 0, MarketError::InvalidAmount);

    let clock = Clock::get()?;
    let market = &mut ctx.accounts.market;

    require!(
        market.status == MarketStatus::Open,
        MarketError::MarketNotOpen
    );
    require!(
        clock.unix_timestamp < market.deadline,
        MarketError::DeadlinePassed
    );

    // store the commitment — YES/NO never touches the chain here
    let position = &mut ctx.accounts.user_position;
    position.user = ctx.accounts.user.key();
    position.market = market.key();
    position.commitment = commitment;
    position.amount = amount;
    position.claimed = false;
    position.created_at = clock.unix_timestamp;
    position.bump = ctx.bumps.user_position;

    // only total_pool grows — YES/NO split stays hidden during betting window
    market.total_pool = market.total_pool.checked_add(amount).unwrap();

    // move SOL from user into the vault
    transfer(
        CpiContext::new(
            ctx.accounts.system_program.to_account_info(),
            Transfer {
                from: ctx.accounts.user.to_account_info(),
                to: ctx.accounts.vault.to_account_info(),
            },
        ),
        amount,
    )?;

    Ok(())
}
