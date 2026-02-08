
import { MarketMaker } from "./marketMaker.js";
import { TradeServer } from "./server.js";
import { setNetwork, type SuiNetwork } from "./pools.js";
import { Vault } from "./types.js";

const vaults: Vault[] = [{
  "baseAssetType": "0xdeeb7a4662eec9f2f3def03fb937a663dddaa2e215b8078a284d026b7946c270::deep::DEEP",
  "id": "0x83a4c6f45b8b4088902c0dcea8cab9c9440c3145e3b6438614f7d05daad08e9e",
  "lpTokenType": "0x9d38bc4d25492d7bf10afdedaf67450de14ec4faa6c89131aa3e4f5b2f00e82b::drip::DRIP",
  "quoteAssetType": "0x2::sui::SUI"
}]

async function main() {
  process.on("SIGINT", () => {
    console.log("Shutting down...");
    process.exit(0);
  });

  // Start trade API server if configured
  const marginManagerId = process.env.MARGIN_MANAGER_ID;
  const privateKey = process.env.PRIVATE_KEY;

  if (marginManagerId && privateKey) {
    const network = (process.env.SUI_NETWORK || 'testnet') as SuiNetwork;
    setNetwork(network);

    const server = new TradeServer({
      privateKey,
      marginManagerId,
      houseAddress: process.env.HOUSE_ADDRESS || '0xdead351072a02c063158bdb1e9c5c1ddfc1337ff58e89a3d0625e0c104dbb35c',
      port: parseInt(process.env.API_PORT || '3001'),
      rpcUrl: process.env.RPC_URL,
    });
    await server.start();
    console.log("Trade API server started");
  } else {
    console.log("MARGIN_MANAGER_ID not set, skipping trade API server");
  }

  // Start market maker only if AMM config is present
  if (process.env.AMM_PACKAGE_ID) {
    const marketMaker = new MarketMaker(vaults);
    await marketMaker.run();
  } else {
    console.log("AMM_PACKAGE_ID not set, skipping market maker");
    // Keep process alive for the trade server
    await new Promise(() => {});
  }
}

main().catch(console.error);
