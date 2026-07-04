export const VERSION = {
  app:   '1.2.0-nsa',
  p1:    'v3-stock',
  react: '18.3.1',
  three: '0.185.1',
  built: new Date().toISOString(),
} as const;

/*
 * ENDPOINT STRATEGY — ordered by reliability:
 * 1. watchlist_a / watchlist_b: Direct quote lookup for 60 known penny symbols.
 *    Most reliable — works during market hours AND after-hours/weekends.
 * 2. small_cap: Yahoo small-cap gainers screener. Returns sub-$1 stocks more often.
 * 3. gainers / actives: Broad screeners — rarely have sub-$1 results but try anyway.
 *
 * ALL endpoints are tried and results are MERGED + deduplicated (not chain-stopped).
 * Each endpoint counts as 1 rate-limit hit. Max 5 hits per scan.
 */
const WATCHLIST_A = [
  'SNDL','FFIE','MULN','CENN','GFAI','NCTY','SIEB','IDEX','INPX','BFRI',
  'GOEV','HYZN','AYRO','ATXI','IMCC','EDSA','SOBR','PHIO','BHAT','PEGY',
  'VVPR','HCDI','BSFC','FCUV','COHN','AEMD','KULR','ENZC','CRVW','RSSS',
].join(',');

const WATCHLIST_B = [
  'BLEG','CETX','MINE','OESX','DPWW','GOFF','DPLS','CLPS','BIVI','MDVX',
  'CNEY','NRXP','APGN','LIQT','SLNA','HYAC','GREE','GMGI','BOXL','BLBX',
  'ABVC','ACMR','AEYE','AFRI','AGFY','AGRI','AHCO','ALLR','AMMO','AKER',
].join(',');

const YF_QUOTE_BASE = 'https://query1.finance.yahoo.com/v7/finance/quote?formatted=false&symbols=';

export const ENDPOINTS: Record<string, string> = {
  watchlist_a: YF_QUOTE_BASE + WATCHLIST_A,
  watchlist_b: YF_QUOTE_BASE + WATCHLIST_B,
  small_cap:   'https://query1.finance.yahoo.com/v1/finance/screener/predefined/saved?scrIds=small_cap_gainers&count=50&formatted=false',
  gainers:     'https://query1.finance.yahoo.com/v1/finance/screener/predefined/saved?scrIds=day_gainers&count=50&formatted=false',
};

export const PROXIES: string[] = [
  'https://corsproxy.io/?url=',
  'https://api.allorigins.win/raw?url=',
];

/* ── External link builders ── */
export const YAHOO_URL     = (s: string) => `https://finance.yahoo.com/quote/${s}`;
export const FINVIZ_URL    = (s: string) => `https://finviz.com/quote.ashx?t=${s}`;
export const STOCKANALYSIS = (s: string) => `https://stockanalysis.com/stocks/${s.toLowerCase()}/`;
export const SHORTSQUEEZE  = (s: string) => `https://shortsqueeze.com/?symbol=${s}&submit=Short+Quote%E2%84%A2`;
export const BARCHART_URL  = (s: string) => `https://www.barchart.com/stocks/quotes/${s}/overview`;

export const MAX_PRICE_USD   = 1.00;
export const RATE_LIMIT_MAX  = 30;
export const RATE_LIMIT_MS   = 60_000;
export const REQUEST_TIMEOUT = 9_000;   // 9s (was 12s — faster fail = less blocking)
export const MAX_LOGS        = 80;

/* Imminent score threshold for "Surge Alert" badge */
export const SURGE_THRESHOLD = 55;   // lowered from 68; closed-market data has lower momentum
