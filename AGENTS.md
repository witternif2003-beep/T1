# AGENTS.md

## Cursor Cloud specific instructions

This repo is a **two-app monorepo** of independent client-only Vite + React 18 + TypeScript SPAs (no backend, no database, no Docker). Each app is its own npm project with its own lockfile and must be installed separately.

| App | Dir | Dev URL (with Vite `base`) | Live data source |
|-----|-----|----------------------------|------------------|
| Solana Surge Scanner | `/workspace` (root) | `http://localhost:5173/T1/` | DexScreener public API |
| NYSE Penny Surge Detector | `/workspace/stock` | `http://localhost:5174/T1/stock/` | Yahoo Finance API (+ CORS proxy fallbacks) |

Standard commands live in each `package.json` (`dev`, `build`, `preview`). Notes/gotchas:

- **Base path matters when opening in a browser.** `vite.config.ts` sets `base: '/T1/'` (root) and `/T1/stock/` (stock), so the dev server serves the app at `http://localhost:<port>/T1/...`, NOT at `/`. Opening the bare host root returns a blank/404.
- **Both apps default to Vite port 5173.** Run them on different ports if you need both at once, e.g. `npm run dev -- --port 5173` (root) and `npm run dev -- --port 5174` (stock).
- **Live data requires outbound internet.** There is no mock/demo fallback — if the external API is unreachable the app renders a hard `ErrorScreen`. A "working" test means real token/stock cards load, not just that the page renders.
- **Yahoo Finance may 429 a bare server request** (e.g. `curl`), but the stock app succeeds in the browser because it retries through CORS proxies (`corsproxy.io`, `allorigins.win`). Verify the stock app in a real browser, not with curl.
- **No lint tooling and no tests exist.** There is no ESLint/Prettier config and no test runner/scripts. The only static check is the TypeScript compiler, which runs via `npm run build` (`tsc -b && vite build`) in each app.
- **Node 22** is used in CI (`.github/workflows/deploy-pages.yml`); Vite 6 needs Node ≥ 18.
