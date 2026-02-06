import { useCurrentClient } from "@mysten/dapp-kit-react";
import { useQuery } from "@tanstack/react-query";
import type { SuiJsonRpcClient } from "@mysten/sui/jsonRpc";

// SUI and USDC icons as data URIs (to avoid image import issues)
const ICON_MAP: Record<string, string> = {
  SUI: "https://assets.coingecko.com/coins/images/26375/standard/sui_asset.jpeg",
  USDC: "https://assets.coingecko.com/coins/images/6319/standard/usdc.png",
};

export function useCoinMetadata(coinType: string) {
  const client = useCurrentClient() as SuiJsonRpcClient;
  const { data } = useQuery({
    queryKey: ["coin-metadata", coinType],
    queryFn: () => client.getCoinMetadata({ coinType }),
    enabled: !!coinType
  });
  if (!data) return;
  return { ...data, iconUrl: data.iconUrl || ICON_MAP[data.symbol]}
}