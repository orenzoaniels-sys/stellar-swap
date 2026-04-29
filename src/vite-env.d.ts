/// <reference types="vite/client" />

interface ImportMetaEnv {
  readonly VITE_NETWORK_PASSPHRASE?: string;
  readonly VITE_RPC_URL?: string;
  readonly VITE_TOKEN_A_ID?: string;
  readonly VITE_TOKEN_B_ID?: string;
  readonly VITE_LP_TOKEN_ID?: string;
  readonly VITE_AMM_ID?: string;
}

interface ImportMeta {
  readonly env: ImportMetaEnv;
}
