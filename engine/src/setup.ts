// One-time setup script: creates the bot's MarginManager on-chain.
// Run: npx tsx src/setup.ts
//
// Requires .env.local with:
//   PRIVATE_KEY=<bot keypair base64>
//   SUI_NETWORK=testnet

import dotenv from 'dotenv';
dotenv.config({ path: '.env.local' });

import { Transaction } from '@mysten/sui/transactions';
import { SuiJsonRpcClient, getJsonRpcFullnodeUrl } from '@mysten/sui/jsonRpc';
import { Ed25519Keypair } from '@mysten/sui/keypairs/ed25519';
import { DeepBookClient } from '@mysten/deepbook-v3';
import { setNetwork, getNetwork, getMarginPoolKeys, type SuiNetwork } from './pools.js';

async function main() {
  const privateKey = process.env.PRIVATE_KEY;
  if (!privateKey) {
    console.error('Missing PRIVATE_KEY in environment');
    process.exit(1);
  }

  const network = (process.env.SUI_NETWORK || 'testnet') as SuiNetwork;
  setNetwork(network);

  const rpcUrl = process.env.RPC_URL || getJsonRpcFullnodeUrl(network);
  const client = new SuiJsonRpcClient({ url: rpcUrl, network });
  const keypair = Ed25519Keypair.fromSecretKey(privateKey);
  const address = keypair.toSuiAddress();

  console.log(`Network: ${network}`);
  console.log(`Bot address: ${address}`);
  console.log(`RPC: ${rpcUrl}`);

  // Create DeepBookClient (no margin managers yet — we're creating one)
  const dbClient = new DeepBookClient({
    client: client as unknown as ConstructorParameters<typeof DeepBookClient>[0]['client'],
    address,
    network,
  } as ConstructorParameters<typeof DeepBookClient>[0]);

  // Use DEEP_SUI as the home pool — the MarginManager type is determined by this pool
  const poolKey = process.argv[2] || 'DEEP_SUI';

  console.log(`\nCreating MarginManager for pool: ${poolKey}`);

  const tx = new Transaction();
  tx.setSenderIfNotSet(address);

  // Create margin manager with initializer
  const { manager, initializer } = dbClient.marginManager.newMarginManagerWithInitializer(poolKey)(tx);

  // Share the margin manager
  dbClient.marginManager.shareMarginManager(poolKey, manager, initializer)(tx);

  console.log('\nSigning and executing transaction...');

  const result = await client.signAndExecuteTransaction({
    transaction: tx,
    signer: keypair,
    options: { showEffects: true, showObjectChanges: true },
  });

  console.log(`Transaction digest: ${result.digest}`);

  // Extract MarginManager object ID
  let managerId = '';
  if (result.objectChanges) {
    const marginManagerObj = result.objectChanges.find(
      (c) => c.type === 'created' && 'objectType' in c && c.objectType.includes('MarginManager'),
    );
    if (marginManagerObj && 'objectId' in marginManagerObj) {
      managerId = marginManagerObj.objectId;
    }

    if (!managerId) {
      const sharedObj = result.objectChanges.find(
        (c) =>
          c.type === 'created' &&
          'owner' in c &&
          typeof c.owner === 'object' &&
          c.owner !== null &&
          'Shared' in c.owner,
      );
      if (sharedObj && 'objectId' in sharedObj) {
        managerId = sharedObj.objectId;
      }
    }
  }

  if (managerId) {
    console.log(`\nMarginManager created: ${managerId}`);
    console.log(`\nAdd this to your engine/.env.local:`);
    console.log(`MARGIN_MANAGER_ID=${managerId}`);
  } else {
    console.error('\nFailed to extract MarginManager ID from transaction result.');
    console.log('Object changes:', JSON.stringify(result.objectChanges, null, 2));
  }
}

main().catch((err) => {
  console.error('Setup failed:', err);
  process.exit(1);
});
