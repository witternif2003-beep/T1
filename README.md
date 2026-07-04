# Solana Surge Scanner — NSA Admin Edition

**v3.1.0-nsa** · React 18 · TypeScript · Vite 6 · Three.js r170

Real-time Solana token surge scanner built as a proper compiled Vite + React app — same architecture as Design Arena web apps.

---

## Live URL

> **https://witternif2003-beep.github.io/T1/**
>
> Auto-deploys on every push to `main` via GitHub Actions (build → deploy to `gh-pages`).
>
> **One-time setup:** Go to [Settings → Pages](https://github.com/witternif2003-beep/T1/settings/pages), set source to **"Deploy from a branch"** → `gh-pages` → `/(root)` → Save.

### One-click alternatives (custom subdomain)

| Platform | Link |
|---|---|
| Netlify | [app.netlify.com/start/deploy?repository=…](https://app.netlify.com/start/deploy?repository=https://github.com/witternif2003-beep/T1) |
| Vercel  | [vercel.com/new/clone?repository-url=…](https://vercel.com/new/clone?repository-url=https%3A%2F%2Fgithub.com%2Fwitternif2003-beep%2FT1) |

---

## Development

```bash
npm install
npm run dev       # vite dev server at localhost:5173
npm run build     # tsc + vite production build → dist/
npm run preview   # preview production build
```

## Project Structure

```
src/
├── main.tsx              # React entry point
├── App.tsx               # Root component + state management
├── index.css             # All styles (design tokens, layout, components)
├── types.ts              # Shared TypeScript interfaces
├── lib/
│   ├── constants.ts      # Endpoints, proxies, URL builders
│   ├── session.ts        # JWT-style ephemeral session token
│   ├── rateLimit.ts      # 30 req/min client-side guard
│   ├── formatters.ts     # USD, %, volume, time formatters
│   ├── computeP1.ts      # P1 v3 score engine
│   └── network.ts        # fetchWithRetry, fetchAllEndpoints, normalisePairs
└── components/
    ├── TokenCard.tsx      # Per-token card with P1 bars and links
    ├── AdminPanel.tsx     # NSA admin diagnostics panel
    ├── ErrorScreen.tsx    # Hard error state (no mock data)
    └── Telemetry3D.tsx    # Three.js 3D volume chart + WebGL detection
```

## Features

| Feature | Details |
|---|---|
| **Live data only** | No mock/demo fallback — hard `ErrorScreen` when API unreachable |
| **CSP meta tag** | Content-Security-Policy — no CDN script injection |
| **JWT-style session** | Ephemeral `header.payload.sig`, tab-scoped |
| **Rate-limit guard** | 30 req/min, countdown in admin panel |
| **Fetch integrity** | Non-null object assertion on every response |
| **WebGL detection** | WebGL1/2 probe + GPU renderer in diagnostics |
| **Admin panel** | SYSTEM · NETWORK · EVENT LOG with force-fetch |
| **P1 v3 engine** | 6-component score with momentum + confidence dampening |
| **3D telemetry** | Three.js r170 rotating volume chart with momentum rings |

## P1 v3 Score Components

| Component | Weight | Signal |
|---|---|---|
| Price Δ m5 | 25% | Magnitude + 1h alignment; late penalty if 24h > 300% |
| Volume Surge | 22% | m5/h1 ratio; 2× acceleration multiplier |
| Liquidity | 18% | liq/mcap ratio |
| TX Velocity | 15% | m5/h1 tx ratio; buy-pressure at 1.5× and 4× |
| MC/FDV | 10% | Unlock pressure |
| Momentum | 10% | Positive TF alignment (5m · 1h · 6h · 24h) |

Data: [DexScreener public API](https://dexscreener.com) · 4 endpoints · 2 CORS proxy fallbacks · Not financial advice
