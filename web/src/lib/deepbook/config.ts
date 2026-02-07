export type SuiNetwork = "testnet" | "mainnet"

export const SUI_NETWORK: SuiNetwork =
  (process.env.NEXT_PUBLIC_SUI_NETWORK as SuiNetwork) || "testnet"

// DeepBook spot package IDs per network (used by devInspect queries)
const PACKAGE_IDS: Record<SuiNetwork, string> = {
  testnet: "0xbc331f09e5c737d45f074ad2d17c3038421b3b9018699e370d88d94938c53d28",
  mainnet: "0x337f4f4f6567fcd778d5454f27c16c70e2f274cc6377ea6249ddf491482ef497",
}

export const DEEPBOOK_PACKAGE_ID = PACKAGE_IDS[SUI_NETWORK]

export const DUMMY_SENDER =
  "0x44e12ed495a913b594b5b73c5358b6a6516d4e3742f7a0dcdec12053b6b0aced"

export const FLOAT_SCALAR = 1_000_000_000n
