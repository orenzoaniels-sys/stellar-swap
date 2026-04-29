import {
  rpc,
  Contract,
  TransactionBuilder,
  BASE_FEE,
  Address,
  Account,
  Keypair,
  nativeToScVal,
  scValToNative,
  xdr,
} from "@stellar/stellar-sdk";
import {
  NETWORK_PASSPHRASE,
  RPC_URL,
  TOKEN_A_ID,
  TOKEN_B_ID,
  LP_TOKEN_ID,
  AMM_ID,
} from "./config";
import { signXdr } from "./wallet";

export const server = new rpc.Server(RPC_URL, {
  allowHttp: RPC_URL.startsWith("http://"),
});

// Read simulations need a syntactically-valid public key, not a real funded account.
const DUMMY = Keypair.random().publicKey();

async function simulate(
  contractId: string,
  method: string,
  args: xdr.ScVal[] = []
) {
  const tx = new TransactionBuilder(new Account(DUMMY, "0"), {
    fee: BASE_FEE,
    networkPassphrase: NETWORK_PASSPHRASE,
  })
    .addOperation(new Contract(contractId).call(method, ...args))
    .setTimeout(60)
    .build();
  const sim = await server.simulateTransaction(tx);
  if (rpc.Api.isSimulationError(sim)) throw new Error(sim.error);
  if (!("result" in sim) || !sim.result) throw new Error("No simulation result");
  return scValToNative(sim.result.retval);
}

async function sendTx(
  caller: string,
  contractId: string,
  method: string,
  args: xdr.ScVal[]
): Promise<{ hash: string; result: unknown }> {
  const account = await server.getAccount(caller);
  const built = new TransactionBuilder(account, {
    fee: BASE_FEE,
    networkPassphrase: NETWORK_PASSPHRASE,
  })
    .addOperation(new Contract(contractId).call(method, ...args))
    .setTimeout(60)
    .build();
  const prepared = await server.prepareTransaction(built);
  const signed = await signXdr(prepared.toXDR());
  const tx = TransactionBuilder.fromXDR(signed, NETWORK_PASSPHRASE);
  const send = await server.sendTransaction(tx);
  if (send.status === "ERROR") {
    throw new Error(`Send failed: ${JSON.stringify(send.errorResult ?? send)}`);
  }
  for (let i = 0; i < 30; i++) {
    await new Promise((r) => setTimeout(r, 1500));
    const status = await server.getTransaction(send.hash);
    if (status.status === "SUCCESS") {
      let result: unknown = null;
      try {
        const ret = (status as { returnValue?: xdr.ScVal }).returnValue;
        if (ret) result = scValToNative(ret);
      } catch {
        /* ignore */
      }
      return { hash: send.hash, result };
    }
    if (status.status === "FAILED")
      throw new Error("Transaction failed on-chain");
  }
  throw new Error("Transaction timed out");
}

const addr = (a: string) => new Address(a).toScVal();
const i128 = (n: bigint) => nativeToScVal(n, { type: "i128" });
const bool = (b: boolean) => nativeToScVal(b, { type: "bool" });

// ─── Token reads (works for STAR, MOON, or LP) ─────────────────────────
export async function tokenSymbol(id: string): Promise<string> {
  if (!id) return "";
  return String(await simulate(id, "symbol"));
}
export async function tokenBalance(id: string, who: string): Promise<bigint> {
  if (!id) return 0n;
  return BigInt(await simulate(id, "balance", [addr(who)]));
}
export async function tokenClaimed(id: string, who: string): Promise<boolean> {
  if (!id) return false;
  return Boolean(await simulate(id, "claimed", [addr(who)]));
}
export async function lpTotalSupply(): Promise<bigint> {
  if (!LP_TOKEN_ID) return 0n;
  return BigInt(await simulate(LP_TOKEN_ID, "total_supply"));
}

// ─── Token writes ──────────────────────────────────────────────────────
export async function tokenFaucet(id: string, user: string) {
  return sendTx(user, id, "faucet", [addr(user)]);
}

// ─── AMM reads ─────────────────────────────────────────────────────────
export async function ammReserves(): Promise<[bigint, bigint]> {
  if (!AMM_ID) return [0n, 0n];
  const r = (await simulate(AMM_ID, "reserves")) as [bigint, bigint];
  return [BigInt(r[0]), BigInt(r[1])];
}
export async function ammFeeBps(): Promise<number> {
  if (!AMM_ID) return 30;
  return Number(await simulate(AMM_ID, "fee_bps"));
}
export async function ammTotalSwaps(): Promise<number> {
  if (!AMM_ID) return 0;
  return Number(await simulate(AMM_ID, "total_swaps"));
}
export async function ammQuote(aToB: boolean, amountIn: bigint): Promise<bigint> {
  if (!AMM_ID || amountIn <= 0n) return 0n;
  try {
    return BigInt(await simulate(AMM_ID, "quote_swap", [bool(aToB), i128(amountIn)]));
  } catch {
    return 0n;
  }
}

// ─── AMM writes ────────────────────────────────────────────────────────
export async function ammSwap(
  user: string,
  aToB: boolean,
  amountIn: bigint,
  minOut: bigint
) {
  return sendTx(user, AMM_ID, "swap", [
    addr(user),
    bool(aToB),
    i128(amountIn),
    i128(minOut),
  ]);
}

export async function ammAddLiquidity(
  user: string,
  amountA: bigint,
  amountB: bigint
) {
  return sendTx(user, AMM_ID, "add_liquidity", [
    addr(user),
    i128(amountA),
    i128(amountB),
  ]);
}

export async function ammRemoveLiquidity(user: string, shares: bigint) {
  return sendTx(user, AMM_ID, "remove_liquidity", [addr(user), i128(shares)]);
}

// Re-export ids for convenience
export { TOKEN_A_ID, TOKEN_B_ID, LP_TOKEN_ID, AMM_ID };
