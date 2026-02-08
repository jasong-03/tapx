// Express HTTP API server for session-based grid trading.
// The bot owns a MarginManager and executes margin trades on behalf of users.

import express from 'express';
import cors from 'cors';
import { SuiJsonRpcClient, getJsonRpcFullnodeUrl } from '@mysten/sui/jsonRpc';
import { Ed25519Keypair } from '@mysten/sui/keypairs/ed25519';
import { DeepBookClient } from '@mysten/deepbook-v3';
import type { MarginManager } from '@mysten/deepbook-v3';
import { Transaction } from '@mysten/sui/transactions';
import { sessionManager } from './sessionManager.js';
import {
  buildOpenWithTPSLOps,
  buildSettleTPSLOps,
  buildCloseEarlyOps,
  queryPoolBookParams,
  alignToLotSize,
} from './marginOps.js';
import { buildMarginTxWithPythRefresh, warmPythCache, getCachedPythVaa } from './pythRefresh.js';
import { getPool, getMarginPoolKeys, getNetwork, type SuiNetwork } from './pools.js';

const GAS_BUDGET = 250_000_000; // explicit gas budget to skip simulation round-trip
const SUI_DECIMALS = 9;

export class TradeServer {
  private app: express.Express;
  private client: SuiJsonRpcClient;
  private keypair: Ed25519Keypair;
  private dbClient!: DeepBookClient;
  private marginManagerId: string;
  private houseAddress: string;
  private port: number;

  constructor(opts: {
    privateKey: string;
    marginManagerId: string;
    houseAddress: string;
    port?: number;
    rpcUrl?: string;
  }) {
    const network = getNetwork();
    this.client = new SuiJsonRpcClient({
      url: opts.rpcUrl || getJsonRpcFullnodeUrl(network),
      network,
    });
    this.keypair = Ed25519Keypair.fromSecretKey(opts.privateKey);
    this.marginManagerId = opts.marginManagerId;
    this.houseAddress = opts.houseAddress;
    this.port = opts.port ?? 3001;

    this.app = express();
    this.app.use(cors());
    this.app.use(express.json());

    this.initDeepBookClient();
    this.setupRoutes();
  }

  private initDeepBookClient(): void {
    // Build marginManagers map — register for all margin pools
    const marginManagers: Record<string, MarginManager> = {};
    for (const poolKey of getMarginPoolKeys()) {
      const mgrKey = `${poolKey}_MGR`;
      marginManagers[mgrKey] = { address: this.marginManagerId, poolKey };
    }

    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    this.dbClient = new DeepBookClient({
      client: this.client as any,
      address: this.keypair.toSuiAddress(),
      network: getNetwork(),
      marginManagers,
    } as any);
  }

  private async signAndExecute(tx: Transaction): Promise<string> {
    // Set explicit gas budget to skip simulation round-trip (~1-2s savings)
    tx.setGasBudget(GAS_BUDGET);

    const result = await this.client.signAndExecuteTransaction({
      transaction: tx,
      signer: this.keypair,
      options: { showEffects: true },
    });
    if (!result.digest) throw new Error('No digest returned');
    const effects = result.effects;
    if (effects?.status?.status === 'failure') {
      throw new Error(effects.status.error || 'Transaction failed on-chain');
    }
    return result.digest;
  }

  private setupRoutes(): void {
    // Health check
    this.app.get('/api/health', (_req, res) => {
      res.json({
        status: 'ok',
        botAddress: this.keypair.toSuiAddress(),
        network: getNetwork(),
        marginManagerId: this.marginManagerId,
        houseAddress: this.houseAddress,
      });
    });

    // Get session info
    this.app.get('/api/session/:address', (req, res) => {
      const session = sessionManager.getSession(req.params.address);
      res.json({
        balance: session.balance,
        totalDeposited: session.totalDeposited,
        totalWithdrawn: session.totalWithdrawn,
        totalLost: session.totalLost,
        totalWon: session.totalWon,
        activePosition: session.activePosition,
        depositCount: session.deposits.length,
        deposits: session.deposits,
        bets: session.bets,
        houseAddress: this.houseAddress,
      });
    });

    // Confirm deposit (user transferred USDC to bot address, we verify on-chain)
    this.app.post('/api/deposit/confirm', async (req, res) => {
      try {
        const { txDigest, amount, senderAddress } = req.body;
        if (!txDigest || !amount || !senderAddress) {
          res.status(400).json({ error: 'Missing txDigest, amount, or senderAddress' });
          return;
        }

        // Wait for the transaction to be indexed (frontend may use a different node)
        const txResult = await this.client.waitForTransaction({
          digest: txDigest,
          options: { showEffects: true, showBalanceChanges: true },
          timeout: 30_000,
          pollInterval: 500,
        });

        const effects = txResult.effects;
        if (effects?.status?.status !== 'success') {
          res.status(400).json({ error: 'Transaction failed on-chain' });
          return;
        }

        // Verify that the bot received funds
        const botAddress = this.keypair.toSuiAddress();
        const balanceChanges = txResult.balanceChanges;
        let receivedAmount = 0;

        if (balanceChanges) {
          for (const change of balanceChanges) {
            if (change.owner && typeof change.owner === 'object' && 'AddressOwner' in change.owner) {
              if (change.owner.AddressOwner === botAddress && BigInt(change.amount) > 0n) {
                // Convert raw amount to human readable (assume 6 decimals for USDC/DBUSDC, 9 for SUI)
                const decimals = change.coinType.includes('::sui::SUI') ? 9 : 6;
                receivedAmount += Number(BigInt(change.amount)) / Math.pow(10, decimals);
              }
            }
          }
        }

        if (receivedAmount <= 0) {
          res.status(400).json({ error: 'No funds received by bot in this transaction' });
          return;
        }

        // Credit the user's session (use the on-chain verified amount)
        const session = sessionManager.creditDeposit(senderAddress, receivedAmount, txDigest);

        res.json({
          success: true,
          balance: session.balance,
          credited: receivedAmount,
        });
      } catch (err) {
        const msg = err instanceof Error ? err.message : String(err);
        res.status(500).json({ error: msg });
      }
    });

    // Open position with TP/SL
    this.app.post('/api/trade/open', async (req, res) => {
      try {
        const { senderAddress, direction, poolKey, collateral, leverage, currentPrice, tpPrice, slPrice } = req.body;

        if (!senderAddress || !direction || !poolKey || !collateral || !leverage || !currentPrice || !tpPrice || !slPrice) {
          res.status(400).json({ error: 'Missing required parameters' });
          return;
        }

        // Validate pool
        const pool = getPool(poolKey);
        if (!pool) {
          res.status(400).json({ error: `Unknown pool: ${poolKey}` });
          return;
        }

        // Debit session balance
        sessionManager.debitForTrade(senderAddress, collateral);

        try {
          const t0 = Date.now();
          const managerKey = `${poolKey}_MGR`;
          const bookParams = await queryPoolBookParams(this.client, poolKey);
          const t1 = Date.now();

          const builder = buildOpenWithTPSLOps(this.dbClient, {
            poolKey,
            managerKey,
            collateral,
            leverage,
            currentPrice,
            lotSize: bookParams.lotSize,
            direction,
            tpPrice,
            slPrice,
          });

          const tx = await buildMarginTxWithPythRefresh(
            poolKey,
            this.keypair.toSuiAddress(),
            (t) => builder.ops(t),
          );
          const t2 = Date.now();

          const digest = await this.signAndExecute(tx);
          const t3 = Date.now();
          console.log(`[trade/open] bookParams=${t1-t0}ms pyth+build=${t2-t1}ms sign+exec=${t3-t2}ms total=${t3-t0}ms`);

          // Record active position
          sessionManager.setActivePosition(senderAddress, {
            poolKey,
            direction,
            collateral,
            leverage,
            entryPrice: currentPrice,
            baseQuantity: builder.baseQuantity,
            tpPrice,
            slPrice,
            tpOrderId: builder.tpOrderId,
            slOrderId: builder.slOrderId,
            openDigest: digest,
            openedAt: Date.now(),
          });

          res.json({
            success: true,
            digest,
            entryPrice: currentPrice,
            baseQuantity: builder.baseQuantity,
            tpOrderId: builder.tpOrderId,
            slOrderId: builder.slOrderId,
          });
        } catch (tradeErr) {
          // Refund on failure
          const session = sessionManager.getSession(senderAddress);
          session.balance += collateral;
          throw tradeErr;
        }
      } catch (err) {
        const msg = err instanceof Error ? err.message : String(err);
        res.status(500).json({ error: msg });
      }
    });

    // Settle TP/SL (after trigger detected)
    this.app.post('/api/trade/settle', async (req, res) => {
      try {
        const { senderAddress } = req.body;
        if (!senderAddress) {
          res.status(400).json({ error: 'Missing senderAddress' });
          return;
        }

        const session = sessionManager.getSession(senderAddress);
        const position = session.activePosition;
        if (!position) {
          res.status(400).json({ error: 'No active position' });
          return;
        }

        const managerKey = `${position.poolKey}_MGR`;

        const tx = await buildMarginTxWithPythRefresh(
          position.poolKey,
          this.keypair.toSuiAddress(),
          (t) => {
            buildSettleTPSLOps(this.dbClient, {
              poolKey: position.poolKey,
              managerKey,
              isLong: position.direction === 'long',
            })(t);
          },
        );

        const digest = await this.signAndExecute(tx);

        // Calculate approximate PnL (actual PnL determined by on-chain execution)
        // For now, use a simplified estimate — the frontend already tracks this
        sessionManager.clearPosition(senderAddress, 0);

        res.json({ success: true, digest });
      } catch (err) {
        const msg = err instanceof Error ? err.message : String(err);
        res.status(500).json({ error: msg });
      }
    });

    // Close position early
    this.app.post('/api/trade/close', async (req, res) => {
      try {
        const { senderAddress, currentPrice } = req.body;
        if (!senderAddress) {
          res.status(400).json({ error: 'Missing senderAddress' });
          return;
        }

        const session = sessionManager.getSession(senderAddress);
        const position = session.activePosition;
        if (!position) {
          res.status(400).json({ error: 'No active position' });
          return;
        }

        const t0 = Date.now();
        const managerKey = `${position.poolKey}_MGR`;

        // Use original quantity, no reduce-only (per DeepBook V3 lesson — ENotReduceOnlyOrder abort)
        const bookParams = await queryPoolBookParams(this.client, position.poolKey);
        const closeQuantity = alignToLotSize(position.baseQuantity, bookParams.lotSize);

        const tx = await buildMarginTxWithPythRefresh(
          position.poolKey,
          this.keypair.toSuiAddress(),
          (t) => {
            buildCloseEarlyOps(this.dbClient, {
              poolKey: position.poolKey,
              managerKey,
              quantity: closeQuantity,
              isLong: position.direction === 'long',
              useReduceOnly: false,
            })(t);
          },
        );

        const t1 = Date.now();
        const digest = await this.signAndExecute(tx);
        console.log(`[trade/close] build=${t1-t0}ms sign+exec=${Date.now()-t1}ms total=${Date.now()-t0}ms`);

        sessionManager.clearPosition(senderAddress, 0);

        res.json({ success: true, digest });
      } catch (err) {
        const msg = err instanceof Error ? err.message : String(err);
        res.status(500).json({ error: msg });
      }
    });

    // Resolve bet — real SUI transfer on-chain
    // WIN:  bot → user wallet (payout = stake × multiplier)
    // LOSS: bot → house address (stake)
    this.app.post('/api/bet/resolve', async (req, res) => {
      try {
        const { senderAddress, betId, result, stake, payout } = req.body;
        if (!senderAddress || !betId || !result || !stake) {
          res.status(400).json({ error: 'Missing senderAddress, betId, result, or stake' });
          return;
        }

        const isWin = result === 'win';
        const transferAmount = isWin ? (payout || stake) : stake;
        const recipient = isWin ? senderAddress : this.houseAddress;
        const rawAmount = BigInt(Math.round(transferAmount * Math.pow(10, SUI_DECIMALS)));

        // Build SUI transfer PTB
        const tx = new Transaction();
        const [coin] = tx.splitCoins(tx.gas, [rawAmount]);
        tx.transferObjects([coin], recipient);

        const digest = await this.signAndExecute(tx);

        // Record in session
        if (isWin) {
          sessionManager.recordWin(senderAddress, betId, transferAmount, digest);
          console.log(
            `[bet/WIN] tx=${digest} | $${transferAmount} → user:${senderAddress.slice(0, 10)}... | betId=${betId}`
          );
        } else {
          sessionManager.recordLoss(senderAddress, betId, stake, this.houseAddress, digest);
          console.log(
            `[bet/LOSS] tx=${digest} | $${stake} → house:${this.houseAddress.slice(0, 10)}... | betId=${betId}`
          );
        }

        res.json({
          success: true,
          digest,
          result,
          amount: transferAmount,
          recipient,
          betId,
        });
      } catch (err) {
        const msg = err instanceof Error ? err.message : String(err);
        console.error(`[bet/resolve] ERROR: ${msg}`);
        res.status(500).json({ error: msg });
      }
    });

    // Withdraw funds back to user wallet
    this.app.post('/api/withdraw', async (req, res) => {
      try {
        const { senderAddress, amount } = req.body;
        if (!senderAddress || !amount) {
          res.status(400).json({ error: 'Missing senderAddress or amount' });
          return;
        }

        sessionManager.debitWithdrawal(senderAddress, amount);

        // TODO: Build USDC transfer PTB from bot to user address
        // For hackathon, we trust the session balance tracking.
        // In production, this would be a proper on-chain transfer.
        console.log(`[withdraw] Would transfer ${amount} to ${senderAddress}`);

        res.json({ success: true, amount });
      } catch (err) {
        const msg = err instanceof Error ? err.message : String(err);
        res.status(500).json({ error: msg });
      }
    });
  }

  async start(): Promise<void> {
    // Pre-warm caches in parallel (saves ~1-2s on first trade)
    const poolKeys = getMarginPoolKeys();
    const warmStart = Date.now();
    await Promise.all([
      // Pre-warm pool book params cache
      ...poolKeys.map((key) =>
        queryPoolBookParams(this.client, key).catch((err) =>
          console.warn(`[TradeServer] Failed to warm ${key} params:`, err),
        ),
      ),
      // Start Pyth VAA background refresh (caches VAAs, refreshes every 3s)
      ...poolKeys.map((key) =>
        warmPythCache(key).catch((err) =>
          console.warn(`[TradeServer] Failed to warm Pyth for ${key}:`, err),
        ),
      ),
    ]);
    console.log(`[TradeServer] Caches warmed in ${Date.now() - warmStart}ms`);

    return new Promise((resolve) => {
      this.app.listen(this.port, () => {
        console.log(`[TradeServer] Listening on port ${this.port}`);
        console.log(`[TradeServer] Bot address: ${this.keypair.toSuiAddress()}`);
        console.log(`[TradeServer] MarginManager: ${this.marginManagerId}`);
        console.log(`[TradeServer] Network: ${getNetwork()}`);
        console.log(`[TradeServer] House: ${this.houseAddress}`);
        resolve();
      });
    });
  }
}
