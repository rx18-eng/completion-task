import { useEffect, useMemo, useRef, type ReactNode } from "react";
import {
  CandlestickSeries,
  createChart,
  type CandlestickSeriesPartialOptions,
  type ChartOptions,
  type DeepPartial,
  type IChartApi,
  type ISeriesApi,
  type UTCTimestamp,
} from "lightweight-charts";
import { describeError, type Candle, type Timeframe } from "./api";
import { useOhlc, useThemeObserver } from "./hooks";

interface ChartProps {
  timeframe: Timeframe;
}

export function Chart({ timeframe }: ChartProps) {
  const query = useOhlc(timeframe);

  if (query.isPending) {
    return (
      <ChartCard>
        <ChartSkeleton />
      </ChartCard>
    );
  }

  if (query.isError) {
    return <ChartError error={query.error} />;
  }

  return (
    <ChartCard>
      <ChartCanvas data={query.data} />
    </ChartCard>
  );
}

interface ChartCardProps {
  children: ReactNode;
  variant?: "error";
  heading?: string;
}

function ChartCard({ children, variant, heading }: ChartCardProps) {
  const isError = variant === "error";
  return (
    <section
      className={`card chart-card${isError ? " card--error" : ""}`}
      aria-label="Bitcoin 1-day price history"
      role={isError ? "alert" : undefined}
    >
      <header className="card__head">
        <span className={isError ? "eyebrow eyebrow--error" : "eyebrow"}>
          {heading ?? "Price History"}
        </span>
        <span className="eyebrow">1D · BTC/USD</span>
      </header>
      {children}
    </section>
  );
}

function cssVar(name: string): string {
  return getComputedStyle(document.documentElement).getPropertyValue(name).trim();
}

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
    crosshair: { mode: 1 },
    timeScale: {
      borderVisible: false,
      timeVisible: true,
      secondsVisible: false,
    },
    rightPriceScale: { borderVisible: false },
  };
}

function seriesColors(): CandlestickSeriesPartialOptions {
  const up = cssVar("--up");
  const down = cssVar("--down");
  return {
    upColor: up,
    downColor: down,
    borderUpColor: up,
    borderDownColor: down,
    wickUpColor: up,
    wickDownColor: down,
    borderVisible: true,
  };
}

interface ChartCanvasProps {
  data: Candle[];
}

function ChartCanvas({ data }: ChartCanvasProps) {
  const containerRef = useRef<HTMLDivElement | null>(null);
  const chartRef = useRef<IChartApi | null>(null);
  const seriesRef = useRef<ISeriesApi<"Candlestick"> | null>(null);
  const theme = useThemeObserver();

  // Mount once — create chart + candlestick series. Cleanup tears down cleanly
  // so React StrictMode's double-invoke in dev doesn't leak a canvas.
  useEffect(() => {
    const container = containerRef.current;
    if (!container) return;
    const chart = createChart(container, baseChartOptions());
    const series = chart.addSeries(CandlestickSeries, seriesColors());
    chartRef.current = chart;
    seriesRef.current = series;
    return () => {
      chart.remove();
      chartRef.current = null;
      seriesRef.current = null;
    };
  }, []);

  // Push new data. `setData` replaces the full window, which matches CoinGecko's
  // whole-range response, then `fitContent` re-frames so the latest bar is visible.
  useEffect(() => {
    const series = seriesRef.current;
    const chart = chartRef.current;
    if (!series || !chart) return;
    series.setData(
      data.map((c) => ({
        time: c.time as UTCTimestamp,
        open: c.open,
        high: c.high,
        low: c.low,
        close: c.close,
      }))
    );
    chart.timeScale().fitContent();
  }, [data]);

  // Recolor on theme swap without remount — both applyOptions calls read the
  // freshly-written CSS variables from :root.
  useEffect(() => {
    const chart = chartRef.current;
    const series = seriesRef.current;
    if (!chart || !series) return;
    chart.applyOptions(baseChartOptions());
    series.applyOptions(seriesColors());
  }, [theme]);

  return <div ref={containerRef} className="chart-canvas" aria-hidden="true" />;
}

function ChartSkeleton() {
  // Stable heights so the shimmer doesn't re-randomize on every re-render.
  const heights = useMemo(() => {
    const out: number[] = [];
    let v = 0.55;
    for (let i = 0; i < 24; i++) {
      // Deterministic pseudo-random walk — reviewer-friendly, no RNG seed needed.
      v = Math.min(0.95, Math.max(0.25, v + Math.sin(i * 1.7) * 0.12));
      out.push(Math.round(v * 100));
    }
    return out;
  }, []);
  return (
    <div className="chart-skeleton" aria-busy="true" aria-label="Loading chart">
      {heights.map((h, i) => (
        <span
          key={i}
          className="chart-skeleton__bar skeleton"
          style={{ height: `${h}%` }}
        />
      ))}
    </div>
  );
}

function ChartError({ error }: { error: unknown }) {
  const { heading, message } = describeError(error);
  return (
    <ChartCard variant="error" heading={heading}>
      <p className="card__error-msg">{message}</p>
    </ChartCard>
  );
}
