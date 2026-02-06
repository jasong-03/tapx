"use client"

import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import dynamic from "next/dynamic";

const queryClient = new QueryClient();

// Dynamically import the DAppKit provider to avoid SSR issues
const DAppKitProviderWrapper = dynamic(
	() => import("./dapp-kit-provider").then((mod) => mod.DAppKitProviderWrapper),
	{ ssr: false }
);

export const Providers = ({ children }: { children: React.ReactNode }) => {
	return (
		<QueryClientProvider client={queryClient}>
			<DAppKitProviderWrapper>
				{children}
			</DAppKitProviderWrapper>
		</QueryClientProvider>
	);
}