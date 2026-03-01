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
    // only total_pool updates during betting to hide YES/NO split
    pub total_pool: u64,
    // these two are zero during betting, they fill up as users claim
    pub total_yes_pool: u64,
    pub total_no_pool: u64,
    pub created_at: i64,
    pub bump: u8,
}

impl Market {
    // 4 + 200 for String (4 byte length prefix + 200 chars max)
    // 2 for Option<bool> (1 byte discriminant + 1 byte value)
    pub const LEN: usize = 8 + 8 + 32 + (4 + 200) + 8 + 1 + 2 + 8 + 8 + 8 + 8 + 1;
}
