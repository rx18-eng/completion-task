# Bitcoin · USD

> **Live:** [completion-task.vercel.app](https://completion-task.vercel.app/)

A production-grade Bitcoin price dashboard — real-time BTC/USD summary, OHLC candlesticks across four timeframes, dark + light theme with a radial view-transition reveal, 60-second polling with rate-limit-aware retry, and full offline / error / stale handling. Built as the Summer of Bitcoin 2026 application task.

---

## Features

- Live BTC/USD price, 24h change, high / low, volume, market cap (polled every 60s)
- Candlestick chart with 1D / 7D / 30D / 1Y timeframes — URL-synced (`?tf=7D`) so views are deep-linkable
- Dark and light themes with a radial `clip-path` reveal via the View Transitions API
- Offline banner (auto-shown on `navigator.onLine === false`), error card with Retry, 180s stale indicator
- Keyboard-first interactions: roving tabindex on the timeframe tablist, subtle `:focus-visible` rings
- iOS-aware: `env(safe-area-inset-top)`, 44px tap targets on coarse pointers, no 300ms tap delay
- Reduced-motion respected end-to-end (preloader, marquee, price reveal, chart crossfade all short-circuit)

## Stack

| | Version | Why |
|---|---|---|
| React + TypeScript | 19.2 / 5.7 | Typed UI, runtime validation of API responses |
| Vite | 6.0 | Build + dev server |
| TanStack Query | 5.62 | Polling, caching, retry, `keepPreviousData` for smooth timeframe swaps |
| TradingView Lightweight Charts | 5.1 | Candlesticks, ~100 KB gz tree-shaken to `CandlestickSeries` only |
| GSAP | 3.12 | Preloader timeline, digit-roll price reveal, magnetic hover |
| Vitest | 4.1 | 32 unit tests on the data layer |

Data from **[CoinGecko](https://www.coingecko.com/en/api)** — public endpoints, no API key, 30 req/min.

## Architecture

Short tour of the non-obvious decisions. Full commit-level detail lives in `git log`.

**Typed data layer with runtime validation** — `api.ts` defines `PriceSummary`, `Candle`, `OhlcRow`, and a narrow `ApiError` with a discriminated `code: "rate_limited" | "network" | "parse" | "http"`. Every response flows through `parseMarketRow` / `parseCandle` — on schema drift these throw `ApiError({ code: "parse" })` rather than silently `as T` the payload into UI state. Errors surface a user-visible heading that varies by code.

**Rate-limit-aware retry** — `queryClient.ts` installs a global retry policy: 3 retries with exponential backoff capped at 30s for generic failures, but **only 1 retry** when `ApiError.isRateLimit` is true (HTTP 429). Aggressive retry on a rate-limit makes the problem worse; the single retry exists for transient 429s only.

**Transient vs hard errors** — `PriceCard`, `Chart`, and `Marquee` all use the `query.isError && !query.data` guard. A failed refetch while cached data is present keeps the UI populated; the PriceCard stale pill appears after 180s without a successful update. Only a hard failure (no cache to fall back on) surfaces the error card with the Retry button.

**Decoupled theming** — `ThemeToggle` writes `document.documentElement.dataset.theme`. `Chart.tsx` reads it via `useThemeObserver()`, a `MutationObserver` filtered to the `data-theme` attribute. No React context, no prop drilling — chart recolors reactively when the toggle fires, even though the two components never share a parent. CSS custom properties (`--fg`, `--up`, `--down`, `--border`, `--font-mono`) are read at chart-recolor time via `getComputedStyle(document.documentElement)`.

**Polling cadence per endpoint** — summary polls every 60s with a 50s `staleTime`; OHLC polls every 5 minutes with a 4-minute `staleTime`. CoinGecko's OHLC refreshes roughly every 15 minutes upstream, so tighter polling would only burn quota.

**Price-reveal animation is an accessibility hazard, handled** — `AnimatedPrice` renders the visible digit-roll inside `aria-hidden`, with a sibling `<span className="sr-only" aria-live="polite" aria-atomic>` carrying the plain number. Screen readers read a clean "$64,321" and skip the per-character `yPercent` stagger.

## Project structure

```
api.ts           — CoinGecko client, types, validators, formatters
api.test.ts      — 32 unit tests (ApiError, parsers, formatters, time)
hooks.ts         — usePriceSummary, useOhlc, useTimeframe, useTheme,
                   useMagnetic, useOnline, useThemeObserver, usePriceFlash
queryClient.ts   — retry policy (rate-limit aware)
App.tsx          — shell + preloader timeline
PriceCard.tsx    — summary card + skeleton + error branch + stale pill
Chart.tsx        — lightweight-charts wrapper + timeframe tablist
AnimatedPrice.tsx, Marquee.tsx, ThemeToggle.tsx,
OfflineBanner.tsx, RetryButton.tsx
index.html       — design tokens, component CSS, preloader markup
```

## Running locally

```bash
git clone git@github.com:rx18-eng/completion-task.git
cd completion-task
npm install

npm run dev       # http://localhost:5173
npm test          # vitest, 32 tests, ~300ms
npm run build     # tsc -b && vite build
npm run preview   # serve dist/ locally
```

No environment variables required — CoinGecko endpoints are public.

## Credits

- Price data — [CoinGecko](https://www.coingecko.com/en/api)
- Charts — [TradingView Lightweight Charts](https://www.tradingview.com/lightweight-charts/)
- Animation — [GSAP](https://gsap.com/)

Licensed under the repository's license.
