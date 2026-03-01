use crate::errors::MarketError;
use crate::state::{Config, Market, MarketStatus};
use anchor_lang::prelude::*;

#[derive(Accounts)]
#[instruction(market_id: u64)]
pub struct CreateMarket<'info> {
    #[account(
        seeds = [b"config"],
        bump = config.bump,
        has_one = admin @ MarketError::Unauthorized
    )]
    pub config: Account<'info, Config>,

    #[account(
        init,
        payer = admin,
        space = Market::LEN,
        seeds = [b"market", market_id.to_le_bytes().as_ref()],
        bump
    )]
    pub market: Account<'info, Market>,

    /// CHECK: PDA vault that holds SOL for this market, no data stored here
    #[account(
        mut,
        seeds = [b"vault", market.key().as_ref()],
        bump
    )]
    pub vault: UncheckedAccount<'info>,

    #[account(mut)]
    pub admin: Signer<'info>,

    pub system_program: Program<'info, System>,
}

pub fn handler(
    ctx: Context<CreateMarket>,
    market_id: u64,
    question: String,
    deadline: i64,
) -> Result<()> {
    require!(question.len() <= 200, MarketError::QuestionTooLong);

    let clock = Clock::get()?;
    require!(deadline > clock.unix_timestamp, MarketError::DeadlinePassed);

    let market = &mut ctx.accounts.market;
    market.market_id = market_id;
    market.creator = ctx.accounts.admin.key();
    market.question = question;
    market.deadline = deadline;
    market.status = MarketStatus::Open;
    market.outcome = None;
    market.total_pool = 0;
    market.total_yes_pool = 0;
    market.total_no_pool = 0;
    market.created_at = clock.unix_timestamp;
    market.bump = ctx.bumps.market;

    Ok(())
}
