export const VERSION = {
  app:   '3.2.0-nsa',
  p1:    'v3',
  react: '18.3.1',
  three: '0.185.1',
  built: new Date().toISOString(),
} as const;

export const ENDPOINTS: Record<string, string> = {
  boosted: 'https://api.dexscreener.com/token-boosts/latest/v1',
  pairs:   'https://api.dexscreener.com/latest/dex/search?q=solana&limit=30',
  primary: 'https://api.dexscreener.com/token-profiles/latest/v1',
  gainers: 'https://api.dexscreener.com/latest/dex/tokens/trending',
};

export const PROXIES: string[] = [
  'https://corsproxy.io/?url=',
  'https://api.allorigins.win/raw?url=',
];

export const SOLSCAN_URL      = (a: string) => `https://solscan.io/token/${a}`;
export const BIRDEYE_URL      = (a: string) => `https://birdeye.so/token/${a}?chain=solana`;
export const DEXSCREENER_PAIR = (a: string) => `https://dexscreener.com/solana/${a}`;
export const RUGCHECK_URL     = (a: string) => `https://rugcheck.xyz/tokens/${a}`;
export const GMGN_URL         = (a: string) => `https://gmgn.ai/sol/token/${a}`;

export const RATE_LIMIT_MAX  = 30;
export const RATE_LIMIT_MS   = 60_000;
export const REQUEST_TIMEOUT = 10_000;
export const MAX_LOGS        = 80;
