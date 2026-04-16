# Commit 4: Theme Toggle with Radial Reveal

## Summary

Add a light/dark theme toggle button to the header with a View Transitions API radial clip-path reveal animation. The new theme expands as a circle from the toggle button's center, covering the entire viewport. Falls back to instant swap when the API is unavailable or the user prefers reduced motion.

## New File: `ThemeToggle.tsx`

### `useTheme()` hook

Owns theme state for the app. Reads initial value from `document.documentElement.dataset.theme` (already set by the FOUC-killer inline script in `index.html`).

**Returns:** `{ theme: Theme; toggle: (ref: RefObject<HTMLButtonElement>) => void }`

**Type:** `type Theme = "light" | "dark"`

**Behavior:**
- Reads initial theme from `document.documentElement.dataset.theme` inside `useState` initializer
- `toggle()` accepts the button ref (needed for `getBoundingClientRect`), computes `nextTheme`, then calls `applyTheme(next)` — either with the radial transition or instant fallback
- `applyTheme(theme)` does three things atomically:
  1. Sets `document.documentElement.dataset.theme = theme`
  2. Writes `localStorage.setItem("theme", theme)`
  3. Updates `document.querySelector('meta[name="theme-color"]')?.setAttribute("content", ...)` to match
- Subscribes to `matchMedia("(prefers-color-scheme: dark)")` change events via `useEffect`. When fired AND localStorage has no stored preference, calls `applyTheme(system)` to follow OS. Cleans up listener on unmount.

### Radial transition logic

```
function toggleWithTransition(ref, nextTheme, applyTheme):
  if !ref.current OR !document.startViewTransition OR prefers-reduced-motion:
    applyTheme(nextTheme)
    return

  transition = document.startViewTransition(() => {
    flushSync(() => applyTheme(nextTheme))
  })

  await transition.ready

  { top, left, width, height } = ref.current.getBoundingClientRect()
  x = left + width / 2
  y = top + height / 2
  maxRadius = Math.hypot(
    Math.max(left, window.innerWidth - left),
    Math.max(top, window.innerHeight - top)
  )

  document.documentElement.animate(
    { clipPath: ["circle(0px at x y)", "circle(maxRadius at x y)"] },
    { duration: 500, easing: "ease-in-out", pseudoElement: "::view-transition-new(root)" }
  )
```

### `<ThemeToggle />` component

- Renders `<button>` with `ref` for position calculation
- `className="theme-toggle"`, `data-interactive` (custom cursor expand)
- `aria-label` dynamically set: `"Switch to dark mode"` when light, `"Switch to light mode"` when dark
- `onClick` calls `toggle(ref)`
- Contains inline SVG icon: sun (light mode) / moon (dark mode) with CSS `transform: rotate(180deg) scale(0.8)` ↔ `rotate(0deg) scale(1)` transition on theme change

### SVG icon

Single `<svg>` with two `<g>` groups (sun rays + circle, moon crescent). Visibility toggled via `opacity` driven by `[data-theme="dark"]` CSS selectors — consistent with the existing theming pattern. The sun group fades out + rotates while the moon group fades in + rotates. No external icon library.

## CSS Additions (in `index.html <style>`)

```css
/* View Transitions API — disable default crossfade, use our clip-path */
::view-transition-old(root),
::view-transition-new(root) {
  animation: none;
  mix-blend-mode: normal;
}

/* Toggle button */
.theme-toggle {
  position: relative;
  display: grid;
  place-items: center;
  width: 40px;
  height: 40px;
  border-radius: var(--radius-sm);
  color: var(--fg-mute);
  transition: color var(--dur-fast) var(--ease-out-quart);
}

.theme-toggle:hover {
  color: var(--fg);
}

/* Icon rotation on theme change */
.theme-toggle__icon {
  width: 20px;
  height: 20px;
  transition: transform var(--dur-med) var(--ease-out-back);
}

[data-theme="dark"] .theme-toggle__icon {
  transform: rotate(180deg) scale(0.85);
}

/* Reduced motion: kill icon rotation */
@media (prefers-reduced-motion: reduce) {
  .theme-toggle__icon { transition: none; }
}
```

## Integration: `App.tsx`

Import `ThemeToggle` from `./ThemeToggle.tsx`. Place in the header:

```tsx
<header className="shell__head">
  <span className="eyebrow">Bitcoin · USD</span>
  <ThemeToggle />
</header>
```

The right-side `<span className="eyebrow">SoB · 2026</span>` is removed from the header — the toggle takes its position. The footer already has "Data: CoinGecko" and "Chart: TradingView Lightweight Charts" which covers attribution. The "SoB · 2026" text is redundant since it's also in the preloader.

## TypeScript types

```typescript
type Theme = "light" | "dark";
```

No generics, no context, no provider. The hook reads/writes DOM directly — correct for a single-boolean app-wide setting in a SPA.

## Accessibility

- `<button>` element (not div/span) — keyboard accessible by default
- `aria-label` updates dynamically with current action
- `data-interactive` triggers custom cursor ring expand
- `prefers-reduced-motion`: radial transition skipped entirely, icon rotation disabled
- Focus-visible outline already handled by global `:focus-visible` rule

## Error handling

- `document.startViewTransition` not available: instant swap, no error
- `localStorage` quota exceeded or blocked: caught in try/catch, theme still applied to DOM (just not persisted)
- `meta[name="theme-color"]` not found: optional chaining, no crash

## What's NOT in scope

- No "system" third toggle state (FOUC-killer already respects system when localStorage is empty)
- No context provider (overkill for a boolean)
- No icon animation library (CSS transform is sufficient)
- No separate file for the hook (ThemeToggle.tsx contains both hook + component — single-purpose file)

## Verification plan

- `npm run build` compiles clean
- Light → dark: radial reveal expands from button center
- Dark → light: same radial reveal
- Refresh: persisted theme survives reload (no flash)
- Delete localStorage, set OS to dark: app follows system
- `prefers-reduced-motion: reduce`: instant swap, no animation
- Keyboard: Tab to toggle, Enter/Space activates
- `aria-label` reads correctly in screen reader
