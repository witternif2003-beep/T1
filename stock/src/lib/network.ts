import { ENDPOINTS, PROXIES, REQUEST_TIMEOUT, MAX_PRICE_USD } from './constants';
import { RateLimit } from './rateLimit';
import type { Stock, YFQuote, LogLevel } from '../types';

type LogFn = (level: LogLevel, msg: string) => void;

/* ── Market hours helper ── */
export function isMarketOpen(): boolean {
  const now   = new Date();
  const etNow = new Date(now.toLocaleString('en-US', { timeZone: 'America/New_York' }));
  const day   = etNow.getDay();   // 0=Sun, 6=Sat
  const h     = etNow.getHours();
  const m     = etNow.getMinutes();
  const mins  = h * 60 + m;
  if (day === 0 || day === 6) return false;   // weekend
  return mins >= 9 * 60 + 30 && mins < 16 * 60; // 09:30–16:00 ET
}

export function marketStatusMsg(): string {
  const now   = new Date();
  const etNow = new Date(now.toLocaleString('en-US', { timeZone: 'America/New_York' }));
  const day   = etNow.getDay();
  if (day === 0) return 'NYSE closed — Sunday';
  if (day === 6) return 'NYSE closed — Saturday';
  const h = etNow.getHours(), m = etNow.getMinutes();
  const mins = h * 60 + m;
  if (mins < 9 * 60 + 30) return `Pre-market — opens ${9 - Math.floor((9*60+30-mins)/60)}:${String(30-(9*60+30-mins)%60).padStart(2,'0')} ET`;
  if (mins >= 16 * 60) return 'After-hours — NYSE closed at 16:00 ET';
  return 'NYSE open';
}

async function fetchWithRetry(url: string, maxRetries = 2): Promise<{
  ok: boolean; data?: unknown; error?: string; latency: number;
}> {
  const delays = [2000, 5000];
  let lastErr  = 'Unknown error', latency = 0;
  for (let i = 0; i < maxRetries; i++) {
    const t0 = Date.now();
    try {
      const ctrl  = new AbortController();
      const timer = setTimeout(() => ctrl.abort(), REQUEST_TIMEOUT);
      const res   = await fetch(url, {
        signal:  ctrl.signal,
        headers: { 'Cache-Control': 'no-cache', 'Accept': 'application/json' },
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
        ? (e.name === 'AbortError' ? 'Request timed out (12s)' : e.message)
        : String(e);
      if (i < maxRetries - 1) await new Promise(r => setTimeout(r, delays[i]));
    }
  }
  return { ok: false, error: lastErr, latency };
}

export function classifyError(err: string | undefined): string {
  const e = (err ?? '').toLowerCase();
  if (e.includes('cors') || e.includes('failed to fetch') || e.includes('blocked'))   return 'cors';
  if (e.includes('network') || e.includes('offline'))                                  return 'network';
  if (e.includes('timed out') || e.includes('abort'))                                  return 'timeout';
  if (e.includes('http 4') || e.includes('http 5'))                                    return 'http';
  if (e.includes('closed') || e.includes('no stocks'))                                 return 'market';
  return 'unknown';
}

/* ── Extract YFQuote[] from any Yahoo Finance response shape ── */
function extractQuotes(data: unknown): YFQuote[] {
  if (!data || typeof data !== 'object') return [];
  const d = data as Record<string, unknown>;

  // v1/finance/screener/predefined/saved → { finance: { result: [{ quotes: [...] }] } }
  const finance = d.finance as Record<string, unknown> | undefined;
  if (finance) {
    const result = finance.result as Array<Record<string, unknown>> | undefined;
    if (Array.isArray(result) && result.length > 0) {
      const quotes = result[0].quotes;
      if (Array.isArray(quotes)) return quotes as YFQuote[];
    }
  }

  // v7/finance/quote → { quoteResponse: { result: [...] } }
  const qr = d.quoteResponse as Record<string, unknown> | undefined;
  if (qr) {
    const result = qr.result;
    if (Array.isArray(result)) return result as YFQuote[];
  }

  return [];
}

/* ── Map raw YF quote → normalised Stock ── */
function mapQuote(q: YFQuote): Stock | null {
  const price = q.regularMarketPrice ?? 0;
  if (price <= 0 || price > MAX_PRICE_USD)                           return null;
  if (q.quoteType && !['EQUITY', 'ETF'].includes(q.quoteType))       return null;
  if ((q.regularMarketVolume ?? 0) < 500)                            return null;
  return {
    symbol:      q.symbol,
    name:        q.shortName || q.longName || q.symbol,
    exchange:    q.fullExchangeName || q.exchange || 'US',
    price,
    changeAmt:   q.regularMarketChange          ?? 0,
    changePct:   q.regularMarketChangePercent    ?? 0,
    volume:      q.regularMarketVolume           ?? 0,
    avgVolume10d:q.averageDailyVolume10Day       ?? 0,
    avgVolume3m: q.averageDailyVolume3Month      ?? 0,
    high52w:     q.fiftyTwoWeekHigh              ?? 0,
    low52w:      q.fiftyTwoWeekLow               ?? 0,
    ma50:        q.fiftyDayAverage               ?? 0,
    ma200:       q.twoHundredDayAverage          ?? 0,
    marketCap:   q.marketCap                     ?? 0,
    floatShares: q.floatShares                   ?? 0,
    shortFloat:  q.shortPercentOfFloat           ?? 0,
    shortRatio:  q.shortRatio                    ?? 0,
    dayHigh:     q.regularMarketDayHigh          ?? price,
    dayLow:      q.regularMarketDayLow           ?? price,
    marketState: q.marketState                   ?? 'UNKNOWN',
  };
}

function isValidStock(s: Stock): boolean {
  return s.price > 0 && s.price <= MAX_PRICE_USD && s.volume >= 500;
}

export function normaliseStocks(data: unknown): Stock[] {
  return extractQuotes(data)
    .map(mapQuote)
    .filter((s): s is Stock => s !== null && isValidStock(s));
}

/* ── Main fetch orchestrator ── */
export async function fetchAllEndpoints(logFn: LogFn): Promise<{
  ok: boolean; data?: unknown; source?: string;
  proxied?: boolean; latency: number; error?: string;
}> {
  if (!RateLimit.check()) {
    logFn('warn', `Rate limit hit — ${RateLimit.resetIn()}s reset`);
    return { ok: false, error: `Rate limited — wait ${RateLimit.resetIn()}s`, latency: 0 };
  }

  for (const [name, url] of Object.entries(ENDPOINTS)) {
    logFn('info', `Trying: ${name}`);

    /* Direct attempt */
    const r = await fetchWithRetry(url);
    if (r.ok) {
      const stocks = normaliseStocks(r.data);
      if (stocks.length > 0) {
        logFn('ok', `${name} → ${r.latency}ms — ${stocks.length} penny stocks (direct)`);
        return { ...r, source: name, proxied: false };
      }
      logFn('warn', `${name} → 0 stocks ≤$${MAX_PRICE_USD} — ${marketStatusMsg()}`);
    } else {
      logFn('warn', `${name} direct failed: ${r.error}`);
    }

    /* CORS proxy fallback */
    for (const proxy of PROXIES) {
      logFn('info', `Proxy: ${proxy.split('?')[0]}`);
      const pr = await fetchWithRetry(proxy + encodeURIComponent(url));
      if (pr.ok) {
        const stocks = normaliseStocks(pr.data);
        if (stocks.length > 0) {
          logFn('ok', `${name} via proxy → ${pr.latency}ms — ${stocks.length} stocks`);
          return { ...pr, source: name, proxied: true };
        }
        logFn('warn', `${name} via proxy → 0 stocks`);
      } else {
        logFn('warn', `Proxy failed: ${pr.error}`);
      }
    }
  }

  const status = marketStatusMsg();
  return {
    ok: false,
    error: `All sources exhausted — ${status}. Yahoo Finance data requires market hours (Mon–Fri 09:30–16:00 ET).`,
    latency: 0,
  };
}
