import { Transaction, coinWithBalance } from '@mysten/sui/transactions';
import type { SuiJsonRpcClient } from '@mysten/sui/jsonRpc';

const DEEPBOOK_PKG = '0x2c8d603bc51326b8c13cef9dd07031a408a48dddb541963c8e04b1a1af5f7cf3';

// BalanceManager module type
const BALANCE_MANAGER_TYPE = `${DEEPBOOK_PKG}::balance_manager::BalanceManager`;

/**
 * Query for existing BalanceManager objects owned by sender
 * Returns objectId if found, null otherwise
 */
export async function getOrCreateBalanceManager(
  client: SuiJsonRpcClient,
  sender: string
): Promise<string | null> {
  try {
    const objects = await client.getOwnedObjects({
      owner: sender,
      filter: {
        StructType: BALANCE_MANAGER_TYPE,
      },
      options: {
        showContent: true,
      },
    });

    if (objects.data.length > 0 && objects.data[0].data) {
      return objects.data[0].data.objectId;
    }

    return null;
  } catch (error) {
    console.error('Error querying BalanceManager:', error);
    return null;
  }
}

/**
 * Create a new BalanceManager object
 * Returns the transaction result that can be used for subsequent operations
 */
export function createBalanceManagerTx(tx: Transaction) {
  const balanceManager = tx.moveCall({
    target: `${DEEPBOOK_PKG}::balance_manager::new`,
    arguments: [],
  });

  return balanceManager;
}

/**
 * Deposit coins into a BalanceManager
 */
export function depositToBalanceManager(
  tx: Transaction,
  balanceManagerId: string | ReturnType<typeof tx.moveCall>,
  coinType: string,
  amount: bigint
) {
  // Create coin to deposit
  const coin = coinWithBalance({
    type: coinType,
    balance: amount,
  });

  const balanceManagerArg =
    typeof balanceManagerId === 'string'
      ? tx.object(balanceManagerId)
      : balanceManagerId;

  tx.moveCall({
    target: `${DEEPBOOK_PKG}::balance_manager::deposit`,
    typeArguments: [coinType],
    arguments: [balanceManagerArg, tx.object(coin)],
  });
}

/**
 * Withdraw coins from a BalanceManager
 */
export function withdrawFromBalanceManager(
  tx: Transaction,
  balanceManagerId: string,
  coinType: string,
  amount: bigint,
  recipient: string
) {
  const [coin] = tx.moveCall({
    target: `${DEEPBOOK_PKG}::balance_manager::withdraw`,
    typeArguments: [coinType],
    arguments: [tx.object(balanceManagerId), tx.pure.u64(amount)],
  });

  tx.transferObjects([coin], recipient);
}

/**
 * Get the balance of a specific coin type in the BalanceManager
 */
export async function getBalanceManagerBalance(
  client: SuiJsonRpcClient,
  balanceManagerId: string,
  coinType: string
): Promise<bigint> {
  try {
    const result = await client.getDynamicFieldObject({
      parentId: balanceManagerId,
      name: {
        type: '0x1::type_name::TypeName',
        value: {
          name: coinType,
        },
      },
    });

    if (result.data?.content && 'fields' in result.data.content) {
      const fields = result.data.content.fields as { balance?: string };
      return BigInt(fields.balance || '0');
    }

    return BigInt(0);
  } catch {
    return BigInt(0);
  }
}
