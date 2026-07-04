/* ── Raw Yahoo Finance quote shape (subset we use) ── */
export interface YFQuote {
  symbol:                       string;
  shortName?:                   string;
  longName?:                    string;
  exchange?:                    string;
  fullExchangeName?:            string;
  quoteType?:                   string;
  marketState?:                 string;
  regularMarketPrice?:          number;
  regularMarketChange?:         number;
  regularMarketChangePercent?:  number;
  regularMarketVolume?:         number;
  regularMarketDayHigh?:        number;
  regularMarketDayLow?:         number;
  averageDailyVolume10Day?:     number;
  averageDailyVolume3Month?:    number;
  fiftyTwoWeekHigh?:            number;
  fiftyTwoWeekLow?:             number;
  fiftyDayAverage?:             number;
  twoHundredDayAverage?:        number;
  marketCap?:                   number;
  floatShares?:                 number;
  shortPercentOfFloat?:         number;
  shortRatio?:                  number;
}

/* ── Normalised internal stock representation ── */
export interface Stock {
  symbol:       string;
  name:         string;
  exchange:     string;
  price:        number;
  changeAmt:    number;
  changePct:    number;
  volume:       number;
  avgVolume10d: number;
  avgVolume3m:  number;
  high52w:      number;
  low52w:       number;
  ma50:         number;
  ma200:        number;
  marketCap:    number;
  floatShares:  number;
  shortFloat:   number;   // 0–1
  shortRatio:   number;
  dayHigh:      number;
  dayLow:       number;
  marketState:  string;
}

export type RiskLevel  = 'low' | 'medium' | 'high' | 'unknown';
export type LogLevel   = 'ok' | 'warn' | 'err' | 'info' | 'admin';
export type AccumPhase = 'early-accum' | 'active-accum' | 'squeeze' | 'breakout' | 'none';

export interface P1Component { score: number; label: string }

export interface StockP1 {
  score:         number;
  confidence:    number;
  momentum:      number;
  darkPool:      number;
  catalyst:      number;
  imminentScore: number;
  accumPhase:    AccumPhase;
  components:    Record<string, P1Component>;
  flags:         string[];
  darkPoolFlags: string[];
  catalystFlags: string[];
  risk:          RiskLevel;
  squeezeSetup:  boolean;
  volRatio:      number;
}

export interface FetchStats {
  source:     string;
  proxied:    boolean;
  latency:    number | null;
  fetchCount: number;
  errorCount: number;
  lastFetch:  number | null;
}

export interface LogEntry {
  t:     number;
  level: LogLevel;
  msg:   string;
}

export type LogAction =
  | { type: 'add'; level: LogLevel; msg: string }
  | { type: 'clear' };
