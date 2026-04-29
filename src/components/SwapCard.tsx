import { useEffect, useMemo, useState } from "react";
import { ArrowDownUp, Loader2, Settings, Zap } from "lucide-react";
import { TOKEN_A, TOKEN_B } from "../lib/config";
import { ammQuote, ammSwap } from "../lib/stellar";
import { fromRaw, toRaw } from "../lib/format";
import { useToast } from "../lib/toast";
import { friendlyError } from "../lib/errors";

interface Props {
  address: string | null;
  starBalance: bigint;
  moonBalance: bigint;
  reserveA: bigint;
  reserveB: bigint;
  onDone: () => void;
}

export function SwapCard({
  address,
  starBalance,
  moonBalance,
  reserveA,
  reserveB,
  onDone,
}: Props) {
  const [aToB, setAToB] = useState(true);
  const [amountIn, setAmountIn] = useState("");
  const [quote, setQuote] = useState(0n);
  const [busy, setBusy] = useState(false);
  const [slippage, setSlippage] = useState(0.5); // %
  const [showSettings, setShowSettings] = useState(false);
  const { push, update } = useToast();

  const inToken = aToB ? TOKEN_A : TOKEN_B;
  const outToken = aToB ? TOKEN_B : TOKEN_A;
  const inBalance = aToB ? starBalance : moonBalance;
  const poolEmpty = reserveA === 0n || reserveB === 0n;

  const rawIn = useMemo(() => {
    try {
      return BigInt(toRaw(amountIn || "0", inToken.decimals));
    } catch {
      return 0n;
    }
  }, [amountIn, inToken.decimals]);

  // Debounced quote fetch
  useEffect(() => {
    if (rawIn <= 0n || poolEmpty) {
      setQuote(0n);
      return;
    }
    let cancelled = false;
    const t = setTimeout(async () => {
      const q = await ammQuote(aToB, rawIn);
      if (!cancelled) setQuote(q);
    }, 250);
    return () => {
      cancelled = true;
      clearTimeout(t);
    };
  }, [rawIn, aToB, poolEmpty]);

  const minOut = useMemo(() => {
    if (quote === 0n) return 0n;
    const bps = BigInt(Math.round(slippage * 100));
    return (quote * (10_000n - bps)) / 10_000n;
  }, [quote, slippage]);

  // Price impact: how much worse than the spot rate is the executed price?
  const priceImpactPct = useMemo(() => {
    if (rawIn === 0n || reserveA === 0n || reserveB === 0n || quote === 0n)
      return 0;
    const reserveIn = aToB ? reserveA : reserveB;
    const reserveOut = aToB ? reserveB : reserveA;
    const spotOut = (rawIn * reserveOut) / reserveIn;
    if (spotOut === 0n) return 0;
    const impactBig = ((spotOut - quote) * 10_000n) / spotOut;
    return Number(impactBig) / 100;
  }, [rawIn, quote, reserveA, reserveB, aToB]);

  function flip() {
    setAToB((p) => !p);
    setAmountIn("");
    setQuote(0n);
  }

  async function doSwap() {
    if (!address || busy || rawIn <= 0n || quote <= 0n) return;
    if (rawIn > inBalance) {
      push({
        variant: "error",
        title: "Insufficient balance",
        description: `Need ${fromRaw(rawIn, inToken.decimals)} ${inToken.symbol}`,
      });
      return;
    }
    setBusy(true);
    const id = push({
      variant: "loading",
      title: "Swapping…",
      description: `${fromRaw(rawIn, inToken.decimals)} ${inToken.symbol} → ${fromRaw(quote, outToken.decimals)} ${outToken.symbol}`,
    });
    try {
      const res = await ammSwap(address, aToB, rawIn, minOut);
      update(id, {
        variant: "success",
        title: "Swap complete",
        description: `Received ~${fromRaw(quote, outToken.decimals)} ${outToken.symbol}`,
        txHash: res.hash,
      });
      setAmountIn("");
      setQuote(0n);
      onDone();
    } catch (err) {
      update(id, {
        variant: "error",
        title: "Swap failed",
        description: friendlyError(err),
      });
    } finally {
      setBusy(false);
    }
  }

  function setMax() {
    setAmountIn(fromRaw(inBalance, inToken.decimals));
  }

  return (
    <div className="card relative">
      <div className="flex items-center justify-between mb-4">
        <h2 className="font-bold text-base flex items-center gap-1.5">
          <Zap className="w-4 h-4 text-cyan-400" /> Swap
        </h2>
        <button
          onClick={() => setShowSettings((v) => !v)}
          className="text-slate-400 hover:text-white"
          aria-label="Settings"
        >
          <Settings className="w-4 h-4" />
        </button>
      </div>

      {showSettings && (
        <div className="mb-3 p-3 rounded-xl bg-slate-950/50 border border-border">
          <div className="text-xs text-slate-400 mb-2">Slippage tolerance</div>
          <div className="flex gap-2">
            {[0.1, 0.5, 1.0].map((p) => (
              <button
                key={p}
                onClick={() => setSlippage(p)}
                className={`px-2.5 py-1 rounded-lg text-xs font-medium ${
                  slippage === p
                    ? "bg-cyan-500/30 text-cyan-200 border border-cyan-500/50"
                    : "bg-slate-800 text-slate-300 border border-border"
                }`}
              >
                {p}%
              </button>
            ))}
            <input
              type="number"
              step="0.1"
              min="0.05"
              max="50"
              value={slippage}
              onChange={(e) =>
                setSlippage(Math.max(0.05, Number(e.target.value)))
              }
              className="input !py-1 !text-xs w-20"
            />
            <span className="text-xs text-slate-500 self-center">%</span>
          </div>
        </div>
      )}

      {/* Input row */}
      <div className="rounded-2xl bg-slate-950/50 border border-border p-3.5">
        <div className="flex items-center justify-between text-xs text-slate-400 mb-1.5">
          <span>You pay</span>
          <button
            onClick={setMax}
            className="hover:text-cyan-300 transition disabled:cursor-default disabled:opacity-50"
            disabled={!address}
          >
            Balance: {fromRaw(inBalance, inToken.decimals)} {inToken.symbol}
          </button>
        </div>
        <div className="flex items-center gap-2">
          <input
            value={amountIn}
            onChange={(e) =>
              setAmountIn(e.target.value.replace(/[^0-9.]/g, ""))
            }
            placeholder="0.0"
            inputMode="decimal"
            className="bg-transparent border-0 outline-none text-2xl font-bold text-white flex-1 min-w-0"
          />
          <div className="chip !text-sm whitespace-nowrap">
            {inToken.emoji} {inToken.symbol}
          </div>
        </div>
      </div>

      {/* Flip button */}
      <div className="flex justify-center -my-2 relative z-10">
        <button
          onClick={flip}
          className="w-9 h-9 rounded-xl bg-slate-800 border border-border hover:bg-slate-700 grid place-items-center transition"
          aria-label="Flip"
        >
          <ArrowDownUp className="w-4 h-4 text-cyan-300" />
        </button>
      </div>

      {/* Output row */}
      <div className="rounded-2xl bg-slate-950/50 border border-border p-3.5">
        <div className="flex items-center justify-between text-xs text-slate-400 mb-1.5">
          <span>You receive (estimated)</span>
        </div>
        <div className="flex items-center gap-2">
          <div className="text-2xl font-bold text-white flex-1 truncate">
            {quote > 0n ? fromRaw(quote, outToken.decimals) : "0.0"}
          </div>
          <div className="chip !text-sm whitespace-nowrap">
            {outToken.emoji} {outToken.symbol}
          </div>
        </div>
      </div>

      {/* Stats row */}
      {quote > 0n && (
        <div className="mt-3 text-xs space-y-1 text-slate-400">
          <div className="flex justify-between">
            <span>Min received</span>
            <span className="text-slate-200">
              {fromRaw(minOut, outToken.decimals)} {outToken.symbol}
            </span>
          </div>
          <div className="flex justify-between">
            <span>Price impact</span>
            <span
              className={
                priceImpactPct > 5
                  ? "text-rose-300"
                  : priceImpactPct > 1
                    ? "text-amber-300"
                    : "text-emerald-300"
              }
            >
              {priceImpactPct.toFixed(2)}%
            </span>
          </div>
          <div className="flex justify-between">
            <span>Fee (0.30%)</span>
            <span className="text-slate-200">
              {fromRaw((rawIn * 30n) / 10_000n, inToken.decimals)}{" "}
              {inToken.symbol}
            </span>
          </div>
        </div>
      )}

      <button
        onClick={doSwap}
        disabled={
          !address || busy || rawIn <= 0n || quote <= 0n || rawIn > inBalance
        }
        className="btn-primary w-full mt-4 !py-3 text-base"
      >
        {busy ? (
          <>
            <Loader2 className="w-4 h-4 animate-spin" /> Swapping…
          </>
        ) : !address ? (
          "Connect wallet"
        ) : poolEmpty ? (
          "Pool is empty"
        ) : rawIn <= 0n ? (
          "Enter amount"
        ) : rawIn > inBalance ? (
          `Insufficient ${inToken.symbol}`
        ) : (
          "Swap"
        )}
      </button>
    </div>
  );
}
