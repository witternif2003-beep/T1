export interface TokenBase {
  address: string;
  symbol: string;
  name: string;
}

export interface PriceChange {
  m5?: number;
  h1?: number;
  h6?: number;
  h24?: number;
}

export interface Volume {
  m5?: number;
  h1?: number;
  h6?: number;
  h24?: number;
}

export interface TxSide {
  buys?: number;
  sells?: number;
}

export interface Txns {
  m5?: TxSide;
  h1?: TxSide;
  h6?: TxSide;
  h24?: TxSide;
}

export interface Liquidity {
  usd?: number;
}

export interface Pair {
  chainId: string;
  dexId: string;
  baseToken: TokenBase;
  priceUsd: string;
  priceChange: PriceChange;
  volume: Volume;
  txns: Txns;
  liquidity: Liquidity;
  marketCap?: number;
  fdv?: number;
  pairAddress: string;
}

export type RiskLevel = 'low' | 'medium' | 'high' | 'unknown';
export type LogLevel  = 'ok' | 'warn' | 'err' | 'info' | 'admin';

export interface P1Component {
  score: number;
  label: string;
}

export interface P1Result {
  score: number;
  confidence: number;
  momentum: number;
  components: Record<string, P1Component>;
  flags: string[];
  risk: RiskLevel;
  buyRatio: number;
}

export interface FetchStats {
  source: string;
  proxied: boolean;
  latency: number | null;
  fetchCount: number;
  errorCount: number;
  lastFetch: number | null;
}

export interface LogEntry {
  t: number;
  level: LogLevel;
  msg: string;
}

export type LogAction =
  | { type: 'add'; level: LogLevel; msg: string }
  | { type: 'clear' };

export type SortKey = 'p1' | 'momentum' | 'vol' | 'price' | 'liq';

export interface FetchResult {
  ok: boolean;
  data?: unknown;
  error?: string;
  latency: number;
  source?: string;
  proxied?: boolean;
}
