use anchor_lang::prelude::*;

#[account]
pub struct UserPosition {
    pub user: Pubkey,
    pub market: Pubkey,
    // this is sha256(secret + position_byte), the actual YES/NO never hits the chain
    pub commitment: [u8; 32],
    pub amount: u64,
    pub claimed: bool,
    pub created_at: i64,
    pub bump: u8,
}

impl UserPosition {
    pub const LEN: usize = 8 + 32 + 32 + 32 + 8 + 1 + 8 + 1;
}
