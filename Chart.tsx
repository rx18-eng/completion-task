import {
  useEffect,
  useLayoutEffect,
  useMemo,
  useRef,
  useState,
  type KeyboardEvent,
  type ReactNode,
} from "react";
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
import { describeError, TIMEFRAMES, type Candle, type Timeframe } from "./api";
import { useMagnetic, useOhlc, useThemeObserver, useTimeframe } from "./hooks";
import { RetryButton } from "./RetryButton";

const TF_LABELS: Record<Timeframe, string> = {
  "1D": "1-day",
  "7D": "7-day",
  "30D": "30-day",
  "1Y": "1-year",
};

// CoinGecko OHLC granularity is fixed by window (free tier):
//  1-2d → 30m candles, 3-30d → 4h, 31+d → 4d. Surfacing this avoids the
//  common "why is the 1D chart so jagged?" confusion during review.
const TF_CANDLE: Record<Timeframe, string> = {
  "1D": "30-minute candles",
  "7D": "4-hour candles",
  "30D": "4-hour candles",
  "1Y": "4-day candles",
};

export function Chart() {
  const [timeframe, setTimeframe] = useTimeframe();
  const query = useOhlc(timeframe);

  const cardProps = {
    timeframe,
    onTimeframeChange: setTimeframe,
    isFetching: query.isFetching,
  };

  if (query.isPending) {
    return (
      <ChartCard {...cardProps}>
        <ChartSkeleton />
      </ChartCard>
    );
  }

  if (query.isError && !query.data) {
    const { heading, message } = describeError(query.error);
    return (
      <ChartCard {...cardProps} variant="error" heading={heading}>
        <p className="card__error-msg">{message}</p>
        <RetryButton onClick={() => query.refetch()} fetching={query.isFetching} />
      </ChartCard>
    );
  }

  if (query.data.length === 0) {
    return (
      <ChartCard {...cardProps}>
        <div className="chart-empty" role="status">
          No candles for this timeframe
        </div>
      </ChartCard>
    );
  }

  // isRefreshing = refetch or timeframe-swap in progress while the previous
  // candles are still visible (keepPreviousData in useOhlc holds them). Drives
  // the chart-canvas crossfade so tf changes feel like a dissolve, not a snap.
  const isRefreshing = query.isFetching && !query.isPending;

  return (
    <ChartCard {...cardProps}>
      <ChartCanvas data={query.data} isRefreshing={isRefreshing} />
    </ChartCard>
  );
}

interface ChartCardProps {
  children: ReactNode;
  timeframe: Timeframe;
  onTimeframeChange: (t: Timeframe) => void;
  isFetching: boolean;
  variant?: "error";
  heading?: string;
}

function ChartCard({
  children,
  timeframe,
  onTimeframeChange,
  isFetching,
  variant,
  heading,
}: ChartCardProps) {
  const isError = variant === "error";
  return (
    <section
      className={`card chart-card${isError ? " card--error" : ""}`}
      aria-label={`Bitcoin ${TF_LABELS[timeframe]} price history`}
      role={isError ? "alert" : undefined}
    >
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
      {children}
      {!isError && (
        <p className="eyebrow chart-meta">
          source · CoinGecko · {TF_CANDLE[timeframe]}
        </p>
      )}
    </section>
  );
}

function cssVar(name: string): string {
  return getComputedStyle(document.documentElement)
    .getPropertyValue(name)
    .trim();
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

function ChartCanvas({ data, isRefreshing }: { data: Candle[]; isRefreshing: boolean }) {
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

  // Push new data — replaces the full window, then re-frames.
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

  // Recolor on theme swap without remount.
  useEffect(() => {
    const chart = chartRef.current;
    const series = seriesRef.current;
    if (!chart || !series) return;
    chart.applyOptions(baseChartOptions());
    series.applyOptions(seriesColors());
  }, [theme]);

  return (
    <div
      ref={containerRef}
      className="chart-canvas"
      data-refreshing={isRefreshing ? "true" : undefined}
      aria-hidden="true"
    />
  );
}

function TimeframeSwitcher({
  value,
  onChange,
}: {
  value: Timeframe;
  onChange: (next: Timeframe) => void;
}) {
  const containerRef = useRef<HTMLDivElement | null>(null);
  const btnRefs = useRef<Partial<Record<Timeframe, HTMLButtonElement | null>>>({});
  const [pill, setPill] = useState({ x: 0, w: 0 });

  // Measure active button position before paint — no flash at stale coords.
  useLayoutEffect(() => {
    const btn = btnRefs.current[value];
    if (!btn) return;
    setPill({ x: btn.offsetLeft, w: btn.offsetWidth });
  }, [value]);

  // Re-measure on container resize (window resize, font metrics change, etc.)
  useEffect(() => {
    const container = containerRef.current;
    if (!container) return;
    const ro = new ResizeObserver(() => {
      const btn = btnRefs.current[value];
      if (!btn) return;
      setPill({ x: btn.offsetLeft, w: btn.offsetWidth });
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
        <TimeframeButton
          key={t}
          timeframe={t}
          active={t === value}
          onRef={(el) => {
            btnRefs.current[t] = el;
          }}
          onClick={() => onChange(t)}
        />
      ))}
    </div>
  );
}

function TimeframeButton({
  timeframe,
  active,
  onRef,
  onClick,
}: {
  timeframe: Timeframe;
  active: boolean;
  onRef: (el: HTMLButtonElement | null) => void;
  onClick: () => void;
}) {
  const ref = useRef<HTMLButtonElement | null>(null);
  useMagnetic(ref, 0.22);

  return (
    <button
      ref={(el) => {
        ref.current = el;
        onRef(el);
      }}
      className="tfs__btn"
      type="button"
      role="tab"
      aria-selected={active}
      aria-label={TF_LABELS[timeframe]}
      tabIndex={active ? 0 : -1}
      data-interactive
      onClick={onClick}
    >
      {timeframe}
    </button>
  );
}

function ChartSkeleton() {
  const heights = useMemo(() => {
    const out: number[] = [];
    let v = 0.55;
    for (let i = 0; i < 24; i++) {
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
