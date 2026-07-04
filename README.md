# Solana Surge Scanner — NSA Admin Edition v3.0.0-nsa

A self-contained, zero-build single-file web app that scans Solana DEX tokens for imminent price surge candidates using the proprietary **P1 v3 scoring engine**.

## Features

### NSA Admin Mode Enhancements
| Feature | Details |
|---|---|
| **Upgraded CDN deps** | React 18.3.1 · Babel standalone 7.24.7 · Three.js r128 |
| **CSP meta tag** | `Content-Security-Policy` restricts allowed origins |
| **JWT-style session token** | Ephemeral `header.payload.sig` token, tab-scoped, no persistence |
| **Rate-limit awareness** | Client-side 30 req/min guard with countdown display |
| **Fetch integrity checks** | Non-null object assertion on every API response |
| **WebGL capability detection** | WebGL1/2 probe with GPU renderer string in admin panel |
| **Admin panel + live diagnostics** | System · Network · Event Log sections with force-fetch & clear-log |
| **P1 v3 engine + momentum scoring** | 6-component weighted score with multi-TF trend alignment |

### P1 v3 Score Engine Components
- **Price Δ m5** (25%) — magnitude + directional alignment; late-signal penalty if 24h > 300%
- **Volume Surge** (22%) — m5 vs h1 average ratio; 2x acceleration multiplier
- **Liquidity** (18%) — liq/mcap ratio or log-scale fallback
- **TX Velocity** (15%) — m5 tx vs h1 average; buy-pressure multiplier at 1.5x and 4x ratios
- **MC/FDV** (10%) — unlock-pressure indicator
- **Momentum** (10%) — positive timeframe alignment ratio (5m · 1h · 6h · 24h)

Final score is dampened by a confidence factor derived from data completeness (0–6 fields).

### Network Resilience
- 4 DexScreener endpoints tried in order: `primary → boosted → pairs → gainers`
- 2 CORS proxy fallbacks per endpoint: `corsproxy.io → allorigins.win`
- 10s request timeout per attempt, 2 retries with 1.5s / 4s backoff
- Live/Proxied/Demo-mode banners with latency telemetry

### 3D Telemetry (Three.js)
- Top 6 tokens by 1h volume rendered as coloured 3D bars
- White needle = P1 score height above bar
- Orange torus ring = high momentum (>70)
- Auto-rotating camera; full cleanup on unmount

## Usage

Open `index.html` in any modern browser — no build step required.

All data sourced from the public [DexScreener API](https://dexscreener.com). When live data is unavailable, 8 illustrative mock tokens are displayed with a prominent DEMO MODE banner. **Not financial advice.**

## Tech Stack
- React 18.3.1 (UMD)
- Babel standalone 7.24.7 (in-browser JSX transpilation)
- Three.js r128 (3D telemetry)
- DexScreener public API
