import { useCurrentClient } from "@mysten/dapp-kit-react";
import { useQuery } from "@tanstack/react-query";
import type { SuiJsonRpcClient } from "@mysten/sui/jsonRpc";

export function useOrders(ammPackageId: string) {
  const client = useCurrentClient() as SuiJsonRpcClient;
  return useQuery({
    queryKey: ["orders", ammPackageId],
    queryFn: () => client.queryEvents({
      query: {
        MoveEventType: `${ammPackageId}::strategy::OrderCreatedEvent`
      },
      limit: 25,
      order: "descending"
    }),
    enabled: !!ammPackageId
  });
}