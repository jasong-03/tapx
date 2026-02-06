"use client"

import { createDAppKit, DAppKitProvider, type DAppKit } from "@mysten/dapp-kit-react";
import { SuiJsonRpcClient, getJsonRpcFullnodeUrl } from "@mysten/sui/jsonRpc";

type AppDAppKit = DAppKit<["testnet", "mainnet"], SuiJsonRpcClient>;

const dAppKit: AppDAppKit = createDAppKit({
	networks: ["testnet", "mainnet"] as const,
	defaultNetwork: (process.env.NEXT_PUBLIC_SUI_NETWORK as "testnet" | "mainnet") || "mainnet",
	createClient(network) {
		return new SuiJsonRpcClient({
			url: getJsonRpcFullnodeUrl(network),
			network
		});
	},
});

declare module "@mysten/dapp-kit-react" {
	interface Register {
		dAppKit: AppDAppKit;
	}
}

export const DAppKitProviderWrapper = ({ children }: { children: React.ReactNode }) => {
	return (
		<DAppKitProvider dAppKit={dAppKit}>
			{children}
		</DAppKitProvider>
	);
};
