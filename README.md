# Solana Surge Scanner — NSA Admin Edition v3.1.0-nsa

Real-time Solana token surge scanner. **Live data only** — no mock data ever shown.

---

## Live URL

### Option A — GitHub Pages (30-second setup, your domain)

1. Go to **https://github.com/witternif2003-beep/T1/settings/pages**
2. Under **Source**, select **"Deploy from a branch"**
3. Branch: **`gh-pages`** → Folder: **`/(root)`** → click **Save**
4. Wait ~60 seconds → your app is live at:

```
https://witternif2003-beep.github.io/T1/
```

The `gh-pages` branch with the built app is already pushed and ready.

---

### Option B — Netlify (free, custom subdomain, one-click)

Click this button → log in → your app deploys automatically:

[![Deploy to Netlify](https://www.netlify.com/img/deploy/button.svg)](https://app.netlify.com/start/deploy?repository=https://github.com/witternif2003-beep/T1)

You'll get a URL like `https://[random-name].netlify.app`

---

### Option C — Vercel (free, custom subdomain, one-click)

[![Deploy with Vercel](https://vercel.com/button)](https://vercel.com/new/clone?repository-url=https%3A%2F%2Fgithub.com%2Fwitternif2003-beep%2FT1)

You'll get a URL like `https://[repo-name].vercel.app`

---

### Option D — Surge.sh (free, fully custom domain)

```bash
npm install -g surge
cd /path/to/this/repo
surge . your-chosen-name.surge.sh
```

---

## Features

| Feature | Details |
|---|---|
| **Live data only** | No mock/demo fallback — hard error screen when API unreachable |
| **CSP meta tag** | Content-Security-Policy restricts fetch origins |
| **JWT-style session token** | Ephemeral tab-scoped token (header.payload.sig) |
| **Rate-limit awareness** | 30 req/min client guard with countdown |
| **Fetch integrity checks** | Non-null object assertion on every API response |
| **WebGL capability detection** | WebGL1/2 probe + GPU renderer string |
| **Admin panel + live diagnostics** | SYSTEM · NETWORK · EVENT LOG with force-fetch |
| **P1 v3 + momentum scoring** | 6-component weighted score with confidence dampening |
| **3D telemetry** | Three.js r128 rotating bar chart with momentum rings |

## P1 v3 Score Components

| Component | Weight | Signal |
|---|---|---|
| Price Δ m5 | 25% | Magnitude + 1h directional alignment; late-signal penalty if 24h > 300% |
| Volume Surge | 22% | m5/h1 ratio; 2× acceleration multiplier |
| Liquidity | 18% | liq/mcap ratio |
| TX Velocity | 15% | m5/h1 tx ratio; buy-pressure multipliers at 1.5× and 4× |
| MC/FDV | 10% | Unlock pressure indicator |
| Momentum | 10% | Positive TF alignment (5m · 1h · 6h · 24h) |

## Network Architecture

```
boosted → pairs → primary → gainers
  ├── corsproxy.io fallback
  └── allorigins.win fallback
```

10s timeout · 2 retries · 1.5s/4s backoff · 30 req/min client rate-limit

Data: [DexScreener public API](https://dexscreener.com) · Not financial advice
