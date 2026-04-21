import { useCallback, useEffect, useRef, useState, type RefObject } from "react";
import { keepPreviousData, useQuery } from "@tanstack/react-query";
import gsap from "gsap";
import {
  TIMEFRAMES,
  fetchBitcoinMetrics,
  fetchOhlc,
  fetchSummary,
  type BitcoinMetrics,
  type Candle,
  type PriceSummary,
  type Timeframe,
} from "./api";

const POLL_MS = 60_000;
const STALE_MS = 50_000;

export const SUMMARY_STALE_THRESHOLD_MS = 180_000;

// CoinGecko refreshes OHLC every ~15 min; polling faster is wasted quota
const OHLC_POLL_MS = 5 * 60_000;
const OHLC_STALE_MS = 4 * 60_000;

// mempool.space caches aggressively; 60s matches block-level freshness
// (~1 block/10min target means most data doesn't change faster anyway).
const METRICS_POLL_MS = 60_000;
const METRICS_STALE_MS = 50_000;

export function usePriceSummary() {
  return useQuery<PriceSummary>({
    queryKey: ["btc", "summary"],
    queryFn: ({ signal }) => fetchSummary(signal),
    refetchInterval: POLL_MS,
    staleTime: STALE_MS,
  });
}

export function useBitcoinMetrics() {
  return useQuery<BitcoinMetrics>({
    queryKey: ["btc", "metrics"],
    queryFn: ({ signal }) => fetchBitcoinMetrics(signal),
    refetchInterval: METRICS_POLL_MS,
    staleTime: METRICS_STALE_MS,
  });
}

export function useOhlc(timeframe: Timeframe) {
  return useQuery<Candle[]>({
    queryKey: ["btc", "ohlc", timeframe],
    queryFn: ({ signal }) => fetchOhlc(timeframe, signal),
    refetchInterval: OHLC_POLL_MS,
    staleTime: OHLC_STALE_MS,
    // Keep last timeframe's candles visible (dimmed) while new one loads —
    // pairs with the chart-canvas crossfade instead of snapping to skeleton.
    placeholderData: keepPreviousData,
  });
}

const DEFAULT_TF: Timeframe = "1D";

function readTimeframeFromURL(): Timeframe {
  const raw = new URLSearchParams(window.location.search).get("tf");
  return (TIMEFRAMES as readonly string[]).includes(raw ?? "")
    ? (raw as Timeframe)
    : DEFAULT_TF;
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

export type Theme = "light" | "dark";

export function useThemeObserver(): Theme {
  const [theme, setTheme] = useState<Theme>(() =>
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

export function useVisibility(): boolean {
  const [visible, setVisible] = useState<boolean>(() =>
    typeof document === "undefined" ? true : document.visibilityState === "visible"
  );
  useEffect(() => {
    const onChange = () => setVisible(document.visibilityState === "visible");
    document.addEventListener("visibilitychange", onChange);
    return () => document.removeEventListener("visibilitychange", onChange);
  }, []);
  return visible;
}

// Ticks at intervalMs, but pauses when the tab is hidden. On re-show we
// resync immediately — otherwise countdowns/relative-times can read up to
// `intervalMs` stale for a beat after the user refocuses.
export function useNow(intervalMs = 1000): Date {
  const [now, setNow] = useState(() => new Date());
  const visible = useVisibility();
  useEffect(() => {
    if (!visible) return;
    setNow(new Date());
    const id = window.setInterval(() => setNow(new Date()), intervalMs);
    return () => window.clearInterval(id);
  }, [intervalMs, visible]);
  return now;
}

// navigator.onLine is imperfect (some OS/network configs misreport) but is the
// only cheap signal available. Combined with per-card ApiError("network")
// handling, it's enough for a clear UX: banner = "likely offline",
// per-card retry = "this particular request failed."
export function useOnline(): boolean {
  const [online, setOnline] = useState<boolean>(() =>
    typeof navigator === "undefined" ? true : navigator.onLine
  );
  useEffect(() => {
    const up = () => setOnline(true);
    const down = () => setOnline(false);
    window.addEventListener("online", up);
    window.addEventListener("offline", down);
    return () => {
      window.removeEventListener("online", up);
      window.removeEventListener("offline", down);
    };
  }, []);
  return online;
}

export type FlashDirection = "up" | "down" | null;

export function usePriceFlash(price: number | undefined): FlashDirection {
  const prev = useRef<number | undefined>(undefined);
  const [flash, setFlash] = useState<FlashDirection>(null);

  useEffect(() => {
    if (price === undefined) return;
    if (prev.current === undefined) {
      prev.current = price;
      return;
    }
    if (price === prev.current) return;

    setFlash(price > prev.current ? "up" : "down");
    prev.current = price;
    const timer = window.setTimeout(() => setFlash(null), 600);
    return () => window.clearTimeout(timer);
  }, [price]);

  return flash;
}

// Magnetic hover — element pulls toward cursor within a radius,
// springs back when the cursor leaves. Skips on touch + reduced-motion.
export function useMagnetic<T extends HTMLElement>(
  ref: RefObject<T | null>,
  strength = 0.25,
  padding = 24
): void {
  useEffect(() => {
    const el = ref.current;
    if (!el) return;

    if (
      window.matchMedia("(pointer: coarse), (hover: none)").matches ||
      window.matchMedia("(prefers-reduced-motion: reduce)").matches
    ) {
      return;
    }

    const xTo = gsap.quickTo(el, "x", { duration: 0.4, ease: "power3.out" });
    const yTo = gsap.quickTo(el, "y", { duration: 0.4, ease: "power3.out" });

    const onMove = (e: MouseEvent) => {
      const rect = el.getBoundingClientRect();
      const cx = rect.left + rect.width / 2;
      const cy = rect.top + rect.height / 2;
      const dx = e.clientX - cx;
      const dy = e.clientY - cy;

      if (
        Math.abs(dx) < rect.width / 2 + padding &&
        Math.abs(dy) < rect.height / 2 + padding
      ) {
        xTo(dx * strength);
        yTo(dy * strength);
      } else {
        xTo(0);
        yTo(0);
      }
    };

    window.addEventListener("mousemove", onMove);
    return () => {
      window.removeEventListener("mousemove", onMove);
      gsap.set(el, { x: 0, y: 0 });
    };
  }, [ref, strength, padding]);
}
