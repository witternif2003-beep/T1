# Solana Surge Scanner — NSA Admin Edition v3.1.0-nsa

Live data only — no mock data. Scans Solana DEX tokens via DexScreener and ranks by P1 v3 priority score for imminent surge detection.

## Live URL

**GitHub Pages:** https://witternif2003-beep.github.io/T1/

Deploys automatically on every push to `main` via GitHub Actions.

## One-click Deployment (custom domain)

| Platform | Steps |
|---|---|
| **Netlify** | Drag-and-drop `index.html` at [app.netlify.com/drop](https://app.netlify.com/drop) |
| **Vercel** | `npx vercel --prod` in this directory |
| **Cloudflare Pages** | Connect repo at [pages.cloudflare.com](https://pages.cloudflare.com), set build output to `/` |
| **Surge.sh** | `npx surge . your-domain.surge.sh` |

## Features

| Feature | Details |
|---|---|
| **Live data only** | No mock/demo fallback — shows error screen when API unreachable |
| **CSP meta tag** | Content-Security-Policy restricts fetch origins |
| **JWT-style session token** | Ephemeral tab-scoped token (header.payload.sig) |
| **Rate-limit awareness** | 30 req/min client guard with countdown |
| **Fetch integrity checks** | Non-null object assertion on every API response |
| **WebGL capability detection** | WebGL1/2 probe + GPU renderer string |
| **Admin panel + live diagnostics** | SYSTEM · NETWORK · EVENT LOG sections |
| **P1 v3 + momentum scoring** | 6-component weighted score with confidence dampening |
| **3D telemetry** | Three.js r128 rotating bar chart with momentum rings |

## P1 v3 Score Components

- **Price Δ m5** (25%) — magnitude + 1h alignment; late-signal penalty if 24h > 300%
- **Volume Surge** (22%) — m5/h1 ratio; 2× acceleration multiplier
- **Liquidity** (18%) — liq/mcap ratio
- **TX Velocity** (15%) — m5/h1 tx ratio + buy-pressure multipliers at 1.5× and 4×
- **MC/FDV** (10%) — unlock pressure indicator
- **Momentum** (10%) — positive timeframe alignment (5m · 1h · 6h · 24h)

## Network Architecture

```
boosted → pairs → primary → gainers
  ├── corsproxy.io fallback per endpoint
  └── allorigins.win fallback per endpoint
```

10s request timeout · 2 retries with 1.5s/4s backoff

Data source: [DexScreener public API](https://dexscreener.com) · Not financial advice
