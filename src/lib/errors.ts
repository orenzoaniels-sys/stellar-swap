/**
 * Maps contract error codes to friendly UI messages.
 * Token / LP-token / AMM all share the same numeric prefix per crate.
 */

const TOKEN_ERRORS: Record<number, string> = {
  1: "Token already initialized",
  2: "Token not initialized",
  3: "Only the admin can perform this action",
  4: "Insufficient token balance",
  5: "Invalid amount (must be positive)",
  6: "You have already claimed from this faucet",
  7: "Arithmetic overflow",
};

const AMM_ERRORS: Record<number, string> = {
  1: "Pool already initialized",
  2: "Pool not initialized",
  3: "Invalid amount (must be positive)",
  4: "Insufficient liquidity in pool",
  5: "Slippage exceeded — try increasing tolerance",
  6: "Pool is empty — be the first to add liquidity",
  7: "Arithmetic overflow",
  8: "Unbalanced deposit — match the existing pool ratio",
};

export function friendlyError(raw: unknown): string {
  const msg = raw instanceof Error ? raw.message : String(raw);

  // Soroban contract errors typically appear as "Error(Contract, #N)"
  const ammMatch = msg.match(/Error\(Contract,\s*#(\d+)\)/);
  if (ammMatch) {
    const code = Number(ammMatch[1]);
    return AMM_ERRORS[code] ?? TOKEN_ERRORS[code] ?? `Contract error #${code}`;
  }
  if (msg.includes("cancelled") || msg.includes("Closed")) {
    return "Wallet popup closed";
  }
  if (msg.includes("insufficient")) return "Insufficient balance / fee";
  if (msg.length > 200) return msg.slice(0, 200) + "…";
  return msg;
}
