import type { Pair, P1Result, RiskLevel, AccumPhase } from '../types';

const pf = (x: number | string | undefined | null): number | null =>
  x != null ? parseFloat(String(x)) : null;

const clamp = (v: number, lo = 0, hi = 100) => Math.min(hi, Math.max(lo, v));

export function computeP1(pair: Pair | null | undefined): P1Result {
  if (!pair) {
    return {
      score: 0, confidence: 0, momentum: 0,
      components: {}, flags: [], risk: 'unknown', buyRatio: 1,
      darkPool: 0, catalyst: 0, imminentScore: 0, accumPhase: 'none',
      darkPoolFlags: [], catalystFlags: [], isNew: false,
    };
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
  const buysH1  = pair.txns?.h1?.buys  ?? 0;
  const sellsH1 = pair.txns?.h1?.sells ?? 0;
  const liq  = pf(pair.liquidity?.usd);
  const mcap = pf(pair.marketCap);
  const fdv  = pf(pair.fdv);

  /* ── P1 CORE COMPONENTS ── */

  /* Price Δ m5 (25%) */
  let priceScore = 0;
  if (pc5 != null && !isNaN(pc5)) {
    priceScore = clamp((Math.abs(pc5) / 50) * 100);
    if (pc5 > 0 && pc1h != null && pc1h > 0) priceScore = clamp(priceScore * 1.15);
    if (pc24 != null && pc24 > 300) priceScore *= 0.75;
  }

  /* Volume Surge (22%) */
  let volScore = 0;
  if (vh1 != null && vm5 != null && vh1 > 0 && vm5 > 0) {
    volScore = clamp((vm5 / (vh1 / 12)) * 50);
  }
  if (vh24 != null && vh6 != null && vh24 > 0 && vh6 > 0 && vh6 / (vh24 / 4) > 1.2)
    volScore = clamp(volScore * 1.1);
  if (vm5 != null && vh1 != null && vh1 > 0 && vm5 / (vh1 / 12) > 2)
    volScore = clamp(volScore * 1.15);

  /* TX Velocity + buy pressure (15%) */
  let txScore = 0;
  if (txh1 > 0 && txm5 > 0) txScore = clamp((txm5 / (txh1 / 12)) * 50);
  const buyRatio = sellsM5 > 0 ? buysM5 / sellsM5 : (buysM5 > 0 ? 3 : 1);
  if (buyRatio > 1.5 && txScore > 0) txScore = clamp(txScore * 1.1);
  if (buyRatio > 4.0)                txScore = clamp(txScore * 1.25);

  /* Liquidity / MC (18%) */
  let liqScore = 0;
  if (liq != null && mcap != null && mcap > 0)
    liqScore = clamp((liq / mcap) * 500);
  else if (liq != null && liq > 0)
    liqScore = clamp((Math.log10(liq) / 5) * 100);

  /* MC/FDV (10%) */
  let mcScore = 0;
  if (fdv != null && mcap != null && fdv > 0) mcScore = clamp((mcap / fdv) * 100);

  /* Momentum — multi-TF alignment (10%) */
  let momentumScore = 0;
  const tw = [pc5, pc1h, pc6h, pc24].filter((x): x is number => x != null && !isNaN(x));
  if (tw.length >= 2) {
    momentumScore = (tw.filter(x => x > 0).length / tw.length) * 100;
    if (pc5 != null && pc1h != null && pc5 > 0 && pc1h > 0 && pc5 > pc1h / 12)
      momentumScore = clamp(momentumScore * 1.2);
  }

  const weighted = priceScore * 0.25 + volScore * 0.22 + liqScore * 0.18
                 + txScore   * 0.15 + mcScore  * 0.10 + momentumScore * 0.10;

  const available = [
    pc5 != null && !isNaN(pc5), vm5 != null && vh1 != null,
    liq != null, txm5 > 0 || txh1 > 0,
    fdv != null && mcap != null, pc6h != null || pc24 != null,
  ].filter(Boolean).length;
  const confidence = Math.round((available / 6) * 100);
  const finalScore = clamp(Math.round(weighted * (0.6 + (confidence / 100) * 0.4)));

  let risk: RiskLevel = 'medium';
  if (liqScore < 15 || (mcap != null && mcap < 1e6)) risk = 'high';
  else if (liqScore > 60 && mcap != null && mcap > 1e9) risk = 'low';

  const flags: string[] = [];
  if (finalScore > 85 && confidence >= 65)          flags.push('🔥 Imminent Surge');
  else if (finalScore > 70 && confidence >= 60)     flags.push('⚡ Surge Candidate');
  if (buyRatio > 2.0 && txScore > 60)              flags.push('🟢 Buy Pressure');
  if (volScore > 80 && priceScore > 60)            flags.push('📈 Vol-Price Align');
  if (momentumScore > 75)                          flags.push('🚀 Multi-TF Momentum');
  if (liqScore < 20 && finalScore > 50)            flags.push('⚠️ Low Liquidity');
  if (pc24 != null && pc24 > 300 && finalScore > 50) flags.push('⏰ Late Signal');

  /* ══════════════════════════════════════════════════
     DARK POOL ACCUMULATION SCORE
     Inferred from on-chain DEX metrics:
     1. Buy/sell imbalance (buy-side absorption)
     2. Price suppression vs volume (large orders absorbing supply)
     3. Multi-timeframe buy consistency
  ══════════════════════════════════════════════════ */
  let dpBuyPressure = 0;
  if (buyRatio >= 5)       dpBuyPressure = 100;
  else if (buyRatio >= 4)  dpBuyPressure = 85;
  else if (buyRatio >= 3)  dpBuyPressure = 70;
  else if (buyRatio >= 2)  dpBuyPressure = 55;
  else if (buyRatio >= 1.5) dpBuyPressure = 35;
  else                     dpBuyPressure = clamp((buyRatio - 1) * 35);

  // H1 buy ratio consistency
  const buyRatioH1 = sellsH1 > 0 ? buysH1 / sellsH1 : (buysH1 > 0 ? 3 : 1);
  if (buyRatioH1 > 2 && dpBuyPressure > 0) dpBuyPressure = clamp(dpBuyPressure * 1.15);

  // Price absorption: high volume with small price movement = accumulation
  let dpAbsorption = 0;
  if (vm5 != null && liq != null && liq > 0 && pc5 != null && !isNaN(pc5)) {
    const volumeImpactRatio = (vm5 / liq) / (Math.abs(pc5) / 100 + 0.0001);
    dpAbsorption = clamp(Math.log10(volumeImpactRatio + 1) * 30);
  }

  // Consistency: buys positive across h1 and m5
  let dpConsistency = 0;
  const posWindows = [pc5, pc1h, pc6h].filter(x => x != null && x > 0).length;
  const totWindows = [pc5, pc1h, pc6h].filter(x => x != null).length;
  if (totWindows > 0) dpConsistency = (posWindows / totWindows) * 100;
  // Stealth boost: high volume accumulation without explosive price (price < volume signal)
  if (volScore > 60 && (pc5 ?? 0) < 5) dpConsistency = clamp(dpConsistency * 1.2);

  const darkPool = clamp(Math.round(
    dpBuyPressure * 0.45 + dpAbsorption * 0.30 + dpConsistency * 0.25
  ));

  const darkPoolFlags: string[] = [];
  if (darkPool >= 80) darkPoolFlags.push('🌑 Smart Money Inflow');
  else if (darkPool >= 60) darkPoolFlags.push('🌑 Accumulation Detected');
  if (buyRatio >= 4) darkPoolFlags.push('⬆ Extreme Buy Absorption');
  else if (buyRatio >= 2.5) darkPoolFlags.push('⬆ Buy-Side Dominance');
  if (dpAbsorption > 40) darkPoolFlags.push('🔒 Price Suppression Active');
  if (posWindows >= 3) darkPoolFlags.push('📊 Multi-TF Consistency');

  /* ══════════════════════════════════════════════════
     CATALYST SCORE
     Detects the external trigger behind a price move:
     1. Volume spike vs h1 average (sudden inflow)
     2. Extreme buy burst in m5
     3. Fresh breakout (strong m5 but h24 not extended)
  ══════════════════════════════════════════════════ */
  let catVolumeSpike = 0;
  if (vm5 != null && vh1 != null && vh1 > 0) {
    const spikeRatio = vm5 / (vh1 / 12);
    if (spikeRatio >= 5)      catVolumeSpike = 100;
    else if (spikeRatio >= 3) catVolumeSpike = 80;
    else if (spikeRatio >= 2) catVolumeSpike = 55;
    else if (spikeRatio >= 1.5) catVolumeSpike = 35;
  }

  let catBuyBurst = 0;
  if (buyRatio >= 6)       catBuyBurst = 100;
  else if (buyRatio >= 4)  catBuyBurst = 80;
  else if (buyRatio >= 3)  catBuyBurst = 60;
  else if (buyRatio >= 2)  catBuyBurst = 40;

  let catBreakout = 0;
  if (pc5 != null && !isNaN(pc5) && pc5 > 0) {
    const freshBreakout = (pc24 == null || pc24 < 50) && pc5 > 8;
    const strongBreakout = pc5 > 15;
    if (strongBreakout && freshBreakout) catBreakout = 100;
    else if (freshBreakout) catBreakout = 65;
    else if (strongBreakout) catBreakout = 40;
    else catBreakout = clamp(pc5 * 2);
  }

  const catalyst = clamp(Math.round(
    catVolumeSpike * 0.45 + catBuyBurst * 0.35 + catBreakout * 0.20
  ));

  const catalystFlags: string[] = [];
  if (vm5 != null && vh1 != null && vh1 > 0 && vm5 / (vh1 / 12) >= 3)
    catalystFlags.push(`⚡ Volume Spike ${(vm5 / (vh1 / 12)).toFixed(1)}×`);
  if (buyRatio >= 4) catalystFlags.push(`🚨 Buy Burst ${buyRatio.toFixed(1)}×`);
  if (catBreakout >= 65) catalystFlags.push('💥 Fresh Breakout');
  if (catVolumeSpike >= 80 && catBuyBurst >= 60)
    catalystFlags.push('🔥 Confirmed Catalyst');

  /* ══════════════════════════════════════════════════
     IMMINENT SCORE — combined surge probability
     Weights: P1 (50%) + Catalyst (30%) + DarkPool (20%)
     Dampened by same confidence factor as P1
  ══════════════════════════════════════════════════ */
  const imminentRaw = finalScore * 0.50 + catalyst * 0.30 + darkPool * 0.20;
  const imminentScore = clamp(Math.round(imminentRaw));

  /* ══════════════════════════════════════════════════
     ACCUMULATION PHASE
  ══════════════════════════════════════════════════ */
  let accumPhase: AccumPhase = 'none';
  if (darkPool >= 70 && catalyst < 50 && (pc5 ?? 0) < 10) {
    accumPhase = darkPool >= 85 ? 'active-accum' : 'early-accum';
  } else if (catalyst >= 65 && finalScore >= 65) {
    accumPhase = 'breakout';
  }

  /* New listing detection: high m5 activity but sparse h24 data */
  const isNew = (
    (vh24 == null || vh24 < 500_000) &&
    (vm5 != null && vm5 > 10_000) &&
    (txm5 > 5)
  );

  return {
    score: finalScore, confidence, momentum: Math.round(momentumScore),
    components: {
      price:     { score: Math.round(priceScore),    label: 'Price Δ m5'   },
      volume:    { score: Math.round(volScore),      label: 'Volume Surge' },
      liquidity: { score: Math.round(liqScore),      label: 'Liquidity'    },
      txCount:   { score: Math.round(txScore),       label: 'TX Velocity'  },
      marketCap: { score: Math.round(mcScore),       label: 'MC/FDV'       },
      momentum:  { score: Math.round(momentumScore), label: 'Momentum'     },
    },
    flags, risk, buyRatio: Math.round(buyRatio * 10) / 10,
    darkPool, catalyst, imminentScore, accumPhase,
    darkPoolFlags, catalystFlags, isNew,
  };
}
