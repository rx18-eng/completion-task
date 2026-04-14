export type Currency = "usd";
export type Timeframe = "1D" | "7D" | "30D" | "1Y";

export interface PriceSummary {
  price: number;
  change24hPct: number;
  volume24h: number;
  high24h: number;
  low24h: number;
  marketCap: number;
  updatedAt: Date;
}

export interface Candle {
  time: number;
  open: number;
  high: number;
  low: number;
  close: number;
}

export type ApiErrorCode = "rate_limited" | "network" | "http" | "parse";

export class ApiError extends Error {
  readonly status: number;
  readonly code: ApiErrorCode;

  constructor(status: number, code: ApiErrorCode, message: string) {
    super(message);
    this.name = "ApiError";
    this.status = status;
    this.code = code;
  }

  get isRateLimit(): boolean {
    return this.code === "rate_limited";
  }
}

const BASE = "https://api.coingecko.com/api/v3";

const TIMEFRAME_DAYS: Record<Timeframe, number> = {
  "1D": 1,
  "7D": 7,
  "30D": 30,
  "1Y": 365,
};

async function request<T>(path: string, signal?: AbortSignal): Promise<T> {
  let res: Response;
  try {
    res = await fetch(`${BASE}${path}`, {
      signal,
      headers: { accept: "application/json" },
    });
  } catch (err) {
    if (err instanceof Error && err.name === "AbortError") throw err;
    throw new ApiError(0, "network", "Network request failed");
  }

  if (res.status === 429) {
    throw new ApiError(429, "rate_limited", "Rate limited by CoinGecko");
  }
  if (!res.ok) {
    throw new ApiError(res.status, "http", `HTTP ${res.status}`);
  }

  try {
    return (await res.json()) as T;
  } catch {
    throw new ApiError(res.status, "parse", "Invalid JSON response");
  }
}

interface RawMarket {
  current_price: number | null;
  price_change_percentage_24h: number | null;
  total_volume: number | null;
  high_24h: number | null;
  low_24h: number | null;
  market_cap: number | null;
  last_updated: string;
}

export async function fetchSummary(signal?: AbortSignal): Promise<PriceSummary> {
  const rows = await request<RawMarket[]>(
    "/coins/markets?vs_currency=usd&ids=bitcoin",
    signal
  );
  const row = rows[0];
  if (!row || row.current_price == null) {
    throw new ApiError(200, "parse", "No bitcoin market data returned");
  }

  return {
    price: row.current_price,
    change24hPct: row.price_change_percentage_24h ?? 0,
    volume24h: row.total_volume ?? 0,
    high24h: row.high_24h ?? row.current_price,
    low24h: row.low_24h ?? row.current_price,
    marketCap: row.market_cap ?? 0,
    updatedAt: new Date(row.last_updated),
  };
}

type RawCandle = [number, number, number, number, number];

export async function fetchOhlc(
  timeframe: Timeframe,
  signal?: AbortSignal
): Promise<Candle[]> {
  const days = TIMEFRAME_DAYS[timeframe];
  const raw = await request<RawCandle[]>(
    `/coins/bitcoin/ohlc?vs_currency=usd&days=${days}`,
    signal
  );
  return raw.map(([ms, open, high, low, close]) => ({
    time: Math.floor(ms / 1000),
    open,
    high,
    low,
    close,
  }));
}

const priceFmtLarge = new Intl.NumberFormat("en-US", {
  style: "currency",
  currency: "USD",
  maximumFractionDigits: 2,
});
const priceFmtSmall = new Intl.NumberFormat("en-US", {
  style: "currency",
  currency: "USD",
  maximumFractionDigits: 6,
});
const compactFmt = new Intl.NumberFormat("en-US", {
  style: "currency",
  currency: "USD",
  notation: "compact",
  maximumFractionDigits: 2,
});

export function formatPrice(n: number): string {
  return (n >= 1000 ? priceFmtLarge : priceFmtSmall).format(n);
}

export function formatChange(pct: number): string {
  const sign = pct > 0 ? "+" : "";
  return `${sign}${pct.toFixed(2)}%`;
}

export function formatCompact(n: number): string {
  return compactFmt.format(n);
}

export function formatRelativeTime(date: Date, now: Date = new Date()): string {
  const secs = Math.max(0, Math.floor((now.getTime() - date.getTime()) / 1000));
  if (secs < 5) return "just now";
  if (secs < 60) return `${secs}s ago`;
  if (secs < 3600) return `${Math.floor(secs / 60)}m ago`;
  if (secs < 86400) return `${Math.floor(secs / 3600)}h ago`;
  return `${Math.floor(secs / 86400)}d ago`;
}
