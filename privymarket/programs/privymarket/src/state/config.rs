use anchor_lang::prelude::*;

#[account]
pub struct Config {
    admin: Pubkey,
    bump: u8,
}
