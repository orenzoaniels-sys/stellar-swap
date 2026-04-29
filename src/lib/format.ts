export function shortenAddr(addr: string, head = 4, tail = 4): string {
  if (!addr) return "";
  if (addr.length <= head + tail + 2) return addr;
  return `${addr.slice(0, head)}\u2026${addr.slice(-tail)}`;
}

const ONE_E7 = 10_000_000n;

/** Format a raw i128 (string or bigint) into a human string with given decimals. */
export function fromRaw(raw: string | bigint | number, decimals = 7): string {
  let big: bigint;
  try {
    big = typeof raw === "bigint" ? raw : BigInt(raw);
  } catch {
    return "0";
  }
  const negative = big < 0n;
  if (negative) big = -big;
  const divisor = 10n ** BigInt(decimals);
  const whole = big / divisor;
  const frac = big % divisor;
  let fracStr = frac.toString().padStart(decimals, "0").replace(/0+$/, "");
  if (decimals > 4 && fracStr.length > 4) fracStr = fracStr.slice(0, 4);
  const sign = negative ? "-" : "";
  return fracStr.length > 0 ? `${sign}${whole}.${fracStr}` : `${sign}${whole}`;
}

/** Convert human number (e.g. "12.5") to raw i128 string scaled by decimals. */
export function toRaw(human: string, decimals = 7): string {
  if (!human) return "0";
  const trimmed = human.trim();
  const negative = trimmed.startsWith("-");
  const abs = negative ? trimmed.slice(1) : trimmed;
  const [whole = "0", frac = ""] = abs.split(".");
  const fracPadded = (frac + "0".repeat(decimals)).slice(0, decimals);
  const raw = BigInt(whole) * 10n ** BigInt(decimals) + BigInt(fracPadded || "0");
  return (negative ? -raw : raw).toString();
}

export function formatPrice(reserveOut: bigint, reserveIn: bigint): string {
  if (reserveIn === 0n) return "—";
  const ratio = (reserveOut * ONE_E7) / reserveIn;
  return fromRaw(ratio.toString(), 7);
}

export function pct(num: number): string {
  if (!isFinite(num)) return "0%";
  return `${(num * 100).toFixed(2)}%`;
}
