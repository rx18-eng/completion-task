# Bitcoin · USD

> **Live:** [completion-task.vercel.app](https://completion-task.vercel.app/)

BTC/USD dashboard built as the Summer of Bitcoin 2026 application task. Price and candlesticks come from CoinGecko. Block height, halving countdown, and fee estimates come from mempool.space. 60-second polling with rate-limit-aware retry, and an offline / error / stale path on every card.

---

## Features

- Live BTC/USD price, 24h change, high / low, volume, market cap — polled every 60s
- Candlestick chart with 1D / 7D / 30D / 1Y timeframes — URL-synced (`?tf=7D`) so views are deep-linkable
- Chart shows its candle granularity under the canvas (e.g. "30-minute candles" on 1D, "4-day candles" on 1Y) — CoinGecko's OHLC resolution varies by window
- On-chain panel from mempool.space: block height, time since last block, next halving countdown, fee estimates in sat/vB (fastest / 30m / 1h)
- Polling pauses when the tab is hidden; resyncs on refocus so countdowns don't show a stale value for a beat after the user comes back
- Dark and light themes with a radial `clip-path` reveal via the View Transitions API
- Offline banner on `navigator.onLine === false`, per-card error cards with Retry, a 180s stale pill on the price card
- Keyboard-first interactions: roving tabindex on the timeframe tablist, `:focus-visible` rings
- iOS-aware: `env(safe-area-inset-top)`, 44px tap targets on coarse pointers, no 300ms tap delay
- Reduced-motion respected end-to-end (preloader, marquee, price reveal, chart crossfade all short-circuit)

## Stack

| | Version | Why |
|---|---|---|
| React + TypeScript | 19.2 / 5.7 | Typed UI, runtime validation of API payloads |
| Vite | 6.0 | Build + dev server |
| TanStack Query | 5.62 | Polling, caching, retry, `keepPreviousData` for timeframe swaps |
| TradingView Lightweight Charts | 5.1 | Candlesticks; tree-shaken to `CandlestickSeries` only |
| GSAP | 3.12 | Preloader timeline, digit-roll price reveal, magnetic hover |
| Vitest | 4.1 | 58 unit tests on the data layer |

Data comes from **[CoinGecko](https://www.coingecko.com/en/api)** (price + OHLC, 30 req/min, no key) and **[mempool.space](https://mempool.space/docs/api/rest)** (block + fees, no key). Both are public.

## Architecture

Short tour of the non-obvious decisions. Full commit-level detail is in `git log`.

**Typed data layer with runtime validation.** `api.ts` holds all types and an `ApiError` with a discriminated `code: "rate_limited" | "network" | "http" | "parse"`. Every response runs through a parser — `parseMarketRow`, `parseCandle`, `parseBlock`, `parseFeeEstimates` — that throws `ApiError("parse")` if the upstream drifts. Nothing gets `as T`-cast into UI state. `describeError(code)` maps each code to a human-readable heading so every error branch renders the same shape.

**Shared fetch transport and the CORS-masked 429 heuristic.** Both providers go through a single `fetchJson(url, signal)`. CoinGecko drops its `Access-Control-Allow-Origin` header on 429 responses. The browser then hides the status code and surfaces a bare `TypeError`. Naively that reads as a network failure and triggers the generic 3-retry path — exactly the wrong thing when you're already being throttled. The catch block uses `navigator.onLine` as a tiebreaker: offline → `ApiError("network")`, online → `ApiError("rate_limited")`. Rate-limit retries then wait 15 seconds flat. CoinGecko uses a 30 req/min sliding window; anything shorter lands in the same bucket.

**Transient vs hard errors.** `PriceCard`, `Chart`, `BitcoinMetrics`, and `Marquee` all use the `query.isError && !query.data` guard. A failed refetch while cached data is still visible keeps the UI populated, and the background retry keeps running. A hard failure — no cache at all — swaps in the error card with the Retry button. The price card adds a "stale" pill after 180 seconds without a successful update.

**Polling cadence per endpoint.** Summary polls every 60s with a 50s `staleTime`. OHLC polls every 5 minutes with a 4-minute `staleTime` — CoinGecko refreshes OHLC roughly every 15 minutes upstream, so tighter polling is wasted quota. Mempool metrics poll every 60s with a 50s `staleTime`; Bitcoin targets one block every ten minutes, so 60s is the right granularity for block-level freshness.

**Polling pauses in hidden tabs.** `useVisibility()` wraps `document.visibilityState`. `useNow()` drives relative-time strings and the halving countdown. It stops its interval when the tab is hidden and resyncs the clock on refocus. TanStack Query's default `refetchIntervalInBackground: false` handles the network side.

**Decoupled theming.** `ThemeToggle` writes `document.documentElement.dataset.theme`. `Chart.tsx` reads it via `useThemeObserver()`, a `MutationObserver` filtered to the `data-theme` attribute. No React context, no prop drilling — the chart recolors when the toggle fires even though the two components never share a parent. CSS custom properties (`--fg`, `--up`, `--down`, `--border`, `--font-mono`) are read at recolor time via `getComputedStyle(document.documentElement)`.

**Price reveal is an accessibility hazard, handled.** `AnimatedPrice` renders the visible digit-roll inside `aria-hidden`, with a sibling `<span className="sr-only" aria-live="polite" aria-atomic>` carrying the plain number. Screen readers read "$64,321" and skip the per-character `yPercent` stagger.

## Project structure

```
api.ts           — CoinGecko + mempool.space client, types,
                   validators, formatters (incl. computeHalvingCountdown)
api.test.ts      — 58 unit tests (ApiError, parsers, formatters,
                   fetchJson CORS/429 classification, halving math)
hooks.ts         — usePriceSummary, useBitcoinMetrics, useOhlc,
                   useTimeframe, useThemeObserver, useVisibility,
                   useNow, useOnline, usePriceFlash, useMagnetic
queryClient.ts   — retry policy (3 retries generic, 1 at 15s flat for 429)
App.tsx          — shell + preloader timeline
PriceCard.tsx    — summary card + skeleton + error + stale pill
Chart.tsx        — lightweight-charts wrapper + timeframe tablist
BitcoinMetrics.tsx — on-chain panel (block, halving, fees)
AnimatedPrice.tsx, Marquee.tsx, ThemeToggle.tsx,
OfflineBanner.tsx, RetryButton.tsx
index.html       — design tokens, component CSS, preloader markup
.github/workflows/ci.yml — typecheck + build + tests on push/PR to main
```

## Running locally

```bash
git clone git@github.com:rx18-eng/completion-task.git
cd completion-task
npm install

npm run dev       # http://localhost:5173
npm test          # vitest, 58 tests, ~300ms
npm run build     # tsc -b && vite build
npm run preview   # serve dist/ locally
```

No environment variables required — both upstreams are public.

## Credits

- Price data — [CoinGecko](https://www.coingecko.com/en/api)
- On-chain data — [mempool.space](https://mempool.space/docs/api/rest)
- Charts — [TradingView Lightweight Charts](https://www.tradingview.com/lightweight-charts/)
- Animation — [GSAP](https://gsap.com/)

Licensed under the repository's license.
