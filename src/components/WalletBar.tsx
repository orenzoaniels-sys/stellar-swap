import { useState } from "react";
import {
  Wallet,
  LogOut,
  Copy,
  RefreshCw,
  ArrowLeftRight,
  Check,
} from "lucide-react";
import { openWalletPicker, disconnectWallet } from "../lib/wallet";
import { shortenAddr } from "../lib/format";
import { useToast } from "../lib/toast";
import { friendlyError } from "../lib/errors";

interface Props {
  address: string | null;
  onAddress: (a: string | null) => void;
}

export function WalletBar({ address, onAddress }: Props) {
  const [copied, setCopied] = useState(false);
  const [busy, setBusy] = useState(false);
  const { push } = useToast();

  async function connect() {
    if (busy) return;
    setBusy(true);
    try {
      const { address: a } = await openWalletPicker(true);
      onAddress(a);
    } catch (err) {
      const msg = friendlyError(err);
      if (msg !== "Wallet popup closed") push({ variant: "error", title: msg });
    } finally {
      setBusy(false);
    }
  }

  function copy() {
    if (!address) return;
    navigator.clipboard.writeText(address);
    setCopied(true);
    setTimeout(() => setCopied(false), 1200);
  }

  function dc() {
    disconnectWallet();
    onAddress(null);
  }

  return (
    <header className="flex items-center justify-between gap-3 mb-6 flex-wrap">
      <div className="flex items-center gap-3">
        <div className="w-11 h-11 rounded-2xl bg-gradient-to-br from-cyan-500 to-blue-600 grid place-items-center shadow-glow">
          <ArrowLeftRight className="w-5 h-5 text-white" />
        </div>
        <div>
          <h1 className="text-lg sm:text-xl font-extrabold leading-tight">
            Stellar Swap
          </h1>
          <p className="text-[11px] text-slate-400 tracking-wider uppercase">
            DEX · Soroban Testnet
          </p>
        </div>
      </div>

      {address ? (
        <div className="flex items-center gap-2">
          <button
            onClick={copy}
            className="chip hover:bg-cyan-500/20 transition"
            title="Copy address"
          >
            <span className="w-2 h-2 rounded-full bg-emerald-400 animate-pulse" />
            <span className="font-mono">{shortenAddr(address)}</span>
            {copied ? (
              <Check className="w-3.5 h-3.5" />
            ) : (
              <Copy className="w-3.5 h-3.5" />
            )}
          </button>
          <button
            onClick={connect}
            disabled={busy}
            className="btn-secondary !px-3 !py-2"
            title="Switch account"
          >
            <RefreshCw className={`w-4 h-4 ${busy ? "animate-spin" : ""}`} />
          </button>
          <button
            onClick={dc}
            className="btn-secondary !px-3 !py-2"
            title="Disconnect"
          >
            <LogOut className="w-4 h-4" />
          </button>
        </div>
      ) : (
        <button onClick={connect} disabled={busy} className="btn-primary">
          <Wallet className="w-4 h-4" />
          {busy ? "Opening…" : "Connect wallet"}
        </button>
      )}
    </header>
  );
}
