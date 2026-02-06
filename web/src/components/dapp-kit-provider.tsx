"use client"

import { useRef } from "react";
import { createDAppKit, DAppKitProvider, type DAppKit } from "@mysten/dapp-kit-react";
import { SuiJsonRpcClient, getJsonRpcFullnodeUrl } from "@mysten/sui/jsonRpc";
import { SUI_NETWORK } from "@/lib/deepbook/config";

type AppDAppKit = DAppKit<["testnet", "mainnet"], SuiJsonRpcClient>;

function makeDAppKit(): AppDAppKit {
	return createDAppKit({
		networks: ["testnet", "mainnet"] as const,
		defaultNetwork: SUI_NETWORK,
		createClient(network) {
			return new SuiJsonRpcClient({
				url: getJsonRpcFullnodeUrl(network),
				network
			});
		},
	});
}

declare module "@mysten/dapp-kit-react" {
	interface Register {
		dAppKit: AppDAppKit;
	}
}

export const DAppKitProviderWrapper = ({ children }: { children: React.ReactNode }) => {
	const dAppKitRef = useRef<AppDAppKit | null>(null);
	if (!dAppKitRef.current) {
		dAppKitRef.current = makeDAppKit();
	}

	return (
		<DAppKitProvider dAppKit={dAppKitRef.current}>
			{children}
		</DAppKitProvider>
	);
};
