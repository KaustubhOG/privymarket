use anchor_lang::prelude::*;

declare_id!("5UAhemfaML4RSGQ6GvDYLBHBC4JdAAQ2qZWdQi7LXgdr");

#[program]
pub mod privymarket {
    use super::*;

    pub fn initialize(ctx: Context<Initialize>) -> Result<()> {
        msg!("Greetings from: {:?}", ctx.program_id);
        Ok(())
    }
}


