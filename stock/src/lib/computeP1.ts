import type { Stock, StockP1, RiskLevel, AccumPhase } from '../types';

const clamp = (v: number, lo = 0, hi = 100) => Math.min(hi, Math.max(lo, v));

export function computeP1(s: Stock | null | undefined): StockP1 {
  const empty: StockP1 = {
    score: 0, confidence: 0, momentum: 0, darkPool: 0, catalyst: 0, imminentScore: 0,
    accumPhase: 'none', components: {}, flags: [], darkPoolFlags: [], catalystFlags: [],
    risk: 'unknown', squeezeSetup: false, volRatio: 0,
  };
  if (!s) return empty;

  const pct       = s.changePct;
  const vol       = s.volume;
  const avgVol    = Math.max(s.avgVolume10d, s.avgVolume3m, 1000);
  const volRatio  = vol > 0 ? vol / avgVol : 0;
  const price     = s.price;
  const shortFl   = Math.min(s.shortFloat, 1);   // cap at 100%
  const floatSh   = s.floatShares;
  const ma50      = s.ma50;
  const ma200     = s.ma200;
  const high52    = s.high52w;
  const low52     = s.low52w;

  /* ── 1. Price Action (25%) ── */
  let priceScore = 0;
  if (!isNaN(pct)) {
    priceScore = clamp(Math.abs(pct) * 4);        // 1% → 4 pts, 25% → 100 pts
    if (pct > 0) priceScore = clamp(priceScore * 1.25);
    if (pct > 20) priceScore = 100;
    if (ma50 > 0 && price > ma50)  priceScore = clamp(priceScore * 1.1);
  }

  /* ── 2. Volume Surge (22%) ── */
  let volScore = 0;
  if      (volRatio >= 10) volScore = 100;
  else if (volRatio >= 5)  volScore = 85;
  else if (volRatio >= 3)  volScore = 65;
  else if (volRatio >= 2)  volScore = 45;
  else if (volRatio >= 1.5) volScore = 28;
  else                     volScore = clamp((volRatio - 1) * 25);

  /* ── 3. Short Squeeze Setup (18%) ── */
  let squeezeScore = 0;
  const squeezeSetup = shortFl > 0.15 && pct > 0 && volRatio > 1.5;
  if (shortFl > 0.50)      squeezeScore = pct > 0 ? 100 : 45;
  else if (shortFl > 0.30) squeezeScore = clamp(shortFl * 220 * (pct > 0 ? 1.2 : 0.5));
  else if (shortFl > 0.10) squeezeScore = clamp(shortFl * 160 * (pct > 0 ? 1.1 : 0.45));
  if (squeezeSetup)        squeezeScore = clamp(squeezeScore * 1.35);

  /* ── 4. Float Pressure (15%) ── */
  let floatScore = 0;
  if (floatSh > 0 && vol > 0) {
    const turnover = vol / floatSh;              // fraction of float traded today
    floatScore = clamp(turnover * 350);          // 28% float traded → 100 pts
  }

  /* ── 5. Technical Momentum (10%) ── */
  let momentumScore = 0;
  if (high52 > low52 && high52 > 0 && low52 >= 0) {
    momentumScore = clamp(((price - low52) / (high52 - low52)) * 100);
    if (ma50  > 0 && price > ma50)  momentumScore = clamp(momentumScore * 1.12);
    if (ma200 > 0 && price > ma200) momentumScore = clamp(momentumScore * 1.08);
    if (price >= high52 * 0.90)     momentumScore = clamp(momentumScore * 1.15);
  }

  /* ── 6. Catalyst (10%) ── */
  let catalystScore = 0;
  if      (volRatio >= 8)  catalystScore = 100;
  else if (volRatio >= 5)  catalystScore = 82;
  else if (volRatio >= 3)  catalystScore = 62;
  else if (volRatio >= 2)  catalystScore = 42;
  else if (volRatio >= 1.5) catalystScore = 22;
  if (pct > 5  && volRatio >= 2) catalystScore = clamp(catalystScore * 1.25);
  if (pct > 12 && volRatio >= 3) catalystScore = 100;

  /* ── Weighted composite ── */
  const weighted = priceScore    * 0.25
                 + volScore      * 0.22
                 + squeezeScore  * 0.18
                 + floatScore    * 0.15
                 + momentumScore * 0.10
                 + catalystScore * 0.10;

  /* ── Confidence from data completeness ── */
  const have = [
    !isNaN(pct) && vol > 0,
    avgVol > 1000,
    floatSh > 0,
    shortFl > 0,
    high52 > 0 && low52 >= 0,
    ma50 > 0 || ma200 > 0,
  ].filter(Boolean).length;
  const confidence  = Math.round((have / 6) * 100);
  const finalScore  = clamp(Math.round(weighted * (0.6 + (confidence / 100) * 0.4)));

  /* ── Risk ── */
  let risk: RiskLevel = 'medium';
  if (price < 0.05 || floatSh < 2e6)              risk = 'high';
  else if (floatSh > 100e6 && shortFl < 0.05)     risk = 'low';

  /* ── Dark Pool Score ── */
  // Accumulation signal: rising buy pressure + price suppressed vs volume
  let dpBuyPressure = pct > 0 ? clamp(pct * 3.5) : 0;
  const absorption  = (volRatio > 2 && Math.abs(pct) < 2)
    ? clamp(volRatio * 10) : 0;                  // high vol + flat price = distribution/accumulation
  const dpConsist   = (ma50 > 0 && price > ma50) ? 45 : 20;
  const darkPool    = clamp(Math.round(dpBuyPressure * 0.50 + absorption * 0.30 + dpConsist * 0.20));

  const darkPoolFlags: string[] = [];
  if (darkPool >= 75)                                darkPoolFlags.push('🌑 Smart Money Entry');
  else if (darkPool >= 50)                           darkPoolFlags.push('🌑 Accumulation Signal');
  if (volRatio > 2 && Math.abs(pct) < 2)            darkPoolFlags.push('🔒 Price Suppression Active');
  if (squeezeSetup)                                  darkPoolFlags.push('🔀 Short Trap Forming');
  if (price > (ma50 || 0) && price > (ma200 || 0))  darkPoolFlags.push('📊 Above Key MAs');

  /* ── Catalyst Score ── */
  const catalyst      = clamp(Math.round(catalystScore));
  const catalystFlags: string[] = [];
  if (volRatio >= 5)                  catalystFlags.push(`⚡ Volume Spike ${volRatio.toFixed(1)}×`);
  else if (volRatio >= 3)             catalystFlags.push(`⚡ Vol ${volRatio.toFixed(1)}× avg`);
  if (pct > 10 && volRatio >= 2)      catalystFlags.push('💥 Confirmed Breakout');
  else if (pct > 5)                   catalystFlags.push('📈 Momentum Move');
  if (squeezeSetup)                   catalystFlags.push(`🚨 Squeeze ${(shortFl*100).toFixed(0)}% short`);
  if (price >= high52 * 0.90)         catalystFlags.push('🏆 Near 52w High');

  /* ── Imminent Score = P1×50% + Catalyst×30% + DarkPool×20% ── */
  const imminentScore = clamp(Math.round(finalScore * 0.50 + catalyst * 0.30 + darkPool * 0.20));

  /* ── Accumulation phase ── */
  let accumPhase: AccumPhase = 'none';
  if (squeezeSetup)                              accumPhase = 'squeeze';
  else if (catalyst >= 70 && finalScore >= 60)   accumPhase = 'breakout';
  else if (darkPool >= 70 && Math.abs(pct) < 3)  accumPhase = darkPool >= 85 ? 'active-accum' : 'early-accum';

  /* ── P1 signal flags ── */
  const flags: string[] = [];
  if (imminentScore > 85 && confidence >= 55) flags.push('🔥 Imminent Surge');
  else if (imminentScore > 68 && confidence >= 45) flags.push('⚡ Surge Candidate');
  if (squeezeSetup)                           flags.push('🚨 Short Squeeze Setup');
  if (pct > 10 && volRatio >= 3)              flags.push('💥 Active Breakout');
  if (volRatio >= 5)                          flags.push('📊 Extreme Volume');
  if (pct < -5 && volRatio >= 3)              flags.push('⚠️ Heavy Sell Pressure');
  if (price <= low52 * 1.05)                  flags.push('⚠️ Near 52-Week Low');

  return {
    score: finalScore, confidence, momentum: Math.round(momentumScore),
    darkPool, catalyst, imminentScore, accumPhase,
    components: {
      priceAction:  { score: Math.round(priceScore),    label: 'Price Action'  },
      volumeSurge:  { score: Math.round(volScore),      label: 'Volume Surge'  },
      shortSqueeze: { score: Math.round(squeezeScore),  label: 'Squeeze Setup' },
      floatPressure:{ score: Math.round(floatScore),    label: 'Float Pressure'},
      momentum:     { score: Math.round(momentumScore), label: 'Technicals'    },
      catalyst:     { score: Math.round(catalystScore), label: 'Catalyst'      },
    },
    flags, darkPoolFlags, catalystFlags,
    risk, squeezeSetup, volRatio: Math.round(volRatio * 10) / 10,
  };
}
