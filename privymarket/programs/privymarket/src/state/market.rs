use anchor_lang::prelude::*;
MarketStatus enum {
    Open,
    Resolved,
}

#[account]
pub struct Market {
    market_id: u64,
    creator: Pubkey,
    question: String,
    deadline: i64,
    status: MarketStatus,
    outcome: Option<bool>,
    total_pool: u64,
    total_yes_pool: u64,
    total_no_pool: u64,
    created_at: i64,
    bump: u8,
}