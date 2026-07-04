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

/*
 * Quality gate: a pair is "valid live data" when:
 *  - chainId is solana
 *  - priceUsd is a positive number (not '0', not missing)
 *  - has at least some trading volume in the past 24h
 */
function isLivePair(p: Pair): boolean {
  const price = parseFloat(p.priceUsd);
  const vol24  = p.volume?.h24 ?? 0;
  return (
    p.chainId === 'solana' &&
    !isNaN(price) &&
    price > 0 &&
    vol24 > 0
  );
}

/* Normalise DexScreener pair object → typed Pair */
function normalisePairObj(p: Record<string, unknown>): Pair {
  // Shape from { pairs: [...] } — baseToken is already nested
  const bt = p.baseToken as Record<string, unknown> | undefined;
  return {
    chainId:     String(p.chainId ?? 'unknown'),
    dexId:       String(p.dexId   ?? 'unknown'),
    baseToken: {
      address: String(bt?.address ?? p.tokenAddress ?? p.address ?? ''),
      symbol:  String(bt?.symbol  ?? p.symbol  ?? '?'),
      name:    String(bt?.name    ?? p.name    ?? bt?.symbol ?? p.symbol ?? '?'),
    },
    priceUsd:    String(p.priceUsd   ?? '0'),
    priceChange: (p.priceChange  as Pair['priceChange'])  ?? {},
    volume:      (p.volume       as Pair['volume'])       ?? {},
    txns:        (p.txns         as Pair['txns'])         ?? {},
    liquidity:   (p.liquidity    as Pair['liquidity'])    ?? {},
    marketCap:   typeof p.marketCap === 'number' ? p.marketCap : undefined,
    fdv:         typeof p.fdv       === 'number' ? p.fdv       : undefined,
    pairAddress: String(p.pairAddress ?? p.tokenAddress ?? ''),
  };
}

function hasBase(p: unknown): p is Record<string, unknown> {
  if (typeof p !== 'object' || p === null) return false;
  const r = p as Record<string, unknown>;
  return Boolean(r.baseToken || r.tokenAddress);
}

/*
 * Normalise any DexScreener response shape → validated Pair[]
 * Only returns Solana pairs that have actual price and volume data.
 */
export function normalisePairs(data: unknown): Pair[] {
  if (!data || typeof data !== 'object') return [];
  const d = data as Record<string, unknown>;
  let raw: Pair[] = [];

  // Shape 1: { pairs: [...] }  ← DexScreener search endpoint
  if (Array.isArray(d.pairs)) {
    raw = (d.pairs as unknown[])
      .filter(hasBase)
      .map(p => normalisePairObj(p as Record<string, unknown>));

  // Shape 2: { data: [...] }  ← token-profile endpoint (no price data, kept for fallback)
  } else if (Array.isArray(d.data)) {
    raw = (d.data as unknown[])
      .filter(hasBase)
      .map(p => normalisePairObj(p as Record<string, unknown>));

  // Shape 3: top-level array  ← token-boosts endpoint (no price data, kept for fallback)
  } else if (Array.isArray(data)) {
    raw = (data as unknown[])
      .filter(hasBase)
      .map(p => normalisePairObj(p as Record<string, unknown>));
  }

  // Quality gate: Solana-only + must have real price + must have trading activity
  return raw.filter(isLivePair);
}

/*
 * Try each endpoint in order; fall through if the response contains 0 valid pairs.
 * This correctly handles endpoints like /token-boosts that return HTTP 200 but
 * have no price/volume data, ensuring we always get actionable pair data.
 */
export async function fetchAllEndpoints(logFn: LogFn): Promise<FetchResult> {
  if (!RateLimit.check()) {
    logFn('warn', `Rate limit hit — ${RateLimit.resetIn()}s until reset`);
    return { ok: false, error: `Rate limited — wait ${RateLimit.resetIn()}s`, latency: 0 };
  }

  for (const [name, url] of Object.entries(ENDPOINTS)) {
    logFn('info', `Trying: ${name}`);
    const r = await fetchWithRetry(url);

    if (r.ok) {
      // Pre-validate before returning — reject responses with 0 live pairs
      const preview = normalisePairs(r.data);
      if (preview.length > 0) {
        logFn('ok', `${name} → ${r.latency}ms — ${preview.length} Solana pairs with price data`);
        return { ...r, source: name, proxied: false };
      }
      logFn('warn', `${name} → HTTP 200 but 0 valid Solana pairs (no price data) — skipping`);
      // Fall through to next endpoint / proxies
    } else {
      logFn('warn', `${name} failed (${classifyError(r.error)}) — trying proxies`);
    }

    // Try CORS proxies for this endpoint
    for (const proxy of PROXIES) {
      logFn('info', `Proxy: ${proxy.split('?')[0]}`);
      const pr = await fetchWithRetry(proxy + encodeURIComponent(url));
      if (pr.ok) {
        const preview = normalisePairs(pr.data);
        if (preview.length > 0) {
          logFn('ok', `Proxy → ${pr.latency}ms — ${preview.length} Solana pairs`);
          return { ...pr, source: name, proxied: true };
        }
        logFn('warn', `Proxy → HTTP 200 but 0 valid pairs — skipping`);
      } else {
        logFn('warn', `Proxy failed: ${pr.error}`);
      }
    }
  }

  return { ok: false, error: 'All endpoints and proxies exhausted', latency: 0 };
}
