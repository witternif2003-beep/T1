import { ENDPOINTS, PROXIES, REQUEST_TIMEOUT, MAX_PRICE_USD } from './constants';
import { RateLimit } from './rateLimit';
import type { Stock, YFQuote, LogLevel } from '../types';

type LogFn = (level: LogLevel, msg: string) => void;

/* ── Market hours (Eastern Time) ── */
export function isMarketOpen(): boolean {
  const etNow = new Date(new Date().toLocaleString('en-US', { timeZone: 'America/New_York' }));
  const day   = etNow.getDay();
  if (day === 0 || day === 6) return false;
  const mins  = etNow.getHours() * 60 + etNow.getMinutes();
  return mins >= 570 && mins < 960;   // 09:30–16:00
}

export function marketStatusMsg(): string {
  const etNow = new Date(new Date().toLocaleString('en-US', { timeZone: 'America/New_York' }));
  const day   = etNow.getDay();
  const days  = ['Sunday','Monday','Tuesday','Wednesday','Thursday','Friday','Saturday'];
  if (day === 0 || day === 6) return `NYSE closed — ${days[day]}`;
  const h = etNow.getHours(), m = etNow.getMinutes();
  const mins = h * 60 + m;
  if (mins < 570)  return 'Pre-market (opens 09:30 ET)';
  if (mins >= 960) return 'After-hours (closed 16:00 ET)';
  return 'NYSE open';
}

/* ── Fetch with timeout + retries ── */
async function fetchOnce(url: string): Promise<{ ok: boolean; data?: unknown; latency: number; error?: string }> {
  const t0 = Date.now();
  try {
    const ctrl  = new AbortController();
    const timer = setTimeout(() => ctrl.abort(), REQUEST_TIMEOUT);
    const res   = await fetch(url, {
      signal:  ctrl.signal,
      headers: { 'Cache-Control': 'no-cache', 'Accept': 'application/json' },
    });
    clearTimeout(timer);
    const latency = Date.now() - t0;
    if (!res.ok) return { ok: false, latency, error: `HTTP ${res.status}` };
    const data: unknown = await res.json();
    if (typeof data !== 'object' || data === null) return { ok: false, latency, error: 'Non-object response' };
    return { ok: true, data, latency };
  } catch (e) {
    return {
      ok: false, latency: Date.now() - t0,
      error: (e instanceof Error)
        ? (e.name === 'AbortError' ? `Timed out (${REQUEST_TIMEOUT / 1000}s)` : e.message)
        : String(e),
    };
  }
}

export function classifyError(err: string | undefined): string {
  const e = (err ?? '').toLowerCase();
  if (e.includes('cors') || e.includes('failed to fetch') || e.includes('blocked') || e.includes('load failed')) return 'cors';
  if (e.includes('network') || e.includes('offline'))       return 'network';
  if (e.includes('timed out') || e.includes('abort'))       return 'timeout';
  if (e.includes('http 4') || e.includes('http 5'))         return 'http';
  if (e.includes('no stocks') || e.includes('closed'))      return 'market';
  return 'unknown';
}

/* ── Parse Yahoo Finance response → YFQuote[] ── */
function extractQuotes(data: unknown): YFQuote[] {
  if (!data || typeof data !== 'object') return [];
  const d = data as Record<string, unknown>;

  // v7/finance/quote shape: { quoteResponse: { result: [...] } }
  const qr = d.quoteResponse as Record<string, unknown> | undefined;
  if (qr) {
    const result = qr.result;
    if (Array.isArray(result)) return result as YFQuote[];
  }

  // v1/finance/screener shape: { finance: { result: [{ quotes: [...] }] } }
  const fin = d.finance as Record<string, unknown> | undefined;
  if (fin) {
    const result = fin.result as Array<Record<string, unknown>> | undefined;
    if (Array.isArray(result) && result.length > 0) {
      const quotes = result[0].quotes;
      if (Array.isArray(quotes)) return quotes as YFQuote[];
    }
  }

  return [];
}

/* ── Map YFQuote → normalised Stock ── */
function mapQuote(q: YFQuote): Stock | null {
  const price = q.regularMarketPrice ?? 0;
  if (price <= 0 || price > MAX_PRICE_USD)                             return null;
  if (q.quoteType && !['EQUITY', 'ETF'].includes(q.quoteType))         return null;
  if ((q.regularMarketVolume ?? 0) < 100)                              return null;
  return {
    symbol:       q.symbol,
    name:         q.shortName || q.longName || q.symbol,
    exchange:     q.fullExchangeName || q.exchange || 'US',
    price,
    changeAmt:    q.regularMarketChange          ?? 0,
    changePct:    q.regularMarketChangePercent   ?? 0,
    volume:       q.regularMarketVolume          ?? 0,
    avgVolume10d: q.averageDailyVolume10Day      ?? 0,
    avgVolume3m:  q.averageDailyVolume3Month     ?? 0,
    high52w:      q.fiftyTwoWeekHigh             ?? 0,
    low52w:       q.fiftyTwoWeekLow              ?? 0,
    ma50:         q.fiftyDayAverage              ?? 0,
    ma200:        q.twoHundredDayAverage         ?? 0,
    marketCap:    q.marketCap                    ?? 0,
    floatShares:  q.floatShares                  ?? 0,
    shortFloat:   Math.min(q.shortPercentOfFloat ?? 0, 1),
    shortRatio:   q.shortRatio                   ?? 0,
    dayHigh:      q.regularMarketDayHigh         ?? price,
    dayLow:       q.regularMarketDayLow          ?? price,
    marketState:  q.marketState                  ?? 'UNKNOWN',
  };
}

function isValidStock(s: Stock): boolean {
  return s.price > 0 && s.price <= MAX_PRICE_USD && s.volume >= 100;
}

export function normaliseStocks(data: unknown): Stock[] {
  return extractQuotes(data)
    .map(mapQuote)
    .filter((s): s is Stock => s !== null && isValidStock(s));
}

/* ── Try one URL: direct first, then each proxy ── */
async function tryUrl(
  name: string,
  url: string,
  logFn: LogFn,
): Promise<Stock[]> {
  // Direct attempt
  const direct = await fetchOnce(url);
  if (direct.ok) {
    const stocks = normaliseStocks(direct.data);
    if (stocks.length > 0) {
      logFn('ok', `${name} direct → ${direct.latency}ms — ${stocks.length} stocks`);
      return stocks;
    }
    logFn('warn', `${name} direct → 0 sub-$${MAX_PRICE_USD} stocks`);
  } else {
    logFn('warn', `${name} direct failed: ${direct.error}`);
  }

  // Proxy fallback — stop as soon as one works
  for (const proxy of PROXIES) {
    const pr = await fetchOnce(proxy + encodeURIComponent(url));
    if (pr.ok) {
      const stocks = normaliseStocks(pr.data);
      if (stocks.length > 0) {
        logFn('ok', `${name} via proxy → ${pr.latency}ms — ${stocks.length} stocks`);
        return stocks;
      }
      logFn('warn', `${name} via proxy → 0 stocks`);
    } else {
      logFn('warn', `${name} proxy failed: ${pr.error}`);
    }
  }

  return [];
}

/*
 * Main orchestrator — key design decisions vs v1.1:
 *
 * 1. MERGE not CHAIN: All endpoints are tried and results combined.
 *    Previously we stopped at the first endpoint returning >0 stocks,
 *    causing only 8 stocks from small_cap. Now we collect from all.
 *
 * 2. RATE LIMIT: Only one RateLimit.check() per full scan (not per endpoint).
 *    Individual endpoint retries do NOT count separately.
 *
 * 3. WATCHLIST PRIORITY: watchlist_a and watchlist_b are tried first.
 *    These are direct quote lookups for 60 known penny stocks — more
 *    reliable than screeners which rarely return sub-$1 results.
 *
 * 4. DEDUPLICATION: Stocks from multiple endpoints merged by symbol.
 */
export async function fetchAllEndpoints(logFn: LogFn): Promise<{
  ok: boolean; stocks: Stock[]; source: string; proxied: boolean; latency: number; error?: string;
}> {
  if (!RateLimit.check()) {
    logFn('warn', `Rate limit hit — ${RateLimit.resetIn()}s until reset`);
    return { ok: false, stocks: [], source: '—', proxied: false, latency: 0, error: `Rate limited — wait ${RateLimit.resetIn()}s` };
  }

  const t0            = Date.now();
  const allStocks:   Stock[]  = [];
  const seenSymbols: Set<string> = new Set();
  const sources:     string[] = [];

  logFn('admin', `Scanning ${Object.keys(ENDPOINTS).length} endpoints — ${marketStatusMsg()}`);

  for (const [name, url] of Object.entries(ENDPOINTS)) {
    logFn('info', `Trying: ${name}`);
    const batch = await tryUrl(name, url, logFn);
    if (batch.length > 0) {
      sources.push(name);
      for (const s of batch) {
        if (!seenSymbols.has(s.symbol)) {
          seenSymbols.add(s.symbol);
          allStocks.push(s);
        }
      }
      logFn('ok', `${name} added ${batch.length} stocks (total: ${allStocks.length} unique)`);
    }
  }

  const totalLatency = Date.now() - t0;

  if (allStocks.length === 0) {
    const status = marketStatusMsg();
    return {
      ok: false, stocks: [], source: '—', proxied: false, latency: totalLatency,
      error: `0 stocks ≤$${MAX_PRICE_USD} found across all sources — ${status}`,
    };
  }

  logFn('ok', `✓ ${allStocks.length} unique penny stocks from [${sources.join(', ')}] in ${totalLatency}ms`);
  return {
    ok: true,
    stocks: allStocks,
    source: sources.join('+'),
    proxied: false,      // not meaningful now (per-endpoint); flag managed by tryUrl
    latency: totalLatency,
  };
}
