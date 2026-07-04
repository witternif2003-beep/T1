export const VERSION = {
  app:   '1.1.0-nsa',
  p1:    'v3-stock',
  react: '18.3.1',
  three: '0.185.1',
  built: new Date().toISOString(),
} as const;

/*
 * Stock data endpoints — all return JSON with quote arrays.
 * Yahoo Finance screeners: returns top movers with full price/volume data.
 * Watchlist: direct quote lookup for 30 known penny stocks.
 * All require CORS proxy from browser context.
 */
export const ENDPOINTS: Record<string, string> = {
  gainers:   'https://query1.finance.yahoo.com/v1/finance/screener/predefined/saved?scrIds=day_gainers&count=50&formatted=false',
  actives:   'https://query1.finance.yahoo.com/v1/finance/screener/predefined/saved?scrIds=most_actives&count=50&formatted=false',
  small_cap: 'https://query1.finance.yahoo.com/v1/finance/screener/predefined/saved?scrIds=small_cap_gainers&count=50&formatted=false',
  watchlist: [
    'https://query1.finance.yahoo.com/v7/finance/quote',
    '?symbols=SNDL,MULN,CENN,GFAI,NCTY,SIEB,IDEX,INPX,BFRI,GOEV,',
    'HYZN,FFIE,AYRO,ATXI,IMCC,EDSA,SOBR,PEGY,BHAT,AEMD,',
    'PHIO,HCDI,TLGA,COHN,VVPR,APRE,MGAM,FCUV,FRGE,BSFC',
    '&formatted=false',
  ].join(''),
};

export const PROXIES: string[] = [
  'https://corsproxy.io/?url=',
  'https://api.allorigins.win/raw?url=',
];

/* External link builders */
export const YAHOO_URL     = (s: string) => `https://finance.yahoo.com/quote/${s}`;
export const FINVIZ_URL    = (s: string) => `https://finviz.com/quote.ashx?t=${s}`;
export const STOCKANALYSIS = (s: string) => `https://stockanalysis.com/stocks/${s.toLowerCase()}/`;
export const SHORTSQUEEZE  = (s: string) => `https://shortsqueeze.com/?symbol=${s}&submit=Short+Quote%E2%84%A2`;
export const BARCHART_URL  = (s: string) => `https://www.barchart.com/stocks/quotes/${s}/overview`;

export const MAX_PRICE_USD   = 1.00;
export const RATE_LIMIT_MAX  = 30;
export const RATE_LIMIT_MS   = 60_000;
export const REQUEST_TIMEOUT = 12_000;
export const MAX_LOGS        = 80;
