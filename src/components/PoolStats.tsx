import { Coins, Droplets, Activity, TrendingUp } from "lucide-react";
import { TOKEN_A, TOKEN_B } from "../lib/config";
import { fromRaw, formatPrice } from "../lib/format";

interface Props {
  starBalance: bigint;
  moonBalance: bigint;
  lpBalance: bigint;
  reserveA: bigint;
  reserveB: bigint;
  totalSwaps: number;
}

export function PoolStats({
  starBalance,
  moonBalance,
  lpBalance,
  reserveA,
  reserveB,
  totalSwaps,
}: Props) {
  const cards = [
    {
      icon: <Coins className="w-4 h-4 text-cyan-300" />,
      label: `${TOKEN_A.symbol} BALANCE`,
      value: fromRaw(starBalance, TOKEN_A.decimals),
      sub: TOKEN_A.name,
      accent: "from-cyan-500/20 to-cyan-500/5",
    },
    {
      icon: <Coins className="w-4 h-4 text-indigo-300" />,
      label: `${TOKEN_B.symbol} BALANCE`,
      value: fromRaw(moonBalance, TOKEN_B.decimals),
      sub: TOKEN_B.name,
      accent: "from-indigo-500/20 to-indigo-500/5",
    },
    {
      icon: <Droplets className="w-4 h-4 text-emerald-300" />,
      label: "YOUR LP SHARES",
      value: fromRaw(lpBalance, 7),
      sub: "S-LP tokens",
      accent: "from-emerald-500/20 to-emerald-500/5",
    },
    {
      icon: <Activity className="w-4 h-4 text-amber-300" />,
      label: "TOTAL SWAPS",
      value: totalSwaps.toLocaleString(),
      sub: "all-time",
      accent: "from-amber-500/20 to-amber-500/5",
    },
  ];

  return (
    <div className="space-y-4">
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
        {cards.map((c) => (
          <div
            key={c.label}
            className={`card bg-gradient-to-br ${c.accent} !p-4`}
          >
            <div className="flex items-center gap-1.5">
              {c.icon}
              <span className="stat-label">{c.label}</span>
            </div>
            <div className="stat-value mt-1.5 break-all">{c.value}</div>
            <div className="text-xs text-slate-400 mt-0.5">{c.sub}</div>
          </div>
        ))}
      </div>

      <div className="card !p-5">
        <div className="flex items-center gap-2 mb-3">
          <TrendingUp className="w-4 h-4 text-cyan-400" />
          <h3 className="font-bold text-sm">Pool Reserves</h3>
        </div>
        <div className="grid grid-cols-2 gap-3 text-sm">
          <div>
            <div className="stat-label">{TOKEN_A.symbol} reserve</div>
            <div className="font-semibold text-cyan-300">
              {fromRaw(reserveA, TOKEN_A.decimals)}
            </div>
          </div>
          <div>
            <div className="stat-label">{TOKEN_B.symbol} reserve</div>
            <div className="font-semibold text-indigo-300">
              {fromRaw(reserveB, TOKEN_B.decimals)}
            </div>
          </div>
          <div className="col-span-2 pt-2 border-t border-border">
            <div className="stat-label">CURRENT PRICE</div>
            <div className="text-sm font-semibold mt-0.5">
              1 {TOKEN_A.symbol} ={" "}
              <span className="text-cyan-300">
                {formatPrice(reserveB, reserveA)}
              </span>{" "}
              {TOKEN_B.symbol}
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
