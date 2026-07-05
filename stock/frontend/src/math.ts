// ▸ MATH UTILITIES & TECHNICAL INDICATORS

export const clamp = (n: number, a: number, b: number) => Math.max(a, Math.min(b, n));
export const fmt = (n?: number | null, d = 2) =>
  n == null || Number.isNaN(n) ? "N/A" : n.toFixed(d);
export const usd = (n?: number | null) =>
  n == null || Number.isNaN(n) ? "N/A" : `$${n >= 1 ? n.toFixed(2) : n.toFixed(4)}`;
export const pct = (n?: number | null) =>
  n == null || Number.isNaN(n) ? "N/A" : `${n >= 0 ? "+" : ""}${n.toFixed(2)}%`;

export const sma = (xs: number[], len: number): number | null => {
  if (xs.length < len) return null;
  return xs.slice(-len).reduce((a, b) => a + b, 0) / len;
};

export const ema = (xs: number[], len: number): number | null => {
  if (xs.length < len) return null;
  const k = 2 / (len + 1);
  let out = xs.slice(0, len).reduce((a, b) => a + b, 0) / len;
  for (let i = len; i < xs.length; i++) out = xs[i] * k + out * (1 - k);
  return out;
};

export const rsi = (xs: number[], len: number): number | null => {
  if (xs.length <= len) return null;
  let gains = 0;
  let losses = 0;

  for (let i = xs.length - len; i < xs.length; i++) {
    const prev = xs[i - 1];
    const cur = xs[i];
    if (prev == null || cur == null) continue;
    const diff = cur - prev;
    if (diff >= 0) gains += diff;
    else losses += Math.abs(diff);
  }

  if (losses === 0) return 100;
  const rs = gains / losses;
  return 100 - 100 / (1 + rs);
};

export const stddev = (xs: number[]): number | null => {
  if (!xs.length) return null;
  const m = xs.reduce((a, b) => a + b, 0) / xs.length;
  return Math.sqrt(xs.reduce((a, b) => a + (b - m) ** 2, 0) / xs.length);
};

export const vwap = (closes: number[], volumes: number[]): number | null => {
  if (!closes.length || !volumes.length) return null;
  const minLen = Math.min(closes.length, volumes.length);
  let cum = 0;
  let cumVol = 0;
  for (let i = 0; i < minLen; i++) {
    cum += closes[i] * volumes[i];
    cumVol += volumes[i];
  }
  return cumVol ? cum / cumVol : null;
};

export const choosePattern = (closes: number[]): { name: string; score: number } => {
  if (closes.length < 30) return { name: "PATTERN ENGINE WAIT", score: 0 };

  const last = closes[closes.length - 1];
  const hi20 = Math.max(...closes.slice(-20));
  const lo20 = Math.min(...closes.slice(-20));
  const ma10 = sma(closes, 10) ?? last;
  const ma20 = sma(closes, 20) ?? last;
  const vol = stddev(closes.slice(-20)) ?? 0;

  if (last >= hi20 * 0.995 && ma10 > ma20) return { name: "BREAK & RETEST", score: 82 };
  if (last <= lo20 * 1.005 && ma10 < ma20) return { name: "BREAKDOWN & RETURN", score: 74 };
  if (last > ma20 && last < ma10) return { name: "PULLBACK", score: 66 };
  if (vol / Math.max(last, 0.0001) < 0.04) return { name: "COIL", score: 71 };
  return { name: "SUCKER / RANGE", score: 48 };
};

export function mulberry32(seed: number) {
  return function () {
    seed |= 0;
    seed = (seed + 0x6d2b79f5) | 0;
    let t = Math.imul(seed ^ (seed >>> 15), 1 | seed);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

export const seedFrom = (s: string) => s.split("").reduce((a, c) => a + c.charCodeAt(0), 0);

// ▸ P1 COLOR MAPPING - TIER1 NEON GLOW FOR SURGE CANDIDATES
export const p1Color = (score: number, isTier1: boolean = false): string => {
  if (isTier1 && score >= 80) return "#00ffff"; // Neon glow light blue for Tier1
  if (score >= 80) return "#00f0ff";  // cyan
  if (score >= 60) return "#00ff88";  // green
  if (score >= 40) return "#ffaa00";  // amber
  return "#ff3366";                   // red
};

// ▸ GLOW EFFECT SHADOW (Tier1 neon)
export const glowShadow = (isTier1: boolean = false): string => {
  if (isTier1) return "0 0 24px rgba(0,255,255,.4), 0 0 12px rgba(0,255,255,.6)";
  return "0 0 18px rgba(0,240,255,.15)";
};
