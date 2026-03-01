use anchor_lang::prelude::*;

pub mod errors;
pub mod instructions;
pub mod state;

pub use instructions::*;
pub use state::*;
declare_id!("5UAhemfaML4RSGQ6GvDYLBHBC4JdAAQ2qZWdQi7LXgdr");

#[program]
pub mod privymarket {
    use super::*;

    pub fn initialize(ctx: Context<Initialize>) -> Result<()> {
        instructions::initialize::handler(ctx)
    }

    pub fn create_market(
        ctx: Context<CreateMarket>,
        market_id: u64,
        question: String,
        deadline: i64,
    ) -> Result<()> {
        instructions::create_market::handler(ctx, market_id, question, deadline)
    }

    // commitment = sha256(secret + position_byte), position never touches the chain here
    pub fn place_bet(ctx: Context<PlaceBet>, commitment: [u8; 32], amount: u64) -> Result<()> {
        instructions::place_bet::handler(ctx, commitment, amount)
    }

    pub fn resolve_market(ctx: Context<ResolveMarket>, outcome: bool) -> Result<()> {
        instructions::resolve_market::handler(ctx, outcome)
    }

    //user reveals secret + position here to prove their commitment
    pub fn claim_winnings(
        ctx: Context<ClaimWinnings>,
        secret: [u8; 32],
        position: bool,
    ) -> Result<()> {
        instructions::claim_winnings::handler(ctx, secret, position)
    }
}
