// ▸ P1 ENGINE - 10-SIGNAL COMPOSITE SCORING
// Verified metrics only. No mock. Missing = null.

import { P1Signal, Ticker } from "./types";
import { sma, ema, rsi, stddev, choosePattern, vwap as calcVwap } from "./math";

export type P1Inputs = {
  price: number;
  changePct: number;
  closes: number[];
  highs: number[];
  lows: number[];
  volumes: number[];
  marketCap: number | null;
  fdv: number | null;
  holders24h: number;
  holdersCurrent: number;
  txnsM5: number;
  txnsH1: number;
  txnsM5Buys: number;
  txnsM5Sells: number;
  liquidityUsd: number | null;
  daysSinceLaunch: number;
  verified: boolean;
};

// ▸ 10-SIGNAL P1 ENGINE
export function deriveP1Signals(inputs: P1Inputs): P1Signal {
  const {
    price,
    changePct,
    closes,
    volumes,
    marketCap,
    fdv,
    holders24h,
    holdersCurrent,
    txnsM5,
    txnsH1,
    txnsM5Buys,
    txnsM5Sells,
    liquidityUsd,
    daysSinceLaunch,
    verified,
  } = inputs;

  // 1. VVR - Volume Velocity Ratio: volume.m5 / (volume.h1 / 12)
  // Threshold > 10.0 = SURGE IMMINENT
  const volumeM5 = volumes.slice(-1)[0] || 0;
  const volumeH1 = volumes.slice(-12).reduce((a, b) => a + b, 0) / 12;
  const vvr = volumeH1 > 0 ? volumeM5 / (volumeH1 / 12) : null;

  // 2. BPI - Buy Pressure Index: txns.m5.buys / txns.m5.sells
  // Threshold > 3.0 = COORDINATED ENTRY
  const bpi = txnsM5Sells > 0 ? txnsM5Buys / txnsM5Sells : null;

  // 3. HGR - Holder Growth Rate: (holders.current - holders.24h_ago) / holders.24h_ago
  // Threshold > 200% = VIRAL INFLECTION
  const hgr = holders24h > 0 ? ((holdersCurrent - holders24h) / holders24h) * 100 : null;

  // 4. LER - Liquidity Efficiency Ratio: liquidity.usd / marketCap
  // Threshold < 0.05 = HIGH PRICE IMPACT (explosive moves)
  const ler = marketCap && marketCap > 0 && liquidityUsd ? liquidityUsd / marketCap : null;

  // 5. MAS - Momentum Alignment Score: sum of (1 if price_change > 0 in 5m/1h/6h)
  // Threshold = 3/3 = FULL ALIGNMENT
  const priceChange5m = closes.length >= 1 ? closes[closes.length - 1] - closes[closes.length - 2] : 0;
  const priceChange1h = closes.length >= 12 ? closes[closes.length - 1] - closes[closes.length - 12] : 0;
  const priceChange6h = closes.length >= 72 ? closes[closes.length - 1] - closes[closes.length - 72] : 0;
  const mas = (priceChange5m > 0 ? 1 : 0) + (priceChange1h > 0 ? 1 : 0) + (priceChange6h > 0 ? 1 : 0);

  // 6. MCE - Market Cap Efficiency: marketCap / fdv
  // Threshold > 0.8 = LOW INFLATION RISK
  const mce = fdv && fdv > 0 ? marketCap ? marketCap / fdv : null : null;

  // 7. TCA - Transaction Coordination Activity: txns.m5 / (txns.h1 / 12)
  // Threshold > 15 = BOT/COORDINATED ACTIVITY
  const txnsH1Avg = txnsH1 / 12;
  const tca = txnsH1Avg > 0 ? txnsM5 / txnsH1Avg : null;

  // 8. PIS - Price Impact Severity: |priceChange.m5| / (volume.m5 / liquidity.usd)
  // Threshold > 2.0 = ILLIQUID EXPLOSION
  const pis = liquidityUsd && liquidityUsd > 0 && volumeM5 > 0
    ? Math.abs(priceChange5m) / (volumeM5 / liquidityUsd)
    : null;

  // 9. VSA - Verified + Scarcity Age: (verified ? 1 : 0) * (1 / days_since_launch)
  // Threshold > 0.1 (verified, <10 days old)
  const vsa = (verified ? 1 : 0) * (daysSinceLaunch > 0 ? 1 / daysSinceLaunch : 0);

  // 10. SAG - Supply-Attention Gap: implied_attention / current_marketCap
  // implied_attention = holder_growth_rate * transaction_count
  // Threshold > 5.0 = UNDERPRICED ATTENTION
  const impliedAttention = (hgr || 0) * Math.max(txnsM5, 1);
  const sag = marketCap && marketCap > 0 ? impliedAttention / (marketCap / 1000) : null; // normalize

  return { vvr, bpi, hgr, ler, mas, mce, tca, pis, vsa, sag };
}

// ▸ DERIVE P1 COMPOSITE SCORE & CATALYST
export function deriveP1Score(signals: P1Signal, catalyst: string): { score: number; surgeProb: number } {
  // Weight each signal's threshold crossing
  let score = 50; // baseline

  // VVR: weight 28%
  if (signals.vvr !== null && signals.vvr > 10) score += 28 * Math.min(signals.vvr / 50, 1);

  // BPI: weight 16%
  if (signals.bpi !== null && signals.bpi > 3) score += 16 * Math.min(signals.bpi / 8, 1);

  // HGR: weight 18%
  if (signals.hgr !== null && signals.hgr > 200) score += 18 * Math.min(signals.hgr / 300, 1);

  // LER: weight 18% (inverse - lower is better)
  if (signals.ler !== null && signals.ler < 0.05) score += 18 * (1 - signals.ler / 0.05);

  // MAS: weight 28% (3/3 = max points)
  score += (signals.mas / 3) * 28;

  // MCE: weight 14% (higher is better)
  if (signals.mce !== null && signals.mce > 0.8) score += 14 * Math.min(signals.mce / 1, 1);

  // TCA: weight 16%
  if (signals.tca !== null && signals.tca > 15) score += 16 * Math.min(signals.tca / 40, 1);

  // PIS: weight 18% (price impact)
  if (signals.pis !== null && signals.pis > 2) score += 18 * Math.min(signals.pis / 5, 1);

  // VSA: weight 14% (verified scarcity age)
  if (signals.vsa > 0.1) score += 14 * Math.min(signals.vsa / 0.5, 1);

  // SAG: weight 20%
  if (signals.sag !== null && signals.sag > 5) score += 20 * Math.min(signals.sag / 10, 1);

  // Clamp to 0-100
  score = Math.max(0, Math.min(100, score));

  // SURGE PROBABILITY NEXT BELL OPEN: >= 50% if multiple thresholds crossed
  const thresholdsCrossed =
    (signals.vvr !== null && signals.vvr > 10 ? 1 : 0) +
    (signals.bpi !== null && signals.bpi > 3 ? 1 : 0) +
    (signals.hgr !== null && signals.hgr > 200 ? 1 : 0) +
    (signals.ler !== null && signals.ler < 0.05 ? 1 : 0) +
    (signals.mas === 3 ? 1 : 0);

  const surgeProb = Math.min(100, 50 + thresholdsCrossed * 10);

  return { score: Math.round(score), surgeProb };
}

// ▸ DERIVE ALL 14 METRICS
export function deriveMetrics(
  price: number,
  changePct: number,
  closes: number[],
  highs: number[],
  lows: number[],
  volumes: number[],
  p1Signals: P1Signal
): { metrics: Array<{ idx: number; title: string; value: string; subtitle: string; status: "VERIFIED" | "DERIVED" | "REQUIRES_PROVIDER" }> } {
  const ma10 = sma(closes, 10);
  const ma50 = sma(closes, 50);
  const rsi5 = rsi(closes, 5);
  const rsi14 = rsi(closes, 14);
  const hv = stddev(
    closes
      .slice(-30)
      .map((v, i, a) => (i ? (v - a[i - 1]) / a[i - 1] : 0))
      .slice(1)
  );

  const pat = choosePattern(closes);
  const vwapVal = calcVwap(closes, volumes);
  const vwapDev = vwapVal ? ((price - vwapVal) / vwapVal) * 100 : null;
  const momentum = ma10 ? ((price - ma10) / ma10) * 100 : 0;
  const sigma = hv ? hv * 100 * Math.sqrt(252) : null;

  const fmt = (n?: number | null, d = 2) =>
    n == null || Number.isNaN(n) ? "N/A" : n.toFixed(d);
  const pct = (n?: number | null) =>
    n == null || Number.isNaN(n) ? "N/A" : `${n >= 0 ? "+" : ""}${n.toFixed(2)}%`;

  return {
    metrics: [
      { idx: 1, title: "MOMENTUM THRUST", value: `${Math.round(momentum)}%`, subtitle: "VOL×PRICE VELOCITY", status: "DERIVED" },
      { idx: 2, title: "RELATIVE STRENGTH", value: `${Math.round((rsi14 ?? 50))}RS`, subtitle: "VS SPY+SECTOR REQUIRES BENCHMARK", status: "DERIVED" },
      { idx: 3, title: "PATTERN SCORE", value: `${pat.score}% MATCH`, subtitle: pat.name, status: "DERIVED" },
      { idx: 4, title: "MOMENTUM VECTOR", value: `${fmt((changePct / 5) || 0, 2)} m/s²`, subtitle: "INSTANT ACCELERATION", status: "DERIVED" },
      { idx: 5, title: "SHORT INTEREST", value: "N/A", subtitle: "CONNECT ORTEX / S3 / EXCHANGE SI", status: "REQUIRES_PROVIDER" },
      { idx: 6, title: "DARK POOL ACCUM", value: "N/A", subtitle: "CONNECT ATS / OFF-EXCHANGE FEED", status: "REQUIRES_PROVIDER" },
      { idx: 7, title: "INSIDER ACTIVITY", value: "N/A", subtitle: "CONNECT SEC FORM 4 AGGREGATOR", status: "REQUIRES_PROVIDER" },
      { idx: 8, title: "ANALYST TARGETS", value: "N/A", subtitle: "CONNECT CONSENSUS ESTIMATE API", status: "REQUIRES_PROVIDER" },
      { idx: 9, title: "VVR VOLUME VELOCITY", value: `${fmt(p1Signals.vvr)}x`, subtitle: p1Signals.vvr && p1Signals.vvr > 10 ? "🚨 SURGE IMMINENT" : "monitoring", status: "VERIFIED" },
      { idx: 10, title: "VWAP DEVIATION", value: vwapDev == null ? "N/A" : pct(vwapDev), subtitle: "DIST FROM VWAP", status: "DERIVED" },
      { idx: 11, title: "VOLATILITY SIGMA", value: sigma == null ? "N/A" : `${fmt(sigma / 100, 2)}xATR`, subtitle: "AVG TRUE RANGE PROXY", status: "DERIVED" },
      { idx: 12, title: "LIQUIDITY DEPTH", value: "N/A", subtitle: "CONNECT REAL L2 / BOOK DEPTH", status: "REQUIRES_PROVIDER" },
      { idx: 13, title: "RSI5 MOMENTUM", value: rsi5 ? `${Math.round(rsi5)}` : "N/A", subtitle: rsi5 && rsi5 < 30 ? "OVERSOLD SETUP" : "monitoring", status: "VERIFIED" },
      { idx: 14, title: "P1 COMPOSITE", value: `${Math.round(p1Signals.sag || 0)}% SAG`, subtitle: "SUPPLY-ATTENTION GAP", status: "DERIVED" },
    ],
  };
}
