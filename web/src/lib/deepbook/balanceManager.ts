import { Transaction } from '@mysten/sui/transactions';
import type { DeepBookClient } from '@mysten/deepbook-v3';

/**
 * Create and share a new BalanceManager using the SDK.
 */
export function buildCreateBalanceManagerTx(
  dbClient: DeepBookClient,
  sender: string,
): Transaction {
  const tx = new Transaction();
  tx.setSenderIfNotSet(sender);
  dbClient.balanceManager.createAndShareBalanceManager()(tx);
  return tx;
}

/**
 * Deposit coins into a BalanceManager using the SDK.
 * @param managerKey - Key identifying the balance manager in the SDK config
 * @param coinKey - Key identifying the coin type (e.g., 'SUI', 'DEEP', 'USDC')
 * @param amount - Human-readable amount to deposit
 */
export function buildDepositTx(
  dbClient: DeepBookClient,
  params: {
    managerKey: string;
    coinKey: string;
    amount: number;
    sender: string;
  },
): Transaction {
  const tx = new Transaction();
  tx.setSenderIfNotSet(params.sender);
  dbClient.balanceManager.depositIntoManager(
    params.managerKey,
    params.coinKey,
    params.amount,
  )(tx);
  return tx;
}

/**
 * Withdraw coins from a BalanceManager using the SDK.
 * @param managerKey - Key identifying the balance manager in the SDK config
 * @param coinKey - Key identifying the coin type
 * @param amount - Human-readable amount to withdraw
 * @param recipient - Address to send withdrawn coins to
 */
export function buildWithdrawTx(
  dbClient: DeepBookClient,
  params: {
    managerKey: string;
    coinKey: string;
    amount: number;
    recipient: string;
    sender: string;
  },
): Transaction {
  const tx = new Transaction();
  tx.setSenderIfNotSet(params.sender);
  dbClient.balanceManager.withdrawFromManager(
    params.managerKey,
    params.coinKey,
    params.amount,
    params.recipient,
  )(tx);
  return tx;
}

/**
 * Check balance of a specific coin in a BalanceManager using the SDK.
 * Returns human-readable balance.
 */
export async function getBalanceManagerBalance(
  dbClient: DeepBookClient,
  managerKey: string,
  coinKey: string,
): Promise<{ coinType: string; balance: number }> {
  return dbClient.checkManagerBalance(managerKey, coinKey);
}
