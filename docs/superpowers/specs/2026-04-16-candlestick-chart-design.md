# Commit 5: Candlestick Chart

## Summary

Add a TradingView lightweight-charts v5 candlestick chart below the price card, driven by `fetchOhlc("1D")`. The chart reads CSS custom properties at runtime so theme toggle recolors it without remount. Uses `autoSize: true` (built-in ResizeObserver). Skeleton + error states match the PriceCard pattern. Commit 6 will layer the timeframe switcher on top.

## Architecture

Three units:

1. **`api.ts`** — minor refactor: extract `describeError(error)` from `PriceCard.tsx` to `api.ts` so both PriceCard and Chart share it. No other API changes — `fetchOhlc(timeframe, signal)` already exists.
2. **`hooks.ts`** — add `useOhlc(timeframe)` and `useThemeObserver()`.
3. **`Chart.tsx`** (new) — contains `Chart` (outer), `ChartCanvas` (lightweight-charts integration), `ChartSkeleton`, `ChartError`.

## Data flow

```
useOhlc("1D")  →  query state  →  <Chart>
                                    ├─ isPending  →  <ChartSkeleton/>
                                    ├─ isError    →  <ChartError error={}/>
                                    └─ data       →  <ChartCanvas data={} />
                                                        ├─ effect [mount]:   createChart + addSeries
                                                        ├─ effect [data]:    series.setData + fitContent
                                                        ├─ effect [theme]:   applyOptions
                                                        └─ cleanup:          chart.remove()
```

## `hooks.ts` additions

### `useOhlc(timeframe)`

```typescript
const OHLC_POLL_MS = 5 * 60_000;   // CoinGecko refreshes OHLC every 15 min
const OHLC_STALE_MS = 4 * 60_000;

export function useOhlc(timeframe: Timeframe) {
  return useQuery<Candle[]>({
    queryKey: ["btc", "ohlc", timeframe],
    queryFn: ({ signal }) => fetchOhlc(timeframe, signal),
    refetchInterval: OHLC_POLL_MS,
    staleTime: OHLC_STALE_MS,
  });
}
```

### `useThemeObserver()`

Watches `document.documentElement.dataset.theme` via MutationObserver. Returns current theme as React state. Used only by ChartCanvas.

```typescript
export function useThemeObserver(): "light" | "dark" {
  const [theme, setTheme] = useState<"light" | "dark">(() =>
    document.documentElement.dataset.theme === "dark" ? "dark" : "light"
  );
  useEffect(() => {
    const html = document.documentElement;
    const obs = new MutationObserver(() => {
      setTheme(html.dataset.theme === "dark" ? "dark" : "light");
    });
    obs.observe(html, { attributes: true, attributeFilter: ["data-theme"] });
    return () => obs.disconnect();
  }, []);
  return theme;
}
```

## `api.ts` refactor

Move `describeError(error)` from `PriceCard.tsx` to `api.ts` (just below the `ApiError` class). Export it. Update `PriceCard.tsx` to import it. Chart imports it too.

```typescript
export function describeError(error: unknown): { heading: string; message: string } {
  if (error instanceof ApiError) {
    switch (error.code) {
      case "rate_limited": return { heading: "Rate Limited", message: "CoinGecko is rate limiting this session. Retrying automatically." };
      case "network":      return { heading: "Offline", message: "Network unavailable. Retrying when the connection returns." };
      case "parse":        return { heading: "Unexpected Response", message: "The API returned data in an unexpected shape." };
      case "http":         return { heading: `HTTP ${error.status}`, message: "Upstream server error. Retrying automatically." };
    }
  }
  return { heading: "Error", message: "Couldn't load data." };
}
```

## `Chart.tsx`

### Imports

```typescript
import { useEffect, useMemo, useRef } from "react";
import {
  createChart,
  CandlestickSeries,
  type IChartApi,
  type ISeriesApi,
  type DeepPartial,
  type ChartOptions,
  type CandlestickSeriesPartialOptions,
} from "lightweight-charts";
import { describeError, type Candle, type Timeframe } from "./api";
import { useOhlc, useThemeObserver } from "./hooks";
```

### `<Chart timeframe="1D">`

- Calls `useOhlc(timeframe)`
- Returns `<ChartSkeleton />` if pending, `<ChartError />` if error, else `<ChartCard><ChartCanvas /></ChartCard>`
- The card wrapper is part of `<Chart>` so skeleton and error share the same outer shell — layout doesn't shift

### `<ChartCanvas data>`

- `containerRef: RefObject<HTMLDivElement | null>` — the div lightweight-charts mounts into
- `chartRef: RefObject<IChartApi | null>`, `seriesRef: RefObject<ISeriesApi<"Candlestick"> | null>`
- Uses `useThemeObserver()` to get current theme (reactive dep for effect #3)
- Reads CSS variables via a helper:
  ```ts
  function cssVar(name: string): string {
    return getComputedStyle(document.documentElement).getPropertyValue(name).trim();
  }
  ```
- Three effects:
  1. **Mount effect (deps: [])** — `createChart(container, baseChartOptions())` + `addSeries(CandlestickSeries, seriesColors())`. Cleanup: `chart.remove()` + null out refs.
  2. **Data effect (deps: [data])** — `seriesRef.current?.setData(data)` + `chartRef.current?.timeScale().fitContent()`.
  3. **Theme effect (deps: [theme])** — `chartRef.current?.applyOptions(baseChartOptions())` + `seriesRef.current?.applyOptions(seriesColors())`. The first run after mount is a redundant no-op (same colors), which is fine — applyOptions is idempotent.

- Returns `<div ref={containerRef} className="chart-canvas" />`

### Chart options builders

```typescript
function baseChartOptions(): DeepPartial<ChartOptions> {
  return {
    autoSize: true,
    layout: {
      background: { color: "transparent" },
      textColor: cssVar("--fg-mute"),
      fontFamily: cssVar("--font-mono"),
      fontSize: 11,
    },
    grid: {
      vertLines: { color: cssVar("--border") },
      horzLines: { color: cssVar("--border") },
    },
    crosshair: { mode: 1 },   // magnet
    timeScale: {
      borderVisible: false,
      timeVisible: true,
      secondsVisible: false,
    },
    rightPriceScale: { borderVisible: false },
  };
}

function seriesColors(): CandlestickSeriesPartialOptions {
  return {
    upColor: cssVar("--up"),
    downColor: cssVar("--down"),
    borderUpColor: cssVar("--up"),
    borderDownColor: cssVar("--down"),
    wickUpColor: cssVar("--up"),
    wickDownColor: cssVar("--down"),
    borderVisible: true,
  };
}
```

### `<ChartCard>` wrapper

Shared between canvas, skeleton, and error. Accepts `{ children, variant?: "error", heading?: string }`. Renders:

```tsx
<section className={`card chart-card ${variant === "error" ? "card--error" : ""}`}>
  <header className="card__head">
    <span className={variant === "error" ? "eyebrow eyebrow--error" : "eyebrow"}>
      {heading ?? "Price History"}
    </span>
    <span className="eyebrow">1D · BTC/USD</span>
  </header>
  {children}
</section>
```

### `<ChartSkeleton>`

24 faux candle columns. Heights generated once at mount via `useMemo(() => ..., [])` using a seeded sequence so it's stable. Each bar: `.chart-skeleton__bar.skeleton` with `height: N%`.

### `<ChartError error>`

Calls `describeError(error)`. Renders inside `<ChartCard variant="error">` with the describeError `heading` passed in (overriding the default "Price History" eyebrow):

```tsx
<p className="card__error-msg">{message}</p>
```

`ChartCard` accepts an optional `heading` prop so the error card shows "Rate Limited" / "Offline" / "Unexpected Response" / etc. instead of "Price History".

## CSS additions (in `index.html`)

```css
.shell__main {
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: clamp(20px, 3vh, 32px);
  place-items: unset;  /* override the earlier grid place-items */
}

.chart-card {
  /* inherits .card */
  padding: clamp(20px, 3vw, 32px);
  gap: clamp(16px, 2vh, 24px);
}

.chart-card__canvas,
.chart-canvas {
  width: 100%;
  height: clamp(280px, 38vh, 420px);
  position: relative;
}

html[data-stage="ready"] .chart-card {
  animation-delay: 120ms;
}

.chart-skeleton {
  display: flex;
  align-items: flex-end;
  gap: 4px;
  width: 100%;
  height: clamp(280px, 38vh, 420px);
  padding-bottom: 20px;
}

.chart-skeleton__bar {
  flex: 1;
  min-width: 3px;
  border-radius: 2px;
}
```

## `App.tsx` integration

```tsx
<main className="shell__main">
  <PriceCard />
  <Chart timeframe="1D" />
</main>
```

One import added: `import { Chart } from "./Chart";`.

## Backend quality details

- **Query key**: `["btc", "ohlc", "1D"]` — structured, deduplicated per timeframe (ready for commit 6)
- **AbortSignal threaded** through `fetchOhlc` to TanStack Query
- **Runtime validation** already in place (`parseCandle` in api.ts from commit 3)
- **5-min poll** not 60s — OHLC server updates every 15 min; faster polling is wasted CoinGecko quota
- **No silent fallbacks** — if `createChart` throws (unlikely but possible in exotic browsers), it propagates; error boundary would catch it (not in this commit, commit 8)
- **StrictMode-safe** — mount effect has clean `chart.remove()` cleanup; double-invoke in dev creates+destroys cleanly
- **Theme observer cleanup** — MutationObserver.disconnect in effect return

## What's NOT in scope

- Timeframe switcher — commit 6
- Crosshair tooltip overlay — commit 7 polish
- `series.update(bar)` incremental — CoinGecko returns whole window, `setData` is correct
- Chart-specific theme tokens — reuse `--up`, `--down`, `--border`, `--fg-mute`, `--font-mono`
- Error boundary — commit 8

## Verification plan

- `npm run build` passes
- Chart renders candles matching BTC 1D movement
- Theme toggle recolors chart without flicker/remount (verify via DevTools — chart canvas element persists)
- Resize window: chart canvas resizes (autoSize)
- Network offline at load: `ChartError` shows with "Offline" / "Network unavailable…"
- Skeleton shows during initial load
- StrictMode: no console warnings on mount/unmount cycle
- Mobile viewport (<640px): chart height clamps to 280px, card width adapts
