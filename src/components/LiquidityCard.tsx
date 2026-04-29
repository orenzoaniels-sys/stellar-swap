import { useState, useMemo, useEffect } from "react";
import { Plus, Minus, Loader2, Droplets } from "lucide-react";
import { TOKEN_A, TOKEN_B } from "../lib/config";
import {
  ammAddLiquidity,
  ammRemoveLiquidity,
  lpTotalSupply,
} from "../lib/stellar";
import { fromRaw, toRaw } from "../lib/format";
import { useToast } from "../lib/toast";
import { friendlyError } from "../lib/errors";

interface Props {
  address: string | null;
  starBalance: bigint;
  moonBalance: bigint;
  lpBalance: bigint;
  reserveA: bigint;
  reserveB: bigint;
  onDone: () => void;
}

export function LiquidityCard({
  address,
  starBalance,
  moonBalance,
  lpBalance,
  reserveA,
  reserveB,
  onDone,
}: Props) {
  const [tab, setTab] = useState<"add" | "remove">("add");
  const [amountA, setAmountA] = useState("");
  const [amountB, setAmountB] = useState("");
  const [removePct, setRemovePct] = useState(50);
  const [busy, setBusy] = useState(false);
  const [totalLp, setTotalLp] = useState(0n);
  const { push, update } = useToast();

  const poolEmpty = reserveA === 0n || reserveB === 0n;
  const userPoolPct = useMemo(() => {
    if (totalLp === 0n) return 0;
    return Number((lpBalance * 10_000n) / totalLp) / 100;
  }, [lpBalance, totalLp]);

  useEffect(() => {
    let cancelled = false;
    lpTotalSupply().then((s) => {
      if (!cancelled) setTotalLp(s);
    });
    return () => {
      cancelled = true;
    };
  }, [lpBalance, reserveA, reserveB]);

  // Auto-balance the second amount based on pool ratio
  function onAmountAChange(v: string) {
    const cleaned = v.replace(/[^0-9.]/g, "");
    setAmountA(cleaned);
    if (poolEmpty || !cleaned) {
      return;
    }
    try {
      const rawA = BigInt(toRaw(cleaned, TOKEN_A.decimals));
      if (rawA > 0n) {
        const rawB = (rawA * reserveB) / reserveA;
        setAmountB(fromRaw(rawB, TOKEN_B.decimals));
      }
    } catch {
      /* ignore */
    }
  }

  async function addLiq() {
    if (!address || busy) return;
    let rawA: bigint, rawB: bigint;
    try {
      rawA = BigInt(toRaw(amountA, TOKEN_A.decimals));
      rawB = BigInt(toRaw(amountB, TOKEN_B.decimals));
    } catch {
      push({ variant: "error", title: "Invalid amounts" });
      return;
    }
    if (rawA <= 0n || rawB <= 0n) {
      push({ variant: "error", title: "Enter both amounts" });
      return;
    }
    if (rawA > starBalance) {
      push({ variant: "error", title: `Not enough ${TOKEN_A.symbol}` });
      return;
    }
    if (rawB > moonBalance) {
      push({ variant: "error", title: `Not enough ${TOKEN_B.symbol}` });
      return;
    }
    setBusy(true);
    const id = push({
      variant: "loading",
      title: "Adding liquidity…",
      description: `${amountA} ${TOKEN_A.symbol} + ${amountB} ${TOKEN_B.symbol}`,
    });
    try {
      const res = await ammAddLiquidity(address, rawA, rawB);
      update(id, {
        variant: "success",
        title: "Liquidity added",
        description: "LP shares minted to your wallet",
        txHash: res.hash,
      });
      setAmountA("");
      setAmountB("");
      onDone();
    } catch (err) {
      update(id, {
        variant: "error",
        title: "Add liquidity failed",
        description: friendlyError(err),
      });
    } finally {
      setBusy(false);
    }
  }

  async function removeLiq() {
    if (!address || busy || lpBalance === 0n) return;
    const shares = (lpBalance * BigInt(removePct)) / 100n;
    if (shares <= 0n) {
      push({ variant: "error", title: "Nothing to remove" });
      return;
    }
    setBusy(true);
    const id = push({
      variant: "loading",
      title: `Removing ${removePct}% liquidity…`,
    });
    try {
      const res = await ammRemoveLiquidity(address, shares);
      update(id, {
        variant: "success",
        title: "Liquidity removed",
        description: "Tokens returned to your wallet",
        txHash: res.hash,
      });
      onDone();
    } catch (err) {
      update(id, {
        variant: "error",
        title: "Remove liquidity failed",
        description: friendlyError(err),
      });
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="card">
      <div className="flex items-center justify-between mb-4">
        <h2 className="font-bold text-base flex items-center gap-1.5">
          <Droplets className="w-4 h-4 text-cyan-400" /> Liquidity
        </h2>
        <div className="flex bg-slate-950/60 rounded-xl p-1 border border-border">
          <button
            onClick={() => setTab("add")}
            className={`px-3 py-1.5 text-xs font-semibold rounded-lg transition ${
              tab === "add"
                ? "bg-cyan-500/30 text-cyan-200"
                : "text-slate-400"
            }`}
          >
            <Plus className="w-3 h-3 inline -mt-0.5" /> Add
          </button>
          <button
            onClick={() => setTab("remove")}
            className={`px-3 py-1.5 text-xs font-semibold rounded-lg transition ${
              tab === "remove"
                ? "bg-rose-500/30 text-rose-200"
                : "text-slate-400"
            }`}
          >
            <Minus className="w-3 h-3 inline -mt-0.5" /> Remove
          </button>
        </div>
      </div>

      {tab === "add" ? (
        <div className="space-y-3">
          <div className="rounded-2xl bg-slate-950/50 border border-border p-3.5">
            <div className="flex items-center justify-between text-xs text-slate-400 mb-1.5">
              <span>{TOKEN_A.symbol} amount</span>
              <span>
                Balance: {fromRaw(starBalance, TOKEN_A.decimals)}
              </span>
            </div>
            <div className="flex items-center gap-2">
              <input
                value={amountA}
                onChange={(e) => onAmountAChange(e.target.value)}
                placeholder="0.0"
                inputMode="decimal"
                className="bg-transparent border-0 outline-none text-xl font-bold text-white flex-1 min-w-0"
              />
              <div className="chip !text-sm">
                {TOKEN_A.emoji} {TOKEN_A.symbol}
              </div>
            </div>
          </div>

          <div className="rounded-2xl bg-slate-950/50 border border-border p-3.5">
            <div className="flex items-center justify-between text-xs text-slate-400 mb-1.5">
              <span>{TOKEN_B.symbol} amount</span>
              <span>
                Balance: {fromRaw(moonBalance, TOKEN_B.decimals)}
              </span>
            </div>
            <div className="flex items-center gap-2">
              <input
                value={amountB}
                onChange={(e) =>
                  setAmountB(e.target.value.replace(/[^0-9.]/g, ""))
                }
                placeholder="0.0"
                inputMode="decimal"
                disabled={!poolEmpty && Boolean(amountA)}
                className="bg-transparent border-0 outline-none text-xl font-bold text-white flex-1 min-w-0 disabled:text-slate-300"
              />
              <div className="chip !text-sm">
                {TOKEN_B.emoji} {TOKEN_B.symbol}
              </div>
            </div>
          </div>

          {poolEmpty && (
            <div className="text-xs text-amber-300 bg-amber-500/10 border border-amber-500/30 rounded-lg p-2.5">
              Pool is empty — you set the initial price by depositing.
            </div>
          )}

          <button
            onClick={addLiq}
            disabled={!address || busy || !amountA || !amountB}
            className="btn-primary w-full !py-3"
          >
            {busy ? (
              <>
                <Loader2 className="w-4 h-4 animate-spin" /> Confirming…
              </>
            ) : !address ? (
              "Connect wallet"
            ) : (
              "Add liquidity"
            )}
          </button>
        </div>
      ) : (
        <div className="space-y-3">
          <div className="rounded-2xl bg-slate-950/50 border border-border p-4">
            <div className="flex items-center justify-between text-xs text-slate-400 mb-2">
              <span>Your LP balance</span>
              <span>{userPoolPct.toFixed(2)}% of pool</span>
            </div>
            <div className="text-2xl font-bold text-white">
              {fromRaw(lpBalance, 7)}
            </div>

            <div className="mt-4">
              <div className="flex items-center justify-between text-xs text-slate-400 mb-2">
                <span>Remove</span>
                <span className="text-cyan-300 font-semibold">
                  {removePct}%
                </span>
              </div>
              <input
                type="range"
                min={1}
                max={100}
                value={removePct}
                onChange={(e) => setRemovePct(Number(e.target.value))}
                className="w-full accent-cyan-500"
              />
              <div className="flex gap-2 mt-2">
                {[25, 50, 75, 100].map((p) => (
                  <button
                    key={p}
                    onClick={() => setRemovePct(p)}
                    className={`flex-1 px-2 py-1 rounded-lg text-xs font-medium ${
                      removePct === p
                        ? "bg-cyan-500/30 text-cyan-200 border border-cyan-500/50"
                        : "bg-slate-800 text-slate-300 border border-border"
                    }`}
                  >
                    {p}%
                  </button>
                ))}
              </div>
            </div>
          </div>

          {totalLp > 0n && lpBalance > 0n && (
            <div className="text-xs text-slate-400 space-y-1 px-1">
              <div className="flex justify-between">
                <span>You'll receive ~</span>
              </div>
              <div className="flex justify-between">
                <span>{TOKEN_A.symbol}</span>
                <span className="text-cyan-300">
                  {fromRaw(
                    (((lpBalance * BigInt(removePct)) / 100n) * reserveA) /
                      totalLp,
                    TOKEN_A.decimals
                  )}
                </span>
              </div>
              <div className="flex justify-between">
                <span>{TOKEN_B.symbol}</span>
                <span className="text-indigo-300">
                  {fromRaw(
                    (((lpBalance * BigInt(removePct)) / 100n) * reserveB) /
                      totalLp,
                    TOKEN_B.decimals
                  )}
                </span>
              </div>
            </div>
          )}

          <button
            onClick={removeLiq}
            disabled={!address || busy || lpBalance === 0n}
            className="btn-primary w-full !py-3 !from-rose-500 !to-pink-600"
          >
            {busy ? (
              <>
                <Loader2 className="w-4 h-4 animate-spin" /> Confirming…
              </>
            ) : lpBalance === 0n ? (
              "No LP tokens"
            ) : (
              `Remove ${removePct}%`
            )}
          </button>
        </div>
      )}
    </div>
  );
}
