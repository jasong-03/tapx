"use client"

import { useEffect, useState } from "react";
import { ConnectButton, useCurrentAccount } from "@mysten/dapp-kit-react";
import { Vault } from "@/components/vault";
import { Accordion } from "@/components/ui/accordion";
import { VAULTS_STORAGE_KEY, VaultData } from "@/lib/vaults";

const ammPackageId = process.env.NEXT_PUBLIC_AMM_PACKAGE_ID;

const priceIds = [
  process.env.NEXT_PUBLIC_PRICE_ID_SUI_USD,
  process.env.NEXT_PUBLIC_PRICE_ID_DEEP_USD,
].filter((id): id is string => id !== undefined);

export default function HomeContent() {
  const currentAccount = useCurrentAccount({});
  const [vaults, setVaults] = useState<VaultData[]>([]);

  useEffect(() => {
    const storedVaults = localStorage.getItem(VAULTS_STORAGE_KEY);
    if (storedVaults) {
      setVaults(JSON.parse(storedVaults));
    }
  }, []);

  if (!ammPackageId || priceIds.length !== 2) {
    return (
      <div className="w-screen h-screen flex items-center justify-center">
        <p className="text-white/60 text-sm">Missing environment variables. Set NEXT_PUBLIC_AMM_PACKAGE_ID and price IDs in .env.local</p>
      </div>
    );
  }

  return (
    <div className="w-screen h-screen flex justify-center p-16">
      <div className="w-4/5 min-w-3xl flex pb-6 flex-col h-full justify-center border rounded-md">
        <div className="h-6 flex px-4 justify-between items-center bg-primary-foreground rounded-t text-xs text-foreground">
          <div className="font-medium text-white/90">{currentAccount ? currentAccount.address : "null"}</div>
          <ConnectButton />
        </div>
        <div className="flex justify-center">
          <pre className="pt-4 pb-8 text-green-500">
            {
              String.raw`   ___  ___________  __  ______   __ _________  ` + "\n" +
              String.raw`  / _ \/ __/ __/ _ \/  |/  / _ | / //_/ __/ _ \ ` + "\n" +
              String.raw` / // / _// _// ___/ /|_/ / __ |/ ,< / _// , _/ ` + "\n" +
              String.raw`/____/___/___/_/  /_/  /_/_/ |_/_/|_/___/_/|_|  `
            }
        </pre>
        </div>
        <div className="flex flex-col flex-1 mx-8 border rounded-md p-4 gap-4 bg-primary-foreground shadow overflow-y-auto">
          <Accordion type="single" collapsible>
            {vaults.map(vault =>
              <Vault
                key={vault.id}
                ammPackageId={ammPackageId}
                priceIds={priceIds}
                vaultId={vault.id}
                baseAssetType={vault.baseAssetType}
                quoteAssetType={vault.quoteAssetType}
                lpTokenType={vault.lpTokenType}
              />
            )}
          </Accordion>
        </div>
      </div>
    </div>
  );
}
