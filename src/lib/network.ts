import { ENDPOINTS, PROXIES, REQUEST_TIMEOUT } from './constants';
import { RateLimit } from './rateLimit';
import type { FetchResult, LogLevel, Pair } from '../types';

type LogFn = (level: LogLevel, msg: string) => void;

async function fetchWithRetry(url: string, maxRetries = 2): Promise<FetchResult> {
  const delays = [1500, 4000];
  let lastErr = 'Unknown error';
  let latency = 0;

  for (let i = 0; i < maxRetries; i++) {
    const t0 = Date.now();
    try {
      const ctrl  = new AbortController();
      const timer = setTimeout(() => ctrl.abort(), REQUEST_TIMEOUT);
      const res   = await fetch(url, {
        signal:  ctrl.signal,
        headers: { 'Cache-Control': 'no-cache' },
      });
      clearTimeout(timer);
      latency = Date.now() - t0;
      if (!res.ok) throw new Error(`HTTP ${res.status} ${res.statusText}`);
      const data: unknown = await res.json();
      // integrity: reject null / non-object
      if (typeof data !== 'object' || data === null) throw new Error('Non-object response');
      return { ok: true, data, latency };
    } catch (e) {
      latency = Date.now() - t0;
      lastErr = (e instanceof Error)
        ? (e.name === 'AbortError' ? 'Request timed out after 10s' : e.message)
        : String(e);
      if (i < maxRetries - 1) await new Promise(r => setTimeout(r, delays[i]));
    }
  }
  return { ok: false, error: lastErr, latency };
}

export function classifyError(err: string | undefined): string {
  const e = (err ?? '').toLowerCase();
  if (e.includes('cors') || e.includes('failed to fetch') || e.includes('load failed') ||
      e.includes('blocked') || e.includes('cross-origin') || e.includes('not allowed'))  return 'cors';
  if (e.includes('network') || e.includes('offline') || e.includes('connection'))        return 'network';
  if (e.includes('timed out') || e.includes('timeout') || e.includes('abort'))           return 'timeout';
  if (e.includes('http 4') || e.includes('http 5'))                                      return 'http';
  if (e.includes('non-object') || e.includes('json'))                                    return 'parse';
  return 'unknown';
}

export async function fetchAllEndpoints(logFn: LogFn): Promise<FetchResult> {
  if (!RateLimit.check()) {
    logFn('warn', `Rate limit hit — ${RateLimit.resetIn()}s until reset`);
    return { ok: false, error: `Rate limited — wait ${RateLimit.resetIn()}s`, latency: 0 };
  }

  for (const [name, url] of Object.entries(ENDPOINTS)) {
    logFn('info', `Trying: ${name}`);
    const r = await fetchWithRetry(url);
    if (r.ok) {
      logFn('ok', `${name} → ${r.latency}ms (direct)`);
      return { ...r, source: name, proxied: false };
    }
    logFn('warn', `${name} failed (${classifyError(r.error)}) — trying proxies`);
    for (const proxy of PROXIES) {
      logFn('info', `Proxy: ${proxy.split('?')[0]}`);
      const pr = await fetchWithRetry(proxy + encodeURIComponent(url));
      if (pr.ok) {
        logFn('ok', `Proxy → ${pr.latency}ms`);
        return { ...pr, source: name, proxied: true };
      }
      logFn('warn', `Proxy failed: ${pr.error}`);
    }
  }
  return { ok: false, error: 'All endpoints and proxies exhausted', latency: 0 };
}

/* ── Normalise any DexScreener response shape → Pair[] ── */
function mapItem(p: Record<string, unknown>): Pair {
  return {
    baseToken:   {
      address: String(p.tokenAddress ?? p.address ?? ''),
      symbol:  String(p.symbol ?? '?'),
      name:    String(p.name ?? p.symbol ?? '?'),
    },
    priceUsd:    String(p.priceUsd   ?? '0'),
    priceChange: (p.priceChange  as Pair['priceChange'])  ?? {},
    volume:      (p.volume       as Pair['volume'])       ?? {},
    txns:        (p.txns         as Pair['txns'])         ?? {},
    liquidity:   (p.liquidity    as Pair['liquidity'])    ?? {},
    marketCap:   p.marketCap  as number | undefined,
    fdv:         p.fdv        as number | undefined,
    pairAddress: String(p.pairAddress ?? p.tokenAddress ?? ''),
    dexId:       String(p.dexId ?? 'unknown'),
    chainId:     'solana',
  };
}

function hasBase(p: unknown): p is Record<string, unknown> {
  if (typeof p !== 'object' || p === null) return false;
  const r = p as Record<string, unknown>;
  return 'baseToken' in r || 'tokenAddress' in r;
}

export function normalisePairs(data: unknown): Pair[] {
  if (!data || typeof data !== 'object') return [];
  const d = data as Record<string, unknown>;

  if (Array.isArray(d.pairs))
    return (d.pairs as unknown[]).filter((p): p is Pair => {
      return typeof p === 'object' && p !== null && 'baseToken' in p;
    });

  if (Array.isArray(d.data))
    return (d.data as unknown[]).filter(hasBase).map(p => mapItem(p as Record<string, unknown>));

  if (Array.isArray(data))
    return (data as unknown[]).filter(hasBase).map(p => mapItem(p as Record<string, unknown>));

  return [];
}
