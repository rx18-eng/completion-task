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

export interface FeeEstimates {
  fastest: number;
  halfHour: number;
  hour: number;
  economy: number;
}

export interface HalvingCountdown {
  blocksRemaining: number;
  nextHalvingHeight: number;
  estimatedDate: Date;
}

export interface BitcoinMetrics {
  blockHeight: number;
  lastBlockTime: Date;
  fees: FeeEstimates;
  halving: HalvingCountdown;
}

export const HALVING_INTERVAL = 210_000;
const BTC_BLOCK_TIME_S = 600;

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
          message:
            "Upstream is rate-limiting this session (free-tier quota). Retrying shortly.",
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
const MEMPOOL_BASE = "https://mempool.space/api";

const TIMEFRAME_DAYS: Record<Timeframe, number> = {
  "1D": 1,
  "7D": 7,
  "30D": 30,
  "1Y": 365,
};

// Shared across CoinGecko + mempool.space. On fetch()-level failure while the
// browser reports online, treat as rate_limited rather than network: CoinGecko
// drops Access-Control-Allow-Origin on 429s, so the browser eats the response
// and surfaces a bare TypeError — indistinguishable from a real network drop
// without this heuristic. Misclassifying as network triggers the 3-retry path,
// which makes the rate-limit worse.
export async function fetchJson<T>(url: string, signal?: AbortSignal): Promise<T> {
  let res: Response;
  try {
    res = await fetch(url, {
      signal,
      headers: { accept: "application/json" },
    });
  } catch (err) {
    if (err instanceof Error && err.name === "AbortError") throw err;
    const isOffline =
      typeof navigator !== "undefined" && navigator.onLine === false;
    if (isOffline) {
      throw new ApiError(0, "network", "Network request failed");
    }
    throw new ApiError(
      0,
      "rate_limited",
      "Upstream unreachable (likely rate-limited — CORS hides 429)"
    );
  }

  if (res.status === 429) {
    throw new ApiError(429, "rate_limited", "Rate limited by upstream");
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

async function request<T>(path: string, signal?: AbortSignal): Promise<T> {
  return fetchJson<T>(`${BASE}${path}`, signal);
}

async function mempoolRequest<T>(path: string, signal?: AbortSignal): Promise<T> {
  return fetchJson<T>(`${MEMPOOL_BASE}${path}`, signal);
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

export function parseBlock(row: unknown): { height: number; timestamp: number } {
  if (!isObject(row)) {
    throw new ApiError(200, "parse", "Block is not an object");
  }
  const height = row.height;
  const timestamp = row.timestamp;
  if (typeof height !== "number" || !Number.isFinite(height) || height < 0) {
    throw new ApiError(200, "parse", "Invalid block height");
  }
  if (typeof timestamp !== "number" || !Number.isFinite(timestamp) || timestamp < 0) {
    throw new ApiError(200, "parse", "Invalid block timestamp");
  }
  return { height, timestamp };
}

export function parseFeeEstimates(row: unknown): FeeEstimates {
  if (!isObject(row)) {
    throw new ApiError(200, "parse", "Fee response is not an object");
  }
  return {
    fastest: numOr(row.fastestFee, 0),
    halfHour: numOr(row.halfHourFee, 0),
    hour: numOr(row.hourFee, 0),
    economy: numOr(row.economyFee, 0),
  };
}

// Pure: computes the subsidy-halving window around `height`. Bitcoin halves
// every 210,000 blocks. The count is the next boundary ≥ height+1, since a
// halving applies TO the block at that height (not strictly after it).
export function computeHalvingCountdown(
  height: number,
  now: Date = new Date()
): HalvingCountdown {
  const halvingsPassed = Math.floor(height / HALVING_INTERVAL);
  const nextHalvingHeight = (halvingsPassed + 1) * HALVING_INTERVAL;
  const blocksRemaining = nextHalvingHeight - height;
  const estimatedMs = blocksRemaining * BTC_BLOCK_TIME_S * 1000;
  return {
    blocksRemaining,
    nextHalvingHeight,
    estimatedDate: new Date(now.getTime() + estimatedMs),
  };
}

export async function fetchBitcoinMetrics(signal?: AbortSignal): Promise<BitcoinMetrics> {
  const [blocks, feesRaw] = await Promise.all([
    mempoolRequest<unknown>("/v1/blocks", signal),
    mempoolRequest<unknown>("/v1/fees/recommended", signal),
  ]);
  if (!Array.isArray(blocks) || blocks.length === 0) {
    throw new ApiError(200, "parse", "Empty blocks response");
  }
  const { height, timestamp } = parseBlock(blocks[0]);
  return {
    blockHeight: height,
    lastBlockTime: new Date(timestamp * 1000),
    fees: parseFeeEstimates(feesRaw),
    halving: computeHalvingCountdown(height),
  };
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

const blockHeightFmt = new Intl.NumberFormat("en-US");

export function formatBlockHeight(height: number): string {
  return blockHeightFmt.format(height);
}

// Compact countdown string. Granularity chosen so numbers stay meaningful:
// over a year use 0.1-year precision; weeks use days; under a day use h+m.
export function formatCountdown(ms: number): string {
  if (ms <= 0) return "now";
  const s = Math.floor(ms / 1000);
  const days = Math.floor(s / 86400);
  if (days >= 365) {
    return `~${(days / 365).toFixed(1)}y`;
  }
  if (days >= 30) {
    return `${days}d`;
  }
  if (days >= 1) {
    const h = Math.floor((s % 86400) / 3600);
    return h > 0 ? `${days}d ${h}h` : `${days}d`;
  }
  const h = Math.floor(s / 3600);
  const m = Math.floor((s % 3600) / 60);
  return h > 0 ? `${h}h ${m}m` : `${m}m`;
}

export function formatRelativeTime(date: Date, now: Date = new Date()): string {
  const secs = Math.max(0, Math.floor((now.getTime() - date.getTime()) / 1000));
  if (secs < 5) return "just now";
  if (secs < 60) return `${secs}s ago`;
  if (secs < 3600) return `${Math.floor(secs / 60)}m ago`;
  if (secs < 86400) return `${Math.floor(secs / 3600)}h ago`;
  return `${Math.floor(secs / 86400)}d ago`;
}
