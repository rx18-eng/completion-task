# Commit 6: Timeframe Switcher

## Summary

Add a segmented control above the candlestick chart to switch between `1D` / `7D` / `30D` / `1Y`. Selected timeframe is written to the URL (`?tf=7D`) as the single source of truth — shareable, reload-safe, validated. The active button's pill highlight slides between positions via a measured CSS transform. Chart data updates in place; the existing live-dot pulse reuses from PriceCard signals that a fetch is in flight. No skeleton flash, no localStorage layer, no crossfade.

## Architecture

Three units:

1. **`useTimeframe()`** — new hook in `hooks.ts`. Reads the `tf` query param on mount (validated against the `Timeframe` union; falls back to `"1D"` on missing/invalid). `setTimeframe` writes via `history.replaceState` and updates local React state.
2. **`<TimeframeSwitcher value onChange />`** — new component in `Chart.tsx`. 4-button segmented control with a sliding pill highlight measured from the active button's `getBoundingClientRect()`. Handles keyboard tab-list navigation.
3. **`<Chart />`** — refactored. Drops its `timeframe` prop; calls `useTimeframe()` internally. Renders the switcher inside `ChartCard`'s header. `App.tsx` just writes `<Chart />`.

## Data flow

```
URL ?tf=7D
  ↓ (on mount)
useTimeframe() validates, returns [tf, setTf]
  ↓
<Chart>
  ├─ useOhlc(tf)  →  data  →  <ChartCanvas data />
  └─ <ChartCard isFetching={query.isFetching} timeframe={tf} onTimeframeChange={setTf}>
       └─ <TimeframeSwitcher value={tf} onChange={setTf} />

User clicks [7D]:
  setTf("7D")
    ├─ history.replaceState(null, "", "?tf=7D")   [in-place URL update]
    └─ setState("7D")
         ├─ useOhlc("7D")  →  new query, cached per-key
         │   └─ isFetching=true briefly  →  live dot pulses on chart card
         └─ TimeframeSwitcher re-runs layout effect
             └─ measures new active button  →  pill transform animates
```

## `useTimeframe()` specification

```typescript
const TIMEFRAMES = ["1D", "7D", "30D", "1Y"] as const satisfies readonly Timeframe[];
const DEFAULT_TF: Timeframe = "1D";

function readTimeframeFromURL(): Timeframe {
  if (typeof window === "undefined") return DEFAULT_TF;
  const raw = new URLSearchParams(window.location.search).get("tf");
  return (TIMEFRAMES as readonly string[]).includes(raw ?? "") ? (raw as Timeframe) : DEFAULT_TF;
}

export function useTimeframe(): readonly [Timeframe, (next: Timeframe) => void] {
  const [tf, setTf] = useState<Timeframe>(readTimeframeFromURL);

  const set = useCallback((next: Timeframe) => {
    const params = new URLSearchParams(window.location.search);
    if (next === DEFAULT_TF) {
      params.delete("tf");
    } else {
      params.set("tf", next);
    }
    const qs = params.toString();
    const url = (qs ? `?${qs}` : window.location.pathname) + window.location.hash;
    window.history.replaceState(null, "", url);
    setTf(next);
  }, []);

  return [tf, set] as const;
}
```

Design choices:

- **`replaceState` (not `pushState`).** The browser Back button goes to the previous *page*, not the previous timeframe. Spamming timeframe clicks doesn't pollute history.
- **Default strips the param.** Landing on `"1D"` (the default) means `?tf` is removed — URL stays clean on fresh visits and on switches back to 1D.
- **Validates against the union.** `?tf=garbage` or `?tf=5M` silently falls back to `"1D"`; the URL gets cleaned on the next `set` call.
- **No `popstate` listener.** We are the only writer. If someone edits the URL manually, it takes effect on reload — expected behavior for a spa-less-ish app.
- **Single-argument setter.** Not `(prev) => next` — there's no concurrent-update scenario that needs it.

## `<TimeframeSwitcher value onChange />` specification

### Structure

```tsx
const TIMEFRAMES: readonly Timeframe[] = ["1D", "7D", "30D", "1Y"];

export function TimeframeSwitcher({
  value,
  onChange,
}: {
  value: Timeframe;
  onChange: (next: Timeframe) => void;
}) {
  const containerRef = useRef<HTMLDivElement | null>(null);
  const btnRefs = useRef<Partial<Record<Timeframe, HTMLButtonElement | null>>>({});
  const [pill, setPill] = useState<{ x: number; w: number }>({ x: 0, w: 0 });

  useLayoutEffect(() => {
    const container = containerRef.current;
    const btn = btnRefs.current[value];
    if (!container || !btn) return;
    const cRect = container.getBoundingClientRect();
    const bRect = btn.getBoundingClientRect();
    setPill({ x: bRect.left - cRect.left, w: bRect.width });
  }, [value]);

  useEffect(() => {
    const container = containerRef.current;
    if (!container) return;
    const ro = new ResizeObserver(() => {
      const btn = btnRefs.current[value];
      if (!btn) return;
      const cRect = container.getBoundingClientRect();
      const bRect = btn.getBoundingClientRect();
      setPill({ x: bRect.left - cRect.left, w: bRect.width });
    });
    ro.observe(container);
    return () => ro.disconnect();
  }, [value]);

  const onKeyDown = (e: KeyboardEvent<HTMLDivElement>) => {
    if (e.key !== "ArrowLeft" && e.key !== "ArrowRight") return;
    e.preventDefault();
    const idx = TIMEFRAMES.indexOf(value);
    const dir = e.key === "ArrowRight" ? 1 : -1;
    const next = TIMEFRAMES[(idx + dir + TIMEFRAMES.length) % TIMEFRAMES.length];
    onChange(next);
    btnRefs.current[next]?.focus();
  };

  return (
    <div
      ref={containerRef}
      className="tfs"
      role="tablist"
      aria-label="Chart timeframe"
      onKeyDown={onKeyDown}
    >
      <span
        className="tfs__pill"
        aria-hidden="true"
        style={{ transform: `translateX(${pill.x}px)`, width: `${pill.w}px` }}
      />
      {TIMEFRAMES.map((t) => (
        <button
          key={t}
          ref={(el) => { btnRefs.current[t] = el; }}
          className="tfs__btn"
          type="button"
          role="tab"
          aria-selected={t === value}
          tabIndex={t === value ? 0 : -1}
          data-interactive
          onClick={() => onChange(t)}
        >
          {t}
        </button>
      ))}
    </div>
  );
}
```

### Pill measurement

- **`useLayoutEffect`** (not `useEffect`) on `[value]` → measurement runs synchronously before the browser paints, so the first render never flashes at `translateX(0)`.
- **`getBoundingClientRect()`** relative to the container gives pixel-accurate offsets regardless of padding, font metrics, or flex-gap quirks.
- **`ResizeObserver`** on the container re-measures on window resize, theme toggle (if it changes font metrics), and any external layout shift. Disconnect on unmount.
- **Pill element is a sibling, not a child of any button.** `position: absolute` inside `.tfs` (the relative container). `pointer-events: none` so clicks still reach buttons.

### Keyboard & a11y

- `role="tablist"` on container, `role="tab"` + `aria-selected` on buttons — standard WAI-ARIA tablist pattern.
- **Roving tabindex:** only the active button has `tabIndex={0}`; others `-1`. Tab moves focus *into* the group onto the active button, then Arrow keys move within.
- `ArrowLeft` / `ArrowRight` wrap around (reaches 1D, going left goes to 1Y).
- `Enter` / `Space` activate focused button via native `<button>` click semantics.
- `:focus-visible` from existing CSS applies.
- `data-interactive` on each button → custom cursor expand.

## `<Chart />` refactor

### Before

```tsx
// App.tsx
<Chart timeframe="1D" />

// Chart.tsx
export function Chart({ timeframe }: { timeframe: Timeframe }) { ... }
```

### After

```tsx
// App.tsx
<Chart />

// Chart.tsx
export function Chart() {
  const [timeframe, setTimeframe] = useTimeframe();
  const query = useOhlc(timeframe);
  // ...existing pending/error/success branches
  return (
    <ChartCard
      timeframe={timeframe}
      onTimeframeChange={setTimeframe}
      isFetching={query.isFetching}
    >
      <ChartCanvas data={query.data} />
    </ChartCard>
  );
}
```

### `ChartCard` prop additions

```typescript
interface ChartCardProps {
  children: ReactNode;
  variant?: "error";
  heading?: string;
  timeframe: Timeframe;                            // new, required
  onTimeframeChange: (t: Timeframe) => void;       // new, required
  isFetching: boolean;                             // new, required
}
```

All three props are **required**. `useTimeframe()` resolves synchronously on mount (it reads the URL), so `timeframe` is always defined in every branch of `<Chart />` — pending, error, success. The switcher always renders, so the user can switch away from a failed 1Y to a working 1D without waiting for the failed request to resolve.

### Header markup

```tsx
<header className="card__head">
  <div className="card__meta">
    <span className={isError ? "eyebrow eyebrow--error" : "eyebrow"}>
      {heading ?? "Price History"}
    </span>
    <span
      className={`dot ${isFetching ? "dot--live" : ""}`}
      aria-hidden="true"
    />
  </div>
  <TimeframeSwitcher value={timeframe} onChange={onTimeframeChange} />
</header>
```

No conditional guard — `timeframe` and `onTimeframeChange` are required props (see above), so the switcher always renders.

- Left cluster: "PRICE HISTORY" (or error heading) + live-dot (reuses existing `.card__meta` / `.dot` / `.dot--live` — zero new CSS).
- Right cluster: switcher.
- The old `1D · BTC/USD` right eyebrow is dropped — BTC/USD is already in the app header.

### Chart render branches

All three branches share the same header props. `ChartError` is inlined (it was a single-use helper — removing it avoids propagating 3 new props through a wrapper for no reuse benefit):

```tsx
export function Chart() {
  const [timeframe, setTimeframe] = useTimeframe();
  const query = useOhlc(timeframe);

  const cardProps = {
    timeframe,
    onTimeframeChange: setTimeframe,
    isFetching: query.isFetching,
  };

  if (query.isPending) {
    return <ChartCard {...cardProps}><ChartSkeleton /></ChartCard>;
  }

  if (query.isError) {
    const { heading, message } = describeError(query.error);
    return (
      <ChartCard {...cardProps} variant="error" heading={heading}>
        <p className="card__error-msg">{message}</p>
      </ChartCard>
    );
  }

  return <ChartCard {...cardProps}><ChartCanvas data={query.data} /></ChartCard>;
}
```

## CSS additions (in `index.html`)

```css
.tfs {
  position: relative;
  display: inline-flex;
  align-items: stretch;
  border: 1px solid var(--border);
  border-radius: var(--radius-sm);
  background: var(--bg-overlay);
  padding: 3px;
  isolation: isolate;
}

.tfs__pill {
  position: absolute;
  top: 3px;
  bottom: 3px;
  left: 0;
  background: var(--bg-elev);
  border: 1px solid var(--border);
  border-radius: calc(var(--radius-sm) - 2px);
  transition: transform var(--dur-med) var(--ease-out-expo),
              width var(--dur-med) var(--ease-out-expo);
  pointer-events: none;
  z-index: 0;
}

.tfs__btn {
  position: relative;
  z-index: 1;
  padding: 6px 12px;
  font-family: var(--font-mono);
  font-size: 11px;
  font-weight: 500;
  letter-spacing: 0.14em;
  text-transform: uppercase;
  color: var(--fg-mute);
  transition: color var(--dur-fast) var(--ease-out-quart);
}

.tfs__btn:hover {
  color: var(--fg);
}

.tfs__btn[aria-selected="true"] {
  color: var(--fg);
}

@media (prefers-reduced-motion: reduce) {
  .tfs__pill { transition: none; }
}
```

`isolation: isolate` creates a new stacking context so the pill's `z-index: 0` / button `z-index: 1` interplay is scoped to `.tfs` — no risk of leaking into outer containers.

## `App.tsx` change

One line diff:

```diff
-<Chart timeframe="1D" />
+<Chart />
```

## Backend-quality details

- **URL validation** at every boundary — initial read, on every `set` call (via the union check on the caller side isn't strictly needed since we only call it with known Timeframe values, but the read is the boundary that matters).
- **TanStack Query cache** already keyed per-timeframe (`["btc","ohlc",timeframe]`) — switching 1D → 7D → 1D uses the stale-while-revalidate cache; the second 1D visit shows data instantly from cache while the 4-min staleTime boundary determines if a refetch fires.
- **AbortSignal threaded** through `useOhlc` (via existing `fetchOhlc(tf, signal)`) — fast switching cancels the in-flight request cleanly.
- **`history.replaceState`** only; no `pushState` (explicit design choice, not omission).
- **No effect dependency on `setTf`** — it's a `useCallback` with empty deps, stable identity, safe in downstream effect deps if ever needed.
- **`useLayoutEffect` instead of `useEffect`** for the pill measurement — avoids a paint with the pill at a stale position. Trade-off: layout effects block paint; the measurement is O(1) and trivially cheap.

## Non-goals (out of scope for this commit)

- **Chart data crossfade on switch** — `setData` + `fitContent` is an instant swap. Matches user expectation: click, data changes. A crossfade would mislead about whether the data has actually updated.
- **localStorage preference** — URL is the single source of truth (clarifying question 1 answered: C).
- **Query string side-effects beyond `tf`** — if the app later needs multiple query params, the `set` function preserves existing ones (already does — it reads `window.location.search` and only mutates the `tf` key).
- **Tooltip on hover showing "7 days"** — labels are unambiguous.
- **Keyboard navigation inside the chart canvas** — commit 9 (a11y/mobile).
- **Timeframe-dependent poll intervals** — 5 min is fine for all four timeframes. CoinGecko's OHLC refresh cadence doesn't vary with `days`.
- **Pushing a new history entry per timeframe change** — explicitly rejected; spammy for a non-navigation action.

## Verification plan

- `npm run build` passes; TS strict mode clean.
- Click each timeframe → URL updates to `?tf=7D` etc., chart data reloads with new candles.
- Click `1D` (the default) → `?tf` param is removed from URL entirely.
- Reload with `?tf=7D` → app loads on 7D, correct button `aria-selected`.
- Reload with `?tf=garbage` → silently falls back to 1D.
- Reload with `?tf=` (empty) → falls back to 1D.
- Pill slides smoothly between positions, matches active button width exactly.
- Resize window → pill re-measures (no drift at new layout).
- Theme toggle → switcher recolors via CSS vars; pill geometry unchanged (same DOM positions).
- `prefers-reduced-motion: reduce` → pill snaps, no slide.
- Browser back button → leaves the app; does **not** undo a timeframe.
- Keyboard: Tab moves focus onto active button; ArrowRight/Left moves between buttons (wraps); Enter/Space activates.
- `isFetching` live-dot pulses on the chart-card header for ~1s while the new timeframe's data fetches.
- StrictMode: no double-effect warnings; layout effect + ResizeObserver both clean up.
- Mobile viewport (<640px): switcher fits; if tight, card header wraps (existing `flex-wrap: wrap` on `.card__head`).
