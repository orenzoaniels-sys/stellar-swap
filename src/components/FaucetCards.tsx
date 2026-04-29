import { useState } from "react";
import { Droplets, CheckCircle2, Loader2 } from "lucide-react";
import { TOKEN_A, TOKEN_B } from "../lib/config";
import { tokenFaucet } from "../lib/stellar";
import { useToast } from "../lib/toast";
import { friendlyError } from "../lib/errors";

interface Props {
  address: string | null;
  starClaimed: boolean;
  moonClaimed: boolean;
  onDone: () => void;
}

interface FaucetProps {
  address: string | null;
  claimed: boolean;
  onDone: () => void;
  symbol: string;
  name: string;
  emoji: string;
  contractId: string;
  accent: string;
  border: string;
  textAccent: string;
}

function FaucetTile({
  address,
  claimed,
  onDone,
  symbol,
  name,
  emoji,
  contractId,
  accent,
  border,
  textAccent,
}: FaucetProps) {
  const [busy, setBusy] = useState(false);
  const { push, update } = useToast();

  async function claim() {
    if (!address || busy || claimed) return;
    setBusy(true);
    const id = push({
      variant: "loading",
      title: `Claiming 10,000 ${symbol}…`,
      description: "Please sign in your wallet",
    });
    try {
      const res = await tokenFaucet(contractId, address);
      update(id, {
        variant: "success",
        title: `Received 10,000 ${symbol}!`,
        txHash: res.hash,
      });
      onDone();
    } catch (err) {
      update(id, {
        variant: "error",
        title: `${symbol} faucet failed`,
        description: friendlyError(err),
      });
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className={`card !p-4 bg-gradient-to-br ${accent} border ${border}`}>
      <div className="flex items-center gap-3">
        <div className={`w-10 h-10 rounded-xl ${border} bg-slate-950/60 grid place-items-center text-xl ${textAccent}`}>
          {emoji}
        </div>
        <div className="flex-1">
          <h3 className="font-bold text-white">{name}</h3>
          <p className="text-xs text-slate-400">
            Claim 10,000 {symbol} once
          </p>
        </div>
      </div>
      <button
        onClick={claim}
        disabled={!address || busy || claimed}
        className={`w-full mt-3 ${
          claimed ? "btn-secondary cursor-default" : "btn-primary"
        }`}
      >
        {claimed ? (
          <>
            <CheckCircle2 className="w-4 h-4" /> Already claimed
          </>
        ) : busy ? (
          <>
            <Loader2 className="w-4 h-4 animate-spin" /> Claiming…
          </>
        ) : (
          <>
            <Droplets className="w-4 h-4" /> Claim 10,000 {symbol}
          </>
        )}
      </button>
    </div>
  );
}

export function FaucetCards({
  address,
  starClaimed,
  moonClaimed,
  onDone,
}: Props) {
  return (
    <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
      <FaucetTile
        address={address}
        claimed={starClaimed}
        onDone={onDone}
        symbol={TOKEN_A.symbol}
        name={TOKEN_A.name}
        emoji={TOKEN_A.emoji}
        contractId={TOKEN_A.id}
        accent="from-cyan-500/15 to-cyan-500/5"
        border="border-cyan-500/30"
        textAccent="text-cyan-300"
      />
      <FaucetTile
        address={address}
        claimed={moonClaimed}
        onDone={onDone}
        symbol={TOKEN_B.symbol}
        name={TOKEN_B.name}
        emoji={TOKEN_B.emoji}
        contractId={TOKEN_B.id}
        accent="from-indigo-500/15 to-indigo-500/5"
        border="border-indigo-500/30"
        textAccent="text-indigo-300"
      />
    </div>
  );
}
