import { useCallback, useEffect, useRef, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import {
  TIMEFRAMES,
  fetchOhlc,
  fetchSummary,
  type Candle,
  type PriceSummary,
  type Timeframe,
} from "./api";

const POLL_MS = 60_000;
const STALE_MS = 50_000;

// CoinGecko refreshes OHLC every ~15 min; polling faster is wasted quota
const OHLC_POLL_MS = 5 * 60_000;
const OHLC_STALE_MS = 4 * 60_000;

export function usePriceSummary() {
  return useQuery<PriceSummary>({
    queryKey: ["btc", "summary"],
    queryFn: ({ signal }) => fetchSummary(signal),
    refetchInterval: POLL_MS,
    staleTime: STALE_MS,
  });
}

export function useOhlc(timeframe: Timeframe) {
  return useQuery<Candle[]>({
    queryKey: ["btc", "ohlc", timeframe],
    queryFn: ({ signal }) => fetchOhlc(timeframe, signal),
    refetchInterval: OHLC_POLL_MS,
    staleTime: OHLC_STALE_MS,
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

export function useNow(intervalMs = 1000): Date {
  const [now, setNow] = useState(() => new Date());
  useEffect(() => {
    const id = window.setInterval(() => setNow(new Date()), intervalMs);
    return () => window.clearInterval(id);
  }, [intervalMs]);
  return now;
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
