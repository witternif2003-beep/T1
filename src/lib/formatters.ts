export function fmtUSD(v: string | number | undefined | null): string {
  const n = parseFloat(String(v ?? ''));
  if (v == null || isNaN(n)) return '—';
  if (n === 0)          return '$0.00';
  if (n < 0.000_001)   return `$${n.toExponential(2)}`;
  if (n < 0.000_1)     return `$${n.toFixed(8)}`;
  if (n < 0.01)        return `$${n.toFixed(6)}`;
  if (n < 1)           return `$${n.toFixed(4)}`;
  return `$${n.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
}

export function fmtPct(v: number | undefined | null): string {
  if (v == null || isNaN(v)) return '—';
  return `${v >= 0 ? '+' : ''}${v.toFixed(2)}%`;
}

export function fmtVol(v: number | undefined | null): string {
  if (v == null || isNaN(v) || v === 0) return '—';
  if (v >= 1e12) return `$${(v / 1e12).toFixed(2)}T`;
  if (v >= 1e9)  return `$${(v / 1e9).toFixed(2)}B`;
  if (v >= 1e6)  return `$${(v / 1e6).toFixed(2)}M`;
  if (v >= 1e3)  return `$${(v / 1e3).toFixed(1)}K`;
  return `$${v.toFixed(2)}`;
}

export function fmtTime(ts: number | null | undefined): string {
  if (!ts) return '—';
  return new Date(ts).toLocaleTimeString([], { hour12: false });
}

export function fmtDuration(ms: number): string {
  if (ms < 1000)   return `${ms}ms`;
  if (ms < 60_000) return `${(ms / 1000).toFixed(1)}s`;
  return `${Math.floor(ms / 60_000)}m ${Math.round((ms % 60_000) / 1000)}s`;
}
