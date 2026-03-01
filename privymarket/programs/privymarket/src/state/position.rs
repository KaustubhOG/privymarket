use anchor_lang::prelude::*;

#[derive(AnchorSerialize, AnchorDeserialize, Clone, PartialEq)]
pub enum MarketStatus {
    Open,
    Resolved,
}

#[account]
pub struct Market {
    pub market_id: u64,
    pub creator: Pubkey,
    pub question: String,
    pub deadline: i64,
    pub status: MarketStatus,
    pub outcome: Option<bool>,
    pub total_pool: u64,
    pub total_yes_pool: u64,
    pub total_no_pool: u64,
    pub created_at: i64,
    pub bump: u8,
}

impl Market {
    pub const LEN: usize = 8 + 8 + 32 + (4 + 200) + 8 + 1 + 2 + 8 + 8 + 8 + 8 + 1;
}