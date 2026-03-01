# privymarket

A privacy-focused prediction market built on Solana using Anchor. Users can participate in binary outcome markets without revealing their position on-chain. The YES or NO choice is hidden behind a cryptographic commitment and only verified at claim time, after the market is already resolved.

---

## Program ID Devnet Deployed

```
52pS2mBRo3g4Fk4hf83aFM1dNoG2EYGaKvaq9ruzPHex
```

## Problem

Existing prediction markets expose all user activity publicly. Anyone can see your position, your bet size, and your wallet. This enables front-running and strategy copying, which discourages serious participants from using these platforms.

---

## How It Works

When a user places a bet, they generate a random secret off-chain and compute:

```
commitment = sha256(secret + position_byte)
```

Only the commitment and the SOL amount are sent to the contract. The YES or NO choice never touches the chain during the betting window.

When the market resolves and the user wants to claim winnings, they reveal their secret and position. The contract recomputes the hash and verifies it matches the stored commitment. If it matches and the position is the winning side, the payout is transferred from the vault.

By the time the position is revealed, the market is already resolved. Front-running is not possible at this stage.

---

## Architecture

```
src/
├── lib.rs
├── errors.rs
├── state/
│   ├── config.rs        Config PDA — stores admin pubkey
│   ├── market.rs        Market PDA — tracks question, deadline, pools, outcome
│   └── position.rs      UserPosition PDA — stores commitment, amount, claimed status
└── instructions/
    ├── initialize.rs
    ├── create_market.rs
    ├── place_bet.rs
    ├── resolve_market.rs
    └── claim_winnings.rs
```

### Accounts

| Account | Seeds | Description |
|---|---|---|
| Config | `[b"config"]` | Created once at deploy, stores admin |
| Market | `[b"market", market_id]` | One per market, tracks all state |
| Vault | `[b"vault", market.key()]` | Holds SOL for a market, no data |
| UserPosition | `[b"position", market.key(), user.key()]` | One per user per market |

---

## Instructions

### `initialize`

Creates the global Config PDA and sets the admin. Called once after deployment.

```
Signer: admin
```

### `create_market`

Creates a new Market PDA and its associated Vault PDA.

```
Signer: admin
Args:
  market_id: u64
  question:  String  (max 200 chars)
  deadline:  i64     (unix timestamp, must be in the future)
```

### `place_bet`

Creates a UserPosition PDA for the caller, stores the commitment, and transfers SOL to the vault. The position (YES/NO) is never stored on-chain. Only `total_pool` is updated during betting — the YES and NO split remains hidden.

```
Signer: user
Args:
  commitment: [u8; 32]   sha256(secret + position_byte)
  amount:     u64        in lamports, must be > 0
```

### `resolve_market`

Admin sets the final outcome after the deadline has passed. Changes market status to Resolved and locks further betting.

```
Signer: admin
Args:
  outcome: bool   true = YES won, false = NO won
```

### `claim_winnings`

User reveals their secret and position. The contract recomputes the commitment hash, verifies it matches the stored value, checks the position matches the winning outcome, and transfers winnings from the vault.

```
Signer: user
Args:
  secret:   [u8; 32]
  position: bool
```

Winnings formula:

```
winnings = amount + (amount * losing_pool / winning_pool)
```

---

## Pool Tracking

During betting, only `total_pool` grows. The `total_yes_pool` and `total_no_pool` fields remain zero until users begin claiming. This prevents observers from inferring positions by watching which sub-pool increases.

At claim time, the user's amount is tallied into the correct sub-pool as part of the claim transaction. The losing pool is derived by subtracting the winning pool from `total_pool`.

---

## Privacy Guarantees

| Property | Status |
|---|---|
| Position hidden during betting | Guaranteed — only commitment hash stored |
| Position hidden at claim time | No — revealed to verify the commitment |
| Amount hidden | No — stored in plaintext (v1 limitation) |
| Front-running protection | Yes — position only revealed post-resolution |

---

## Known Limitations (v0)

- Bet amounts are public on-chain. Full amount privacy requires Pedersen commitments (planned for v1).
- Users must store their secret locally. Loss of the secret means inability to claim.
- Market resolution is manual (admin). Oracle integration is planned for v2.
- Only binary outcomes (YES / NO). Multi-outcome support is planned for v2.
- The commitment scheme is SHA256-based, not a full zero-knowledge proof. Groth16 or PLONK proofs are planned for v1.

---

## Upgrade Path

| Version | Focus |
|---|---|
| v0 (current) | SHA256 commitment, binary markets, manual resolution |
| v1 | Pedersen commitments for amount privacy, full ZKP implementation |
| v2 | Oracle-based resolution (Pyth / Switchboard), DAO governance, multi-outcome |

---

## Setup

```bash
anchor build
anchor test
```

Dependencies:

```toml
anchor-lang = "0.32.1"
sha2 = { version = "0.10", default-features = false }
```

---

## Test Coverage

24 tests covering all instructions, error paths, and commitment integrity.

```
initialize         creates config, rejects duplicate init
create_market      correct state, rejects non-admin, past deadline, long question
place_bet          stores commitment, pool stays hidden, rejects zero amount and duplicates
resolve_market     rejects early resolution, non-admin, double resolution
claim_winnings     rejects wrong secret, wrong position, losing side, double claim, unresolved market
commitment         determinism, uniqueness across positions, uniqueness across secrets
```

Run with:

```bash
anchor test
```

---


