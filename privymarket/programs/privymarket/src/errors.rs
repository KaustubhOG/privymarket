use anchor_lang::prelude::*;

#[error_code]
pub enum MarketError {
    #[msg("You are not authorized to perform this action")]
    Unauthorized,

    #[msg("Market is not open for betting")]
    MarketNotOpen,

    #[msg("Market has not been resolved yet")]
    MarketNotResolved,

    #[msg("Betting deadline has already passed")]
    DeadlinePassed,

    #[msg("Deadline has not passed yet, market cannot be resolved")]
    DeadlineNotPassed,

    #[msg("Market is already resolved")]
    MarketAlreadyResolved,

    #[msg("Bet amount must be greater than zero")]
    InvalidAmount,

    #[msg("Question is too long, max 200 characters")]
    QuestionTooLong,

    #[msg("This position has already been claimed")]
    AlreadyClaimed,

    #[msg("Commitment verification failed, wrong secret or position")]
    InvalidCommitment,

    #[msg("You did not bet on the winning outcome")]
    NotAWinner,

    #[msg("Winning pool is zero")]
    ZeroWinningPool,

    #[msg("Vault does not have enough balance")]
    InsufficientVaultBalance,
}
