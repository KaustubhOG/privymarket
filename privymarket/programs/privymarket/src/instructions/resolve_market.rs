use crate::errors::MarketError;
use crate::state::{Config, Market, MarketStatus};
use anchor_lang::prelude::*;

#[derive(Accounts)]
pub struct ResolveMarket<'info> {
    #[account(
        seeds = [b"config"],
        bump = config.bump,
        has_one = admin @ MarketError::Unauthorized
    )]
    pub config: Account<'info, Config>,

    #[account(
        mut,
        seeds = [b"market", market.market_id.to_le_bytes().as_ref()],
        bump = market.bump
    )]
    pub market: Account<'info, Market>,

    pub admin: Signer<'info>,
}

pub fn handler(ctx: Context<ResolveMarket>, outcome: bool) -> Result<()> {
    let clock = Clock::get()?;
    let market = &mut ctx.accounts.market;

    require!(
        market.status == MarketStatus::Open,
        MarketError::MarketAlreadyResolved
    );
    require!(
        clock.unix_timestamp >= market.deadline,
        MarketError::DeadlineNotPassed
    );

    // lock the market — no more bets after this point
    market.outcome = Some(outcome);
    market.status = MarketStatus::Resolved;

    Ok(())
}
