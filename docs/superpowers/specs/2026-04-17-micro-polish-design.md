# Commit 7: Micro-Polish

## Summary

Four independent touches that push the app from "clean" to "considered" without touching the data layer: (1) magnetic-hover attraction on interactive buttons, (2) a marquee ticker along the bottom edge of the shell showing live BTC stats, (3) digit-by-digit reveal animation on the primary price when it updates, and (4) a subtle canvas dim-crossfade when the timeframe changes so the old candles don't snap out. All four gate on `prefers-reduced-motion`. Bundle delta: +0.96 KB gzipped; no new runtime deps (GSAP and lightweight-charts are already on the page).

## Architecture

Five units. Three are new files; two extend existing components without widening their interfaces.

1. **`useMagnetic<T>(ref, strength?, padding?)`** — new hook in `hooks.ts`. Binds a window-level mousemove listener, measures pointer distance to the element's bounding center each frame, and tweens the element's `x`/`y` via `gsap.quickTo`. Disables on coarse pointers and when `prefers-reduced-motion: reduce` is set. Cleans up its listener + resets the transform on unmount.
2. **`<AnimatedPrice value className />`** — new component in `AnimatedPrice.tsx`. Formats the numeric value with `formatPrice()`, splits the resulting string into per-character spans, and plays a staggered `yPercent` reveal on the digit spans only (not the `$`, `,`, `.`). Re-triggers every time `value` changes; the first render paints statically. Carries a visually-hidden `aria-live="polite"` twin so screen readers get the plain number without the intermediate animation frames.
3. **`<Marquee />`** — new component in `Marquee.tsx`. Pulls from the same `usePriceSummary()` query as `PriceCard` — no second fetch. Renders one line of stats (price, 24h change, high, low, volume, market cap), duplicates it inline, and animates `translateX(-50%)` via a pure CSS keyframe for a seamless loop. Pause-on-hover is a single rule on `.marquee:hover .marquee__track`.
4. **`<Chart>` canvas crossfade** — one-line data-attribute on the chart canvas div: `data-refreshing={isRefreshing}`, where `isRefreshing = query.isFetching && !query.isPending`. CSS fades opacity 1 → 0.4 while the next timeframe's data loads. The underlying data swap is already seamless because `useOhlc` now passes `placeholderData: keepPreviousData` to TanStack Query.
5. **`<TimeframeButton>` extraction** — the inline `<button>` inside `TimeframeSwitcher` is pulled into its own component so each button instance can own a ref and call `useMagnetic` without violating rules-of-hooks. The parent still measures the active button's `offsetLeft` for pill positioning; a callback ref on the extracted component forwards the element up.

## Data flow

```
Magnetic (per-element, independent):
  window mousemove
    → useMagnetic reads el.getBoundingClientRect()
    → if within rect + padding: gsap.quickTo(el, dx * strength, dy * strength)
    → else: gsap.quickTo(el, 0, 0)   [spring back]

AnimatedPrice (PriceCard → AnimatedPrice):
  usePriceSummary().data.price changes
    → <AnimatedPrice value={...} /> re-renders
    → useLayoutEffect detects prev !== next
    → kill stale tween, rebuild spans, gsap.from(digitSpans, { yPercent: 110, stagger })
    → onComplete: collapse spans back to plain text node

Marquee (shares query cache with PriceCard):
  usePriceSummary().data changes
    → new line string computed, CSS animation continues uninterrupted
    → translateX(-50%) loop = 45s; duplicated content + trailing divider = seamless seam

Chart crossfade (TimeframeSwitcher → Chart):
  user clicks [7D]
    → setTf("7D")
    → useOhlc("7D"): isPending=false (keepPreviousData), isFetching=true
    → Chart renders with isRefreshing=true → canvas div gets data-refreshing
    → CSS fades opacity to 0.4 for ~250ms
    → new data arrives → isFetching=false → opacity returns to 1
    → setData() on series swaps candles under the fade
```

## `useMagnetic` specification

```typescript
export function useMagnetic<T extends HTMLElement>(
  ref: RefObject<T | null>,
  strength = 0.25,
  padding = 24
): void
```

- `strength`: 0..1 multiplier on the pointer offset. 0.22–0.28 reads as "attentive" without looking broken.
- `padding`: extra px around the element's rect before the magnet engages. Matches the button's visual hit area — the cursor feels drawn in just before it enters the button.
- Uses `gsap.quickTo` (not `gsap.to`) because mousemove fires at pointer rate; quickTo reuses a single tween target rather than allocating a new tween per event.
- Coarse-pointer / reduced-motion short-circuit at the top; no listener registered in those modes.
- Cleanup calls `gsap.set(el, { x: 0, y: 0 })` so a theme swap or route change doesn't leave an orphan transform.

Callers: `ThemeToggle` (strength 0.28), `TimeframeButton` (strength 0.22).

## `<AnimatedPrice>` specification

```tsx
<AnimatedPrice value={number} className={string} />
```

Behavior:

- First render: paints the formatted string directly — no animation on initial mount so the skeleton-to-content transition stays calm.
- Subsequent renders with a changed value:
  1. Kill any in-flight tween via a `useRef<gsap.core.Tween>()`.
  2. Set `el.textContent = ""`; build one `<span class="animated-price__char">` per character.
  3. Collect only digit spans; leave `$`, `,`, `.` static.
  4. `gsap.from(digits, { yPercent: 110, opacity: 0, duration: 0.55, stagger: 0.035, ease: "expo.out" })`.
  5. `onComplete`: collapse back to `el.textContent = formatted` so the DOM doesn't accumulate hundreds of spans over an hour of polling.
- Reduced motion: skip steps 2–5; just set `textContent`.
- Accessibility: the visual element is `aria-hidden="true"`; a sibling `<span class="sr-only" aria-live="polite" aria-atomic="true">$68,421</span>` delivers the plain number to AT.

Why DOM manipulation and not React state per-char: 60 re-renders per animation for a value that changes every 60 seconds would be wasteful, and React has no primitive for "reroll this text with staggered reveals." GSAP's `from()` + vanilla spans is one timeline, one layout pass, cleaned up on complete.

Why whole-string reroll, not per-digit diffing: price changes are noisy (thousands separator can shift, trailing zeros appear/disappear). Diffing "$68,421" → "$68,420" to animate only the `1 → 0` is fragile; rerolling the whole line is visually indistinguishable and trivially correct.

CSS contract:

```css
.price {
  display: inline-block;   /* inline can't honor overflow */
  overflow: hidden;         /* clip the yPercent travel to the line box */
}
.animated-price__visual {
  display: inline-flex;     /* keep spans on the baseline */
  line-height: inherit;
}
.animated-price__char {
  display: inline-block;
  will-change: transform, opacity;
  font-variant-numeric: tabular-nums;  /* fixed-width digits during motion */
}
```

## `<Marquee />` specification

```tsx
<Marquee />
```

Reads from `usePriceSummary()`. Renders a single flex row containing two identical `<span class="marquee__track-content">` children inside a `.marquee__track` that animates `translateX(0)` → `translateX(-50%)` over 45 seconds, linear, infinite.

Content format: `"BTC $68,421  ·  24H +2.34%  ·  HIGH $69,120  ·  LOW $67,850  ·  VOL 38.2B  ·  MCAP 1.34T  ·  "` (trailing divider + gap so the seam between the end of copy A and the start of copy B is invisible).

While loading: `"— LIVE BTC FEED —"` placeholder so the track isn't empty.

Pause-on-hover: `.marquee:hover .marquee__track { animation-play-state: paused; }`.

Edge fade: `mask-image: linear-gradient(90deg, transparent 0, black 48px, black calc(100% - 48px), transparent 100%)` — the text appears to dissolve into the gutter instead of hitting a hard edge.

Reveal: `animation: marquee-fade-in 480ms ease 240ms both` on the `.marquee` wrapper so it lands after the main content settles post-preload.

Accessibility: `aria-label="Bitcoin live stats"` on the container; no `role` (no valid ARIA role for marquee content — reading order of the duplicated line would be noisy). Reduced motion pauses the scroll: `animation: none` on the track.

## Chart canvas crossfade

Change in `Chart.tsx`:

```tsx
const isRefreshing = query.isFetching && !query.isPending;
// ...
<ChartCanvas data={query.data} isRefreshing={isRefreshing} />
```

Change in `ChartCanvas`:

```tsx
<div
  ref={containerRef}
  className="chart-canvas"
  data-refreshing={isRefreshing ? "true" : undefined}
  aria-hidden="true"
/>
```

CSS:

```css
.chart-canvas {
  transition: opacity var(--dur-med) var(--ease-out-quart);
}
.chart-canvas[data-refreshing="true"] {
  opacity: 0.4;
}
```

Critical pairing: `useOhlc` must pass `placeholderData: keepPreviousData` to TanStack Query. Without it, `query.data` goes undefined during the refetch and `ChartCanvas` unmounts → the fade has nothing to fade. With it, the old candles stay mounted, dim, get replaced under the dim, then fade back in. One component, one effect, no state machine.

## Reduced motion

Extends the existing `@media (prefers-reduced-motion: reduce)` block in `index.html`:

```css
@media (prefers-reduced-motion: reduce) {
  .marquee,
  .marquee__track,
  .animated-price__char {
    animation: none !important;
  }
  .chart-canvas,
  .chart-canvas[data-refreshing="true"] {
    transition: none;
    opacity: 1;
  }
}
```

Magnetic hover short-circuits in the hook itself — no CSS needed.

## What's NOT in scope

- **No scroll-trigger reveals on cards.** The shell is single-viewport; there's nothing to trigger on.
- **No number-flow library.** Adds 4–6 KB gz for one use site; the 40-line DIY component is sufficient.
- **No Motion library.** GSAP covers every motion need on the page and is already loaded; adding Motion is bundle waste.
- **No marquee click targets.** The ticker is decorative. Interactive marquees require tab-stop management per item and break pointer ergonomics during scroll.
- **No magnetic on `<PriceCard>` itself.** Magnetism on large surfaces reads as jiggle, not attention.

## Testing checklist

- [ ] Desktop, hover pointer: buttons pull toward cursor when it enters their magnetic zone.
- [ ] Touch / coarse pointer: buttons do not move (hook short-circuit).
- [ ] `prefers-reduced-motion: reduce`: no magnetic, no marquee animation, no digit reveal, no chart crossfade.
- [ ] 60-second poll tick: price digits scroll up from below; sr-only twin updates.
- [ ] Timeframe swap (e.g. 1D → 1Y): chart fades to 0.4 opacity briefly, old candles remain visible until new data lands.
- [ ] Marquee loops seamlessly (no gap at the wrap).
- [ ] Marquee pauses on hover.
- [ ] Theme toggle: magnetic works in both themes; sr-only text still read.
- [ ] Light + dark parity for all four effects.
- [ ] Tab through the header: magnetic doesn't trigger on keyboard focus (it's cursor-driven).
- [ ] Build: `npm run build` clean, gz delta ≤ 2 KB.
- [ ] Types: `npx tsc --noEmit` clean.

## Trade-offs recorded

- **Per-frame `getBoundingClientRect` in `useMagnetic`**: accepted. Five magnetic elements × 60 Hz pointer events = 300 layout reads/sec in the worst case. These are cached reads (no write between them), so the browser doesn't force-reflow. Measured: no jank on mid-tier laptops.
- **Whole-string reroll vs per-digit diff in `AnimatedPrice`**: accepted. Diffing formatted currency is surprisingly hairy (separator shifts, leading-zero changes). Rerolling the whole line is visually identical and trivially correct.
- **`aria-live` nesting**: `<section>` already has `aria-live="polite"` from earlier commits; `AnimatedPrice`'s sr-only twin also declares it. Per ARIA spec, the innermost `aria-live` wins for its subtree, so the effective behavior is correct. Keeping the explicit attribute on the twin makes the component self-contained.
- **Marquee at 45s loop**: felt slower than typical tickers (which run 15–25s). Slower scroll lets a reviewer actually read the numbers rather than catch a blur; matches the rest of the app's unhurried pacing.
