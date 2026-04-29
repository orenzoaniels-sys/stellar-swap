import { useCallback, useEffect, useState } from "react";
import { AlertTriangle, ExternalLink } from "lucide-react";
import { WalletBar } from "./components/WalletBar";
import { PoolStats } from "./components/PoolStats";
import { FaucetCards } from "./components/FaucetCards";
import { SwapCard } from "./components/SwapCard";
import { LiquidityCard } from "./components/LiquidityCard";
import { ToastProvider } from "./lib/toast";
import { restoreWallet } from "./lib/wallet";
import {
  ammReserves,
  ammTotalSwaps,
  tokenBalance,
  tokenClaimed,
  TOKEN_A_ID,
  TOKEN_B_ID,
  LP_TOKEN_ID,
  AMM_ID,
} from "./lib/stellar";
import { isConfigured } from "./lib/config";

interface PoolState {
  starBalance: bigint;
  moonBalance: bigint;
  lpBalance: bigint;
  starClaimed: boolean;
  moonClaimed: boolean;
  reserveA: bigint;
  reserveB: bigint;
  totalSwaps: number;
}

const EMPTY: PoolState = {
  starBalance: 0n,
  moonBalance: 0n,
  lpBalance: 0n,
  starClaimed: false,
  moonClaimed: false,
  reserveA: 0n,
  reserveB: 0n,
  totalSwaps: 0,
};

function Inner() {
  const [address, setAddress] = useState<string | null>(null);
  const [state, setState] = useState<PoolState>(EMPTY);
  const configured = isConfigured();

  const load = useCallback(async () => {
    if (!configured) return;
    try {
      const [reserves, totalSwaps] = await Promise.all([
        ammReserves(),
        ammTotalSwaps(),
      ]);
      const userPart: Partial<PoolState> = {};
      if (address) {
        const [sb, mb, lb, sc, mc] = await Promise.all([
          tokenBalance(TOKEN_A_ID, address),
          tokenBalance(TOKEN_B_ID, address),
          tokenBalance(LP_TOKEN_ID, address),
          tokenClaimed(TOKEN_A_ID, address),
          tokenClaimed(TOKEN_B_ID, address),
        ]);
        userPart.starBalance = sb;
        userPart.moonBalance = mb;
        userPart.lpBalance = lb;
        userPart.starClaimed = sc;
        userPart.moonClaimed = mc;
      }
      setState({
        ...EMPTY,
        ...userPart,
        reserveA: reserves[0],
        reserveB: reserves[1],
        totalSwaps,
      });
    } catch (err) {
      console.error("load failed:", err);
    }
  }, [address, configured]);

  // Restore wallet on mount
  useEffect(() => {
    restoreWallet().then((a) => {
      if (a) setAddress(a);
    });
  }, []);

  // Load on address change
  useEffect(() => {
    load();
  }, [load]);

  // Refresh every 15s
  useEffect(() => {
    const t = setInterval(load, 15_000);
    return () => clearInterval(t);
  }, [load]);

  if (!configured) {
    return (
      <div className="max-w-2xl mx-auto p-8">
        <div className="card border-amber-500/40 bg-amber-500/5">
          <div className="flex items-center gap-2 mb-3">
            <AlertTriangle className="w-5 h-5 text-amber-400" />
            <h2 className="font-bold text-amber-200">Not configured</h2>
          </div>
          <p className="text-sm text-slate-300 mb-3">
            Contract IDs are missing. Run the deploy script to populate{" "}
            <code className="text-cyan-300">.env.local</code>:
          </p>
          <pre className="text-xs bg-slate-950 p-3 rounded-lg overflow-x-auto">
            <code>pwsh ./scripts/deploy.ps1</code>
          </pre>
          <p className="text-xs text-slate-400 mt-3">
            Then refresh this page.
          </p>
        </div>
      </div>
    );
  }

  return (
    <div className="max-w-6xl mx-auto px-3 sm:px-5 py-5 sm:py-8">
      <WalletBar address={address} onAddress={setAddress} />

      <PoolStats
        starBalance={state.starBalance}
        moonBalance={state.moonBalance}
        lpBalance={state.lpBalance}
        reserveA={state.reserveA}
        reserveB={state.reserveB}
        totalSwaps={state.totalSwaps}
      />

      <div className="mt-5">
        <FaucetCards
          address={address}
          starClaimed={state.starClaimed}
          moonClaimed={state.moonClaimed}
          onDone={load}
        />
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-4 mt-5">
        <SwapCard
          address={address}
          starBalance={state.starBalance}
          moonBalance={state.moonBalance}
          reserveA={state.reserveA}
          reserveB={state.reserveB}
          onDone={load}
        />
        <LiquidityCard
          address={address}
          starBalance={state.starBalance}
          moonBalance={state.moonBalance}
          lpBalance={state.lpBalance}
          reserveA={state.reserveA}
          reserveB={state.reserveB}
          onDone={load}
        />
      </div>

      <footer className="mt-10 pt-5 border-t border-border text-xs text-slate-500 flex flex-wrap items-center justify-between gap-3">
        <span>
          Stellar Swap · Soroban Testnet · 0.30% swap fee · constant-product AMM
        </span>
        <a
          href={`https://stellar.expert/explorer/testnet/contract/${AMM_ID}`}
          target="_blank"
          rel="noreferrer"
          className="inline-flex items-center gap-1 hover:text-cyan-300"
        >
          AMM contract <ExternalLink className="w-3 h-3" />
        </a>
      </footer>
    </div>
  );
}

export default function App() {
  return (
    <ToastProvider>
      <Inner />
    </ToastProvider>
  );
}
