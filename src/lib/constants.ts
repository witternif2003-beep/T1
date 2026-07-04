export const VERSION = {
  app:   '3.3.0-nsa',
  p1:    'v3',
  react: '18.3.1',
  three: '0.185.1',
  built: new Date().toISOString(),
} as const;

/*
 * All endpoints MUST return { pairs: [...] } with full price/volume/liquidity data.
 * The boost and token-profile endpoints only return marketing metadata (no priceUsd,
 * no volume, no txns) so they are deliberately excluded here.
 *
 * Endpoint ordering: highest data quality / most active pairs first.
 */
export const ENDPOINTS: Record<string, string> = {
  // Raydium is Solana-only → all results are Solana pairs with full price data
  raydium:     'https://api.dexscreener.com/latest/dex/search?q=raydium&limit=30',
  // SOL-quoted pairs across Solana DEXes (Orca, Raydium, Meteora)
  sol_pairs:   'https://api.dexscreener.com/latest/dex/search?q=SOL&limit=30',
  // pump.fun is Solana-only → meme/new-launch tokens with high activity
  pump:        'https://api.dexscreener.com/latest/dex/search?q=pump&limit=30',
  // Broad Solana search as final fallback
  solana:      'https://api.dexscreener.com/latest/dex/search?q=solana&limit=30',
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

/* Minimum criteria for a pair to be considered "live valid data" */
export const MIN_PRICE_USD = 0;          // priceUsd must be > 0
export const MIN_VOLUME_H24 = 0;        // volume.h24 must be > 0 (any trading activity)
