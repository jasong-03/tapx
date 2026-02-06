import { useCurrentAccount, useCurrentClient } from "@mysten/dapp-kit-react";
import { useQuery } from "@tanstack/react-query";
import type { SuiJsonRpcClient } from "@mysten/sui/jsonRpc";

export function useUserBalance(coinType: string) {
  const currentAccount = useCurrentAccount();
  const client = useCurrentClient() as SuiJsonRpcClient;

  return useQuery({
    queryKey: ["user-balance", currentAccount?.address, coinType],
    queryFn: () => client.getBalance({
      owner: currentAccount?.address || "",
      coinType: coinType
    }),
    enabled: !!currentAccount?.address
  });
}