import * as anchor from "@coral-xyz/anchor";
import { Program, BN } from "@coral-xyz/anchor";
import { Privcymarket } from "../target/types/privacy_market";
import {
  Keypair,
  LAMPORTS_PER_SOL,
  PublicKey,
  SystemProgram,
} from "@solana/web3.js";
import { assert } from "chai";
import * as crypto from "crypto";

function sha256Commitment(secret: Uint8Array, position: boolean): Buffer {
  return crypto
    .createHash("sha256")
    .update(Buffer.from(secret))
    .update(Buffer.from([position ? 1 : 0]))
    .digest();
}

function generateSecret(): Uint8Array {
  return crypto.randomBytes(32);
}

async function airdrop(
  provider: anchor.AnchorProvider,
  pubkey: PublicKey,
  sol: number,
) {
  const sig = await provider.connection.requestAirdrop(
    pubkey,
    sol * LAMPORTS_PER_SOL,
  );
  await provider.connection.confirmTransaction(sig, "confirmed");
}

function sleep(ms: number) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function getConfigPda(programId: PublicKey) {
  return PublicKey.findProgramAddressSync([Buffer.from("config")], programId);
}

function getMarketPda(programId: PublicKey, marketId: BN) {
  const buf = Buffer.alloc(8);
  buf.writeBigUInt64LE(BigInt(marketId.toString()));
  return PublicKey.findProgramAddressSync(
    [Buffer.from("market"), buf],
    programId,
  );
}

function getVaultPda(programId: PublicKey, market: PublicKey) {
  return PublicKey.findProgramAddressSync(
    [Buffer.from("vault"), market.toBuffer()],
    programId,
  );
}

function getPositionPda(
  programId: PublicKey,
  market: PublicKey,
  user: PublicKey,
) {
  return PublicKey.findProgramAddressSync(
    [Buffer.from("position"), market.toBuffer(), user.toBuffer()],
    programId,
  );
}

describe("privymarket", () => {
  const provider = anchor.AnchorProvider.env();
  anchor.setProvider(provider);

  const program = anchor.workspace.Privymarket as Program<Privymarket>;
  const programId = program.programId;

  const admin = Keypair.generate();
  const userA = Keypair.generate();
  const userB = Keypair.generate();
  const stranger = Keypair.generate();

  const MARKET_ID = new BN(1);
  const QUESTION = "Will SOL price exceed $200 by end of the month?";
  const BET_AMOUNT = new BN(1 * LAMPORTS_PER_SOL);

  const secretA = generateSecret();
  const secretB = generateSecret();
  const commitmentA = sha256Commitment(secretA, true);
  const commitmentB = sha256Commitment(secretB, false);

  let configPda: PublicKey;
  let marketPda: PublicKey;
  let vaultPda: PublicKey;

  before(async () => {
    await airdrop(provider, admin.publicKey, 10);
    await airdrop(provider, userA.publicKey, 10);
    await airdrop(provider, userB.publicKey, 10);
    await airdrop(provider, stranger.publicKey, 2);

    [configPda] = getConfigPda(programId);
    [marketPda] = getMarketPda(programId, MARKET_ID);
    [vaultPda] = getVaultPda(programId, marketPda);
  });

  describe("initialize", () => {
    it("creates config with correct admin", async () => {
      await program.methods
        .initialize()
        .accounts({
          config: configPda,
          admin: admin.publicKey,
          systemProgram: SystemProgram.programId,
        })
        .signers([admin])
        .rpc();

      const config = await program.account.config.fetch(configPda);
      assert.ok(config.admin.equals(admin.publicKey));
    });

    it("rejects second initialization", async () => {
      try {
        await program.methods
          .initialize()
          .accounts({
            config: configPda,
            admin: admin.publicKey,
            systemProgram: SystemProgram.programId,
          })
          .signers([admin])
          .rpc();
        assert.fail("should have thrown");
      } catch (err) {
        assert.ok(err);
      }
    });
  });

  describe("create_market", () => {
    it("creates market with correct initial state", async () => {
      const deadline = Math.floor(Date.now() / 1000) + 60;

      await program.methods
        .createMarket(MARKET_ID, QUESTION, new BN(deadline))
        .accounts({
          config: configPda,
          market: marketPda,
          vault: vaultPda,
          admin: admin.publicKey,
          systemProgram: SystemProgram.programId,
        })
        .signers([admin])
        .rpc();

      const market = await program.account.market.fetch(marketPda);
      assert.ok(market.marketId.eq(MARKET_ID));
      assert.ok(market.creator.equals(admin.publicKey));
      assert.equal(market.question, QUESTION);
      assert.ok(market.totalPool.eq(new BN(0)));
      assert.ok(market.totalYesPool.eq(new BN(0)));
      assert.ok(market.totalNoPool.eq(new BN(0)));
      assert.isNull(market.outcome);
      assert.deepEqual(market.status, { open: {} });
    });

    it("rejects non-admin creating a market", async () => {
      const [mPda] = getMarketPda(programId, new BN(99));
      const [vPda] = getVaultPda(programId, mPda);

      try {
        await program.methods
          .createMarket(
            new BN(99),
            QUESTION,
            new BN(Math.floor(Date.now() / 1000) + 60),
          )
          .accounts({
            config: configPda,
            market: mPda,
            vault: vPda,
            admin: stranger.publicKey,
            systemProgram: SystemProgram.programId,
          })
          .signers([stranger])
          .rpc();
        assert.fail("should have thrown");
      } catch (err: any) {
        assert.include(err.message, "Unauthorized");
      }
    });

    it("rejects past deadline", async () => {
      const [mPda] = getMarketPda(programId, new BN(98));
      const [vPda] = getVaultPda(programId, mPda);

      try {
        await program.methods
          .createMarket(
            new BN(98),
            QUESTION,
            new BN(Math.floor(Date.now() / 1000) - 60),
          )
          .accounts({
            config: configPda,
            market: mPda,
            vault: vPda,
            admin: admin.publicKey,
            systemProgram: SystemProgram.programId,
          })
          .signers([admin])
          .rpc();
        assert.fail("should have thrown");
      } catch (err: any) {
        assert.include(err.message, "DeadlinePassed");
      }
    });

    it("rejects question longer than 200 chars", async () => {
      const [mPda] = getMarketPda(programId, new BN(97));
      const [vPda] = getVaultPda(programId, mPda);

      try {
        await program.methods
          .createMarket(
            new BN(97),
            "x".repeat(201),
            new BN(Math.floor(Date.now() / 1000) + 60),
          )
          .accounts({
            config: configPda,
            market: mPda,
            vault: vPda,
            admin: admin.publicKey,
            systemProgram: SystemProgram.programId,
          })
          .signers([admin])
          .rpc();
        assert.fail("should have thrown");
      } catch (err: any) {
        assert.include(err.message, "QuestionTooLong");
      }
    });
  });

  describe("place_bet", () => {
    it("userA bets YES — commitment stored, YES/NO pools stay zero", async () => {
      const [posPda] = getPositionPda(programId, marketPda, userA.publicKey);
      const vaultBefore = await provider.connection.getBalance(vaultPda);

      await program.methods
        .placeBet(Array.from(commitmentA), BET_AMOUNT)
        .accounts({
          market: marketPda,
          vault: vaultPda,
          userPosition: posPda,
          user: userA.publicKey,
          systemProgram: SystemProgram.programId,
        })
        .signers([userA])
        .rpc();

      const pos = await program.account.userPosition.fetch(posPda);
      const market = await program.account.market.fetch(marketPda);
      const vaultAfter = await provider.connection.getBalance(vaultPda);

      assert.ok(pos.user.equals(userA.publicKey));
      assert.deepEqual(Array.from(pos.commitment), Array.from(commitmentA));
      assert.ok(pos.amount.eq(BET_AMOUNT));
      assert.isFalse(pos.claimed);
      assert.ok(market.totalPool.eq(BET_AMOUNT));
      assert.ok(market.totalYesPool.eq(new BN(0)));
      assert.ok(market.totalNoPool.eq(new BN(0)));
      assert.equal(vaultAfter - vaultBefore, BET_AMOUNT.toNumber());
    });

    it("userB bets NO — total pool is now 2 SOL, split still hidden", async () => {
      const [posPda] = getPositionPda(programId, marketPda, userB.publicKey);

      await program.methods
        .placeBet(Array.from(commitmentB), BET_AMOUNT)
        .accounts({
          market: marketPda,
          vault: vaultPda,
          userPosition: posPda,
          user: userB.publicKey,
          systemProgram: SystemProgram.programId,
        })
        .signers([userB])
        .rpc();

      const market = await program.account.market.fetch(marketPda);
      assert.ok(market.totalPool.eq(BET_AMOUNT.mul(new BN(2))));
      assert.ok(market.totalYesPool.eq(new BN(0)));
      assert.ok(market.totalNoPool.eq(new BN(0)));
    });

    it("rejects zero amount", async () => {
      const [posPda] = getPositionPda(programId, marketPda, stranger.publicKey);
      const s = generateSecret();

      try {
        await program.methods
          .placeBet(Array.from(sha256Commitment(s, true)), new BN(0))
          .accounts({
            market: marketPda,
            vault: vaultPda,
            userPosition: posPda,
            user: stranger.publicKey,
            systemProgram: SystemProgram.programId,
          })
          .signers([stranger])
          .rpc();
        assert.fail("should have thrown");
      } catch (err: any) {
        assert.include(err.message, "InvalidAmount");
      }
    });

    it("rejects duplicate bet from same user", async () => {
      const [posPda] = getPositionPda(programId, marketPda, userA.publicKey);

      try {
        await program.methods
          .placeBet(Array.from(commitmentA), BET_AMOUNT)
          .accounts({
            market: marketPda,
            vault: vaultPda,
            userPosition: posPda,
            user: userA.publicKey,
            systemProgram: SystemProgram.programId,
          })
          .signers([userA])
          .rpc();
        assert.fail("should have thrown");
      } catch (err) {
        assert.ok(err);
      }
    });
  });

  describe("resolve_market", () => {
    it("rejects resolution before deadline", async () => {
      try {
        await program.methods
          .resolveMarket(true)
          .accounts({
            config: configPda,
            market: marketPda,
            admin: admin.publicKey,
          })
          .signers([admin])
          .rpc();
        assert.fail("should have thrown");
      } catch (err: any) {
        assert.include(err.message, "DeadlineNotPassed");
      }
    });

    it("rejects resolution by non-admin", async () => {
      try {
        await program.methods
          .resolveMarket(true)
          .accounts({
            config: configPda,
            market: marketPda,
            admin: stranger.publicKey,
          })
          .signers([stranger])
          .rpc();
        assert.fail("should have thrown");
      } catch (err: any) {
        assert.include(err.message, "Unauthorized");
      }
    });

    it("resolves market after deadline passes", async () => {
      const shortId = new BN(2);
      const [shortMarket] = getMarketPda(programId, shortId);
      const [shortVault] = getVaultPda(programId, shortMarket);

      await program.methods
        .createMarket(
          shortId,
          "Short deadline test",
          new BN(Math.floor(Date.now() / 1000) + 3),
        )
        .accounts({
          config: configPda,
          market: shortMarket,
          vault: shortVault,
          admin: admin.publicKey,
          systemProgram: SystemProgram.programId,
        })
        .signers([admin])
        .rpc();

      const tempSecret = generateSecret();
      const [tempPos] = getPositionPda(programId, shortMarket, userA.publicKey);

      await program.methods
        .placeBet(Array.from(sha256Commitment(tempSecret, true)), BET_AMOUNT)
        .accounts({
          market: shortMarket,
          vault: shortVault,
          userPosition: tempPos,
          user: userA.publicKey,
          systemProgram: SystemProgram.programId,
        })
        .signers([userA])
        .rpc();

      await sleep(4000);

      await program.methods
        .resolveMarket(true)
        .accounts({
          config: configPda,
          market: shortMarket,
          admin: admin.publicKey,
        })
        .signers([admin])
        .rpc();

      const market = await program.account.market.fetch(shortMarket);
      assert.deepEqual(market.status, { resolved: {} });
      assert.isTrue(market.outcome);
    });

    it("rejects resolving an already resolved market", async () => {
      const [shortMarket] = getMarketPda(programId, new BN(2));

      try {
        await program.methods
          .resolveMarket(false)
          .accounts({
            config: configPda,
            market: shortMarket,
            admin: admin.publicKey,
          })
          .signers([admin])
          .rpc();
        assert.fail("should have thrown");
      } catch (err: any) {
        assert.include(err.message, "MarketAlreadyResolved");
      }
    });
  });

  describe("claim_winnings", () => {
    const claimMarketId = new BN(3);
    let claimMarket: PublicKey;
    let claimVault: PublicKey;

    const sA = generateSecret();
    const sB = generateSecret();
    const cA = sha256Commitment(sA, true);
    const cB = sha256Commitment(sB, false);

    before(async () => {
      [claimMarket] = getMarketPda(programId, claimMarketId);
      [claimVault] = getVaultPda(programId, claimMarket);

      await program.methods
        .createMarket(
          claimMarketId,
          "Claim test market",
          new BN(Math.floor(Date.now() / 1000) + 3),
        )
        .accounts({
          config: configPda,
          market: claimMarket,
          vault: claimVault,
          admin: admin.publicKey,
          systemProgram: SystemProgram.programId,
        })
        .signers([admin])
        .rpc();

      const [posA] = getPositionPda(programId, claimMarket, userA.publicKey);
      const [posB] = getPositionPda(programId, claimMarket, userB.publicKey);

      await program.methods
        .placeBet(Array.from(cA), BET_AMOUNT)
        .accounts({
          market: claimMarket,
          vault: claimVault,
          userPosition: posA,
          user: userA.publicKey,
          systemProgram: SystemProgram.programId,
        })
        .signers([userA])
        .rpc();

      await program.methods
        .placeBet(Array.from(cB), BET_AMOUNT)
        .accounts({
          market: claimMarket,
          vault: claimVault,
          userPosition: posB,
          user: userB.publicKey,
          systemProgram: SystemProgram.programId,
        })
        .signers([userB])
        .rpc();

      await sleep(4000);

      await program.methods
        .resolveMarket(true)
        .accounts({
          config: configPda,
          market: claimMarket,
          admin: admin.publicKey,
        })
        .signers([admin])
        .rpc();
    });

    it("rejects wrong secret", async () => {
      const [posA] = getPositionPda(programId, claimMarket, userA.publicKey);

      try {
        await program.methods
          .claimWinnings(Array.from(generateSecret()), true)
          .accounts({
            market: claimMarket,
            vault: claimVault,
            userPosition: posA,
            user: userA.publicKey,
            systemProgram: SystemProgram.programId,
          })
          .signers([userA])
          .rpc();
        assert.fail("should have thrown");
      } catch (err: any) {
        assert.include(err.message, "InvalidCommitment");
      }
    });

    it("rejects correct secret with wrong position", async () => {
      const [posA] = getPositionPda(programId, claimMarket, userA.publicKey);

      try {
        await program.methods
          .claimWinnings(Array.from(sA), false)
          .accounts({
            market: claimMarket,
            vault: claimVault,
            userPosition: posA,
            user: userA.publicKey,
            systemProgram: SystemProgram.programId,
          })
          .signers([userA])
          .rpc();
        assert.fail("should have thrown");
      } catch (err: any) {
        assert.include(err.message, "InvalidCommitment");
      }
    });

    it("rejects claim from losing side", async () => {
      const [posB] = getPositionPda(programId, claimMarket, userB.publicKey);

      try {
        await program.methods
          .claimWinnings(Array.from(sB), false)
          .accounts({
            market: claimMarket,
            vault: claimVault,
            userPosition: posB,
            user: userB.publicKey,
            systemProgram: SystemProgram.programId,
          })
          .signers([userB])
          .rpc();
        assert.fail("should have thrown");
      } catch (err: any) {
        assert.include(err.message, "NotAWinner");
      }
    });

    it("pays out winner and marks position claimed", async () => {
      const [posA] = getPositionPda(programId, claimMarket, userA.publicKey);
      const userBefore = await provider.connection.getBalance(userA.publicKey);
      const vaultBefore = await provider.connection.getBalance(claimVault);

      await program.methods
        .claimWinnings(Array.from(sA), true)
        .accounts({
          market: claimMarket,
          vault: claimVault,
          userPosition: posA,
          user: userA.publicKey,
          systemProgram: SystemProgram.programId,
        })
        .signers([userA])
        .rpc();

      const pos = await program.account.userPosition.fetch(posA);
      const market = await program.account.market.fetch(claimMarket);
      const userAfter = await provider.connection.getBalance(userA.publicKey);
      const vaultAfter = await provider.connection.getBalance(claimVault);

      assert.isTrue(pos.claimed);
      assert.ok(market.totalYesPool.eq(BET_AMOUNT));
      assert.ok(userAfter > userBefore);
      assert.ok(vaultBefore - vaultAfter >= 2 * LAMPORTS_PER_SOL * 0.99);
    });

    it("rejects double claim", async () => {
      const [posA] = getPositionPda(programId, claimMarket, userA.publicKey);

      try {
        await program.methods
          .claimWinnings(Array.from(sA), true)
          .accounts({
            market: claimMarket,
            vault: claimVault,
            userPosition: posA,
            user: userA.publicKey,
            systemProgram: SystemProgram.programId,
          })
          .signers([userA])
          .rpc();
        assert.fail("should have thrown");
      } catch (err: any) {
        assert.include(err.message, "AlreadyClaimed");
      }
    });

    it("rejects claim on unresolved market", async () => {
      const openId = new BN(4);
      const [openMarket] = getMarketPda(programId, openId);
      const [openVault] = getVaultPda(programId, openMarket);

      await program.methods
        .createMarket(
          openId,
          "Unresolved market",
          new BN(Math.floor(Date.now() / 1000) + 300),
        )
        .accounts({
          config: configPda,
          market: openMarket,
          vault: openVault,
          admin: admin.publicKey,
          systemProgram: SystemProgram.programId,
        })
        .signers([admin])
        .rpc();

      const s = generateSecret();
      const [pos] = getPositionPda(programId, openMarket, userA.publicKey);

      await program.methods
        .placeBet(Array.from(sha256Commitment(s, true)), BET_AMOUNT)
        .accounts({
          market: openMarket,
          vault: openVault,
          userPosition: pos,
          user: userA.publicKey,
          systemProgram: SystemProgram.programId,
        })
        .signers([userA])
        .rpc();

      try {
        await program.methods
          .claimWinnings(Array.from(s), true)
          .accounts({
            market: openMarket,
            vault: openVault,
            userPosition: pos,
            user: userA.publicKey,
            systemProgram: SystemProgram.programId,
          })
          .signers([userA])
          .rpc();
        assert.fail("should have thrown");
      } catch (err: any) {
        assert.include(err.message, "MarketNotResolved");
      }
    });

    it("rejects bet on resolved market", async () => {
      const [pos] = getPositionPda(programId, claimMarket, stranger.publicKey);

      try {
        await program.methods
          .placeBet(
            Array.from(sha256Commitment(generateSecret(), true)),
            BET_AMOUNT,
          )
          .accounts({
            market: claimMarket,
            vault: claimVault,
            userPosition: pos,
            user: stranger.publicKey,
            systemProgram: SystemProgram.programId,
          })
          .signers([stranger])
          .rpc();
        assert.fail("should have thrown");
      } catch (err: any) {
        assert.include(err.message, "MarketNotOpen");
      }
    });
  });

  describe("commitment integrity", () => {
    it("YES and NO produce different hashes for same secret", () => {
      const s = generateSecret();
      assert.notDeepEqual(
        Array.from(sha256Commitment(s, true)),
        Array.from(sha256Commitment(s, false)),
      );
    });

    it("same inputs always produce same commitment", () => {
      const s = generateSecret();
      assert.deepEqual(
        Array.from(sha256Commitment(s, true)),
        Array.from(sha256Commitment(s, true)),
      );
    });

    it("different secrets produce different commitments", () => {
      assert.notDeepEqual(
        Array.from(sha256Commitment(generateSecret(), true)),
        Array.from(sha256Commitment(generateSecret(), true)),
      );
    });
  });
});
