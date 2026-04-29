export const NETWORK_PASSPHRASE =
  import.meta.env.VITE_NETWORK_PASSPHRASE ?? "Test SDF Network ; September 2015";

export const RPC_URL =
  import.meta.env.VITE_RPC_URL ?? "https://soroban-testnet.stellar.org";

export const TOKEN_A_ID = import.meta.env.VITE_TOKEN_A_ID ?? "";
export const TOKEN_B_ID = import.meta.env.VITE_TOKEN_B_ID ?? "";
export const LP_TOKEN_ID = import.meta.env.VITE_LP_TOKEN_ID ?? "";
export const AMM_ID = import.meta.env.VITE_AMM_ID ?? "";

export const TOKEN_A = {
  id: TOKEN_A_ID,
  name: "Stellar Star",
  symbol: "STAR",
  decimals: 7,
  color: "from-cyan-400 to-sky-500",
  emoji: "✦",
} as const;

export const TOKEN_B = {
  id: TOKEN_B_ID,
  name: "Stellar Moon",
  symbol: "MOON",
  decimals: 7,
  color: "from-indigo-400 to-purple-500",
  emoji: "◗",
} as const;

export const LP_TOKEN = {
  id: LP_TOKEN_ID,
  symbol: "S-LP",
  decimals: 7,
} as const;

export const EXPLORER = "https://stellar.expert/explorer/testnet";

export function isConfigured() {
  return Boolean(TOKEN_A_ID && TOKEN_B_ID && LP_TOKEN_ID && AMM_ID);
}
