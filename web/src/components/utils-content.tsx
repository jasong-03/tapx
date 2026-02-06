"use client";

import { useState } from "react";
import { toast } from "sonner";
import { ConnectButton, useCurrentAccount, useDAppKit } from "@mysten/dapp-kit-react";
import { useMutation } from "@tanstack/react-query";
import { Transaction } from "@mysten/sui/transactions";
import { VAULTS_STORAGE_KEY, VaultData } from "@/lib/vaults";

const ammPackageId = process.env.NEXT_PUBLIC_AMM_PACKAGE_ID;

export default function UtilsContent() {
  const account = useCurrentAccount({});
  const dAppKit = useDAppKit();
  const { mutate: signAndExecute } = useMutation({
    mutationFn: async (tx: Transaction) => {
      const result = await dAppKit.signAndExecuteTransaction({ transaction: tx });
      return result;
    }
  });

  const [lpTokenType, setlpTokenType] = useState("");
  const [baseAssetType, setbaseAssetType] = useState("");
  const [quoteAssetType, setquoteAssetType] = useState("");
  const [baseAssetTypePriceId, setbaseAssetTypePriceId] = useState("");
  const [quoteAssetTypePriceId, setquoteAssetTypePriceId] = useState("");
  const [treasuryCapId, setTreasuryCapId] = useState("");
  const [vaultId, setVaultId] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");

  if (!ammPackageId) {
    return (
      <div className="flex w-screen h-screen items-center justify-center">
        <p className="text-white/60 text-sm">Missing NEXT_PUBLIC_AMM_PACKAGE_ID in .env.local</p>
      </div>
    );
  }

  const createVault = async () => {
    if (!account) {
      setError("Connect your wallet first");
      return;
    }

    if (!lpTokenType || !baseAssetType || !quoteAssetType || !baseAssetTypePriceId || !quoteAssetTypePriceId || !treasuryCapId) {
      setError("All fields must be filled");
      return;
    }

    setLoading(true);
    setError("");

    const tx = new Transaction();

    const [tradeCap] = tx.moveCall({
      target: `${ammPackageId}::mm_vault::create_vault`,
      typeArguments: [
        baseAssetType,
        quoteAssetType,
        lpTokenType,
      ],
      arguments: [
        tx.object(treasuryCapId),
        tx.pure.vector("u8", Array.from(Buffer.from(baseAssetTypePriceId.slice(2), "hex"))),
        tx.pure.vector("u8", Array.from(Buffer.from(quoteAssetTypePriceId.slice(2), "hex"))),
      ],
    });

    tx.transferObjects([tradeCap], tx.pure.address(account.address));

    signAndExecute(tx, {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      onSuccess: (result: any) => {
        console.log("Vault creation successful:", result);
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        const vaultId = result.objectChanges?.find((object: any) =>
          object.type === "created" &&
          object.objectType === `${ammPackageId}::mm_vault::Vault<${baseAssetType}, ${quoteAssetType}, ${lpTokenType}>`
        )?.objectId;
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        const tradeCapId = result.objectChanges?.find((object: any) =>
          object.type === "created" &&
          object.objectType === `${ammPackageId}::mm_vault::TradeCap`
        )?.objectId;

        if (vaultId && tradeCapId) {
          setVaultId(vaultId);
          saveVault(vaultId);

          console.log("vault id:", vaultId);
          console.log("trade cap id:", tradeCapId);
        }

        toast("Vault creation successful")
      },
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      onError: (error: any) => {
        console.error("Vault creation failed:", error);
        setError(error.message);
        toast("Vault creation failed")
      },
    });
  }

  const saveVault = (vaultId: string) => {
    const existingVaults: VaultData[] = JSON.parse(localStorage.getItem(VAULTS_STORAGE_KEY) || "[]");

    const vault: VaultData = {
      id: vaultId,
      baseAssetType,
      quoteAssetType,
      lpTokenType
    }

    existingVaults.push(vault)

    localStorage.setItem(VAULTS_STORAGE_KEY, JSON.stringify(existingVaults));
    console.log("Vault saved to storage:", vault);
  }

  return (
    <div className="flex w-screen h-screen items-center justify-center">
      <div className="flex flex-col gap-2">
        <ConnectButton />
        <label htmlFor="lpTokenType" className="text-sm">
          LP Token Type
        </label>
        <input
          id="lpTokenType"
          type="text"
          onChange={(e) => setlpTokenType(e.target.value)}
          placeholder="0x..."
          disabled={loading}
          className="border rounded px-2 py-1 outline-0 text-sm"
        />
        <label htmlFor="baseAssetType" className="text-sm">
          Base Asset Type
        </label>
        <input
          id="baseAssetType"
          type="text"
          onChange={(e) => setbaseAssetType(e.target.value)}
          placeholder="0x..."
          disabled={loading}
          className="border rounded px-2 py-1 outline-0 text-sm"
        />
        <label htmlFor="quoteAssetType" className="text-sm">
          Quote Asset Type
        </label>
        <input
          id="quoteAssetType"
          type="text"
          onChange={(e) => setquoteAssetType(e.target.value)}
          placeholder="0x..."
          disabled={loading}
          className="border rounded px-2 py-1 outline-0 text-sm"
        />
        <label htmlFor="treasuryCap" className="text-sm">
          Treasury Cap Object ID
        </label>
        <input
          id="treasuryCap"
          type="text"
          onChange={(e) => setTreasuryCapId(e.target.value)}
          placeholder="0x..."
          disabled={loading}
          className="border rounded px-2 py-1 outline-0 text-sm"
        />
        <label htmlFor="baseAssetTypePriceId" className="text-sm">
          Base Asset Price ID
        </label>
        <input
          id="baseAssetTypePriceId"
          type="text"
          onChange={(e) => setbaseAssetTypePriceId(e.target.value)}
          placeholder="0x..."
          disabled={loading}
          className="border rounded px-2 py-1 outline-0 text-sm"
        />
        <label htmlFor="quoteAssetTypePriceId" className="text-sm">
          Quote Asset Price ID
        </label>
        <input
          id="quotAssetPriceId"
          type="text"
          onChange={(e) => setquoteAssetTypePriceId(e.target.value)}
          placeholder="0x..."
          disabled={loading}
          className="border rounded px-2 py-1 outline-0 text-sm"
        />

        <button
          onClick={createVault}
          disabled={loading || !account}
          className="bg-secondary border rounded px-2 py-1 text-sm hover:bg-secondary/80 disabled:hover:bg-secondary"
        >Create</button>

        {vaultId && (
          <pre>{vaultId}</pre>
        )}

        {error && (
          <div className="mt-4 py-1 text-red-400 text-sm">
            {error}
          </div>
        )}

        {!account && (
          <p className="mt-4 text-xs text-white/40">
            Please connect your wallet to continue
          </p>
        )}
      </div>
    </div>
  );
}
