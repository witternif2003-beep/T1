import type { Pair, P1Result, RiskLevel } from '../types';

const pf = (x: number | string | undefined | null): number | null =>
  x != null ? parseFloat(String(x)) : null;

export function computeP1(pair: Pair | null | undefined): P1Result {
  if (!pair) {
    return { score: 0, confidence: 0, momentum: 0, components: {}, flags: [], risk: 'unknown', buyRatio: 1 };
  }

  const pc5  = pf(pair.priceChange?.m5);
  const pc1h = pf(pair.priceChange?.h1);
  const pc6h = pf(pair.priceChange?.h6);
  const pc24 = pf(pair.priceChange?.h24);
  const vm5  = pf(pair.volume?.m5);
  const vh1  = pf(pair.volume?.h1);
  const vh6  = pf(pair.volume?.h6);
  const vh24 = pf(pair.volume?.h24);
  const txm5    = (pair.txns?.m5?.buys  ?? 0) + (pair.txns?.m5?.sells  ?? 0);
  const txh1    = (pair.txns?.h1?.buys  ?? 0) + (pair.txns?.h1?.sells  ?? 0);
  const buysM5  = pair.txns?.m5?.buys  ?? 0;
  const sellsM5 = pair.txns?.m5?.sells ?? 0;
  const liq  = pf(pair.liquidity?.usd);
  const mcap = pf(pair.marketCap);
  const fdv  = pf(pair.fdv);

  /* ── Price Δ m5 (25%) ── */
  let priceScore = 0;
  if (pc5 != null && !isNaN(pc5)) {
    priceScore = Math.min(100, (Math.abs(pc5) / 50) * 100);
    if (pc5 > 0 && pc1h != null && pc1h > 0)
      priceScore = Math.min(100, priceScore * 1.15);
    if (pc24 != null && pc24 > 300)
      priceScore *= 0.75;  // late-signal penalty
  }

  /* ── Volume Surge (22%) ── */
  let volScore = 0;
  if (vh1 != null && vm5 != null && vh1 > 0 && vm5 > 0)
    volScore = Math.min(100, (vm5 / (vh1 / 12)) * 50);
  if (vh24 != null && vh6 != null && vh24 > 0 && vh6 > 0 && vh6 / (vh24 / 4) > 1.2)
    volScore = Math.min(100, volScore * 1.1);
  if (vm5 != null && vh1 != null && vh1 > 0 && vm5 / (vh1 / 12) > 2)
    volScore = Math.min(100, volScore * 1.15);

  /* ── TX Velocity (15%) ── */
  let txScore = 0;
  if (txh1 > 0 && txm5 > 0)
    txScore = Math.min(100, (txm5 / (txh1 / 12)) * 50);
  const buyRatio = sellsM5 > 0 ? buysM5 / sellsM5 : (buysM5 > 0 ? 3 : 1);
  if (buyRatio > 1.5 && txScore > 0)
    txScore = Math.min(100, txScore * 1.1);
  if (buyRatio > 4.0)
    txScore = Math.min(100, txScore * 1.25);

  /* ── Liquidity / MC (18%) ── */
  let liqScore = 0;
  if (liq != null && mcap != null && mcap > 0)
    liqScore = Math.min(100, (liq / mcap) * 500);
  else if (liq != null && liq > 0)
    liqScore = Math.min(100, (Math.log10(liq) / 5) * 100);

  /* ── MC/FDV (10%) ── */
  let mcScore = 0;
  if (fdv != null && mcap != null && fdv > 0)
    mcScore = Math.min(100, (mcap / fdv) * 100);

  /* ── Momentum — multi-TF alignment (10%) ── */
  let momentumScore = 0;
  const tw = [pc5, pc1h, pc6h, pc24].filter((x): x is number => x != null && !isNaN(x));
  if (tw.length >= 2) {
    momentumScore = (tw.filter(x => x > 0).length / tw.length) * 100;
    if (pc5 != null && pc1h != null && pc5 > 0 && pc1h > 0 && pc5 > pc1h / 12)
      momentumScore = Math.min(100, momentumScore * 1.2);
  }

  /* ── Weighted composite ── */
  const weighted = priceScore * 0.25
                 + volScore   * 0.22
                 + liqScore   * 0.18
                 + txScore    * 0.15
                 + mcScore    * 0.10
                 + momentumScore * 0.10;

  /* ── Confidence from data completeness ── */
  const available = [
    pc5 != null && !isNaN(pc5),
    vm5 != null && vh1 != null,
    liq != null,
    txm5 > 0 || txh1 > 0,
    fdv != null && mcap != null,
    pc6h != null || pc24 != null,
  ].filter(Boolean).length;
  const confidence = Math.round((available / 6) * 100);
  const finalScore = Math.min(100, Math.round(weighted * (0.6 + (confidence / 100) * 0.4)));

  /* ── Risk ── */
  let risk: RiskLevel = 'medium';
  if (liqScore < 15 || (mcap != null && mcap < 1e6)) risk = 'high';
  else if (liqScore > 60 && mcap != null && mcap > 1e9) risk = 'low';

  /* ── Signal flags ── */
  const flags: string[] = [];
  if (finalScore > 85 && confidence >= 65)          flags.push('🔥 Imminent Surge');
  else if (finalScore > 70 && confidence >= 60)     flags.push('⚡ Surge Candidate');
  if (buyRatio > 2.0 && txScore > 60)              flags.push('🟢 Buy Pressure');
  if (volScore > 80 && priceScore > 60)            flags.push('📈 Vol-Price Align');
  if (momentumScore > 75)                          flags.push('🚀 Multi-TF Momentum');
  if (liqScore < 20 && finalScore > 50)            flags.push('⚠️ Low Liquidity');
  if (pc24 != null && pc24 > 300 && finalScore > 50) flags.push('⏰ Late Signal');

  return {
    score: finalScore,
    confidence,
    momentum: Math.round(momentumScore),
    components: {
      price:     { score: Math.round(priceScore),    label: 'Price Δ m5'   },
      volume:    { score: Math.round(volScore),      label: 'Volume Surge' },
      liquidity: { score: Math.round(liqScore),      label: 'Liquidity'    },
      txCount:   { score: Math.round(txScore),       label: 'TX Velocity'  },
      marketCap: { score: Math.round(mcScore),       label: 'MC/FDV'       },
      momentum:  { score: Math.round(momentumScore), label: 'Momentum'     },
    },
    flags,
    risk,
    buyRatio: Math.round(buyRatio * 10) / 10,
  };
}
