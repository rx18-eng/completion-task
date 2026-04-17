export type Currency = "usd";
export type Timeframe = "1D" | "7D" | "30D" | "1Y";
export const TIMEFRAMES = ["1D", "7D", "30D", "1Y"] as const satisfies readonly Timeframe[];

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

export function describeError(error: unknown): { heading: string; message: string } {
  if (error instanceof ApiError) {
    switch (error.code) {
      case "rate_limited":
        return {
          heading: "Rate Limited",
          message: "CoinGecko is rate limiting this session. Retrying automatically.",
        };
      case "network":
        return {
          heading: "Offline",
          message: "Network unavailable. Retrying when the connection returns.",
        };
      case "parse":
        return {
          heading: "Unexpected Response",
          message: "The API returned data in an unexpected shape.",
        };
      case "http":
        return {
          heading: `HTTP ${error.status}`,
          message: "Upstream server error. Retrying automatically.",
        };
    }
  }
  return { heading: "Error", message: "Couldn't load data." };
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

function isObject(v: unknown): v is Record<string, unknown> {
  return typeof v === "object" && v !== null;
}

function numOr(v: unknown, fallback: number): number {
  return typeof v === "number" && Number.isFinite(v) ? v : fallback;
}

export function parseMarketRow(row: unknown): PriceSummary {
  if (!isObject(row)) {
    throw new ApiError(200, "parse", "Expected market row to be an object");
  }
  const price = row.current_price;
  if (typeof price !== "number" || !Number.isFinite(price)) {
    throw new ApiError(200, "parse", "Missing or invalid current_price");
  }
  const last = row.last_updated;
  if (typeof last !== "string") {
    throw new ApiError(200, "parse", "Missing last_updated");
  }
  const updatedAt = new Date(last);
  if (Number.isNaN(updatedAt.getTime())) {
    throw new ApiError(200, "parse", "Invalid last_updated date");
  }
  return {
    price,
    change24hPct: numOr(row.price_change_percentage_24h, 0),
    volume24h: numOr(row.total_volume, 0),
    high24h: numOr(row.high_24h, price),
    low24h: numOr(row.low_24h, price),
    marketCap: numOr(row.market_cap, 0),
    updatedAt,
  };
}

export async function fetchSummary(signal?: AbortSignal): Promise<PriceSummary> {
  const data = await request<unknown>(
    "/coins/markets?vs_currency=usd&ids=bitcoin",
    signal
  );
  if (!Array.isArray(data) || data.length === 0) {
    throw new ApiError(200, "parse", "Empty market response");
  }
  return parseMarketRow(data[0]);
}

export function parseCandle(row: unknown): Candle {
  if (!Array.isArray(row) || row.length < 5) {
    throw new ApiError(200, "parse", "Malformed OHLC tuple");
  }
  const [ms, open, high, low, close] = row;
  if (
    typeof ms !== "number" ||
    typeof open !== "number" ||
    typeof high !== "number" ||
    typeof low !== "number" ||
    typeof close !== "number"
  ) {
    throw new ApiError(200, "parse", "OHLC tuple has non-numeric entries");
  }
  return { time: Math.floor(ms / 1000), open, high, low, close };
}

export async function fetchOhlc(
  timeframe: Timeframe,
  signal?: AbortSignal
): Promise<Candle[]> {
  const days = TIMEFRAME_DAYS[timeframe];
  const data = await request<unknown>(
    `/coins/bitcoin/ohlc?vs_currency=usd&days=${days}`,
    signal
  );
  if (!Array.isArray(data)) {
    throw new ApiError(200, "parse", "Expected OHLC array");
  }
  return data.map(parseCandle);
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
