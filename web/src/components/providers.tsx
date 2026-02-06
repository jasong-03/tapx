"use client"

import { useState, useEffect, type ReactNode } from "react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";

const queryClient = new QueryClient();

function LazyDAppKitProvider({ children }: { children: ReactNode }) {
	const [Provider, setProvider] = useState<React.ComponentType<{ children: ReactNode }> | null>(null);

	useEffect(() => {
		import("./dapp-kit-provider").then((mod) => {
			setProvider(() => mod.DAppKitProviderWrapper);
		});
	}, []);

	if (!Provider) return <>{children}</>;

	return <Provider>{children}</Provider>;
}

export const Providers = ({ children }: { children: ReactNode }) => {
	return (
		<QueryClientProvider client={queryClient}>
			<LazyDAppKitProvider>
				{children}
			</LazyDAppKitProvider>
		</QueryClientProvider>
	);
}
