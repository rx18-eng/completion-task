import { describe, expect, it } from "vitest";
import {
  ApiError,
  describeError,
  formatChange,
  formatCompact,
  formatPrice,
  formatRelativeTime,
  parseCandle,
  parseMarketRow,
} from "./api";

describe("ApiError", () => {
  it("attaches status + code + name", () => {
    const e = new ApiError(429, "rate_limited", "throttled");
    expect(e.status).toBe(429);
    expect(e.code).toBe("rate_limited");
    expect(e.name).toBe("ApiError");
    expect(e.message).toBe("throttled");
  });

  it("isRateLimit reflects code", () => {
    expect(new ApiError(429, "rate_limited", "").isRateLimit).toBe(true);
    expect(new ApiError(500, "http", "").isRateLimit).toBe(false);
    expect(new ApiError(0, "network", "").isRateLimit).toBe(false);
    expect(new ApiError(200, "parse", "").isRateLimit).toBe(false);
  });
});

describe("describeError", () => {
  const msg = (code: "rate_limited" | "network" | "parse" | "http", status = 500) =>
    describeError(new ApiError(status, code, "x"));

  it("rate_limited → Rate Limited", () => {
    expect(msg("rate_limited", 429).heading).toBe("Rate Limited");
  });
  it("network → Offline", () => {
    expect(msg("network", 0).heading).toBe("Offline");
  });
  it("parse → Unexpected Response", () => {
    expect(msg("parse", 200).heading).toBe("Unexpected Response");
  });
  it("http → HTTP {status}", () => {
    expect(msg("http", 503).heading).toBe("HTTP 503");
  });
  it("unknown error → default", () => {
    expect(describeError(new Error("boom")).heading).toBe("Error");
    expect(describeError(null).heading).toBe("Error");
    expect(describeError("oops").heading).toBe("Error");
    expect(describeError(undefined).heading).toBe("Error");
  });
  it("returns both heading and message for every code", () => {
    for (const code of ["rate_limited", "network", "parse", "http"] as const) {
      const out = describeError(new ApiError(500, code, ""));
      expect(out.heading.length).toBeGreaterThan(0);
      expect(out.message.length).toBeGreaterThan(0);
    }
  });
});

describe("parseMarketRow", () => {
  const validRow = {
    current_price: 68421.12,
    price_change_percentage_24h: 2.34,
    total_volume: 3.82e10,
    high_24h: 69120,
    low_24h: 67850,
    market_cap: 1.34e12,
    last_updated: "2026-04-18T12:00:00.000Z",
  };

  it("parses a valid row", () => {
    const out = parseMarketRow(validRow);
    expect(out.price).toBe(68421.12);
    expect(out.change24hPct).toBe(2.34);
    expect(out.volume24h).toBe(3.82e10);
    expect(out.high24h).toBe(69120);
    expect(out.low24h).toBe(67850);
    expect(out.marketCap).toBe(1.34e12);
    expect(out.updatedAt.toISOString()).toBe("2026-04-18T12:00:00.000Z");
  });

  it("throws ApiError(parse) when row is not an object", () => {
    expect(() => parseMarketRow(null)).toThrow(ApiError);
    expect(() => parseMarketRow("string")).toThrow(/parse|object/i);
    expect(() => parseMarketRow(42)).toThrow(ApiError);
  });

  it("throws when current_price is missing or non-finite", () => {
    expect(() => parseMarketRow({ ...validRow, current_price: undefined }))
      .toThrow(ApiError);
    expect(() => parseMarketRow({ ...validRow, current_price: "68000" }))
      .toThrow(ApiError);
    expect(() => parseMarketRow({ ...validRow, current_price: NaN }))
      .toThrow(ApiError);
    expect(() => parseMarketRow({ ...validRow, current_price: Infinity }))
      .toThrow(ApiError);
  });

  it("throws when last_updated is missing or not a string", () => {
    expect(() => parseMarketRow({ ...validRow, last_updated: undefined }))
      .toThrow(ApiError);
    expect(() => parseMarketRow({ ...validRow, last_updated: 1713441600 }))
      .toThrow(ApiError);
  });

  it("throws when last_updated is unparseable", () => {
    expect(() => parseMarketRow({ ...validRow, last_updated: "not-a-date" }))
      .toThrow(ApiError);
  });

  it("falls back for optional fields (volume → 0, high/low → price)", () => {
    const out = parseMarketRow({
      current_price: 50000,
      last_updated: "2026-04-18T12:00:00.000Z",
    });
    expect(out.volume24h).toBe(0);
    expect(out.high24h).toBe(50000);
    expect(out.low24h).toBe(50000);
    expect(out.marketCap).toBe(0);
  });

  it("attaches code=parse on every failure", () => {
    try {
      parseMarketRow({ current_price: "nope" });
      expect.fail("should have thrown");
    } catch (e) {
      expect(e).toBeInstanceOf(ApiError);
      expect((e as ApiError).code).toBe("parse");
    }
  });
});

describe("parseCandle", () => {
  it("parses a valid OHLC tuple and converts ms → seconds", () => {
    const out = parseCandle([1713441600000, 68000, 69000, 67500, 68500]);
    expect(out.time).toBe(1713441600); // ms floored to seconds
    expect(out.open).toBe(68000);
    expect(out.high).toBe(69000);
    expect(out.low).toBe(67500);
    expect(out.close).toBe(68500);
  });

  it("throws when not an array", () => {
    expect(() => parseCandle({ ts: 1, open: 1 })).toThrow(ApiError);
  });

  it("throws on wrong arity", () => {
    expect(() => parseCandle([1, 2, 3])).toThrow(ApiError);
    expect(() => parseCandle([])).toThrow(ApiError);
  });

  it("throws on non-numeric entries", () => {
    expect(() => parseCandle([1713441600000, "68000", 69000, 67500, 68500]))
      .toThrow(ApiError);
    expect(() => parseCandle(["ts", 68000, 69000, 67500, 68500]))
      .toThrow(ApiError);
  });

  it("attaches code=parse on every failure", () => {
    try {
      parseCandle([]);
      expect.fail("should have thrown");
    } catch (e) {
      expect(e).toBeInstanceOf(ApiError);
      expect((e as ApiError).code).toBe("parse");
    }
  });
});

describe("formatPrice", () => {
  it("formats large values with 2 decimals and thousands separator", () => {
    expect(formatPrice(68421.1234)).toBe("$68,421.12");
    expect(formatPrice(1000)).toBe("$1,000.00");
  });
  it("formats small values with more precision", () => {
    expect(formatPrice(0.01)).toBe("$0.01");
    expect(formatPrice(0.000123)).toBe("$0.000123");
  });
});

describe("formatChange", () => {
  it("adds + for positive", () => {
    expect(formatChange(2.345)).toBe("+2.35%");
  });
  it("keeps native - for negative", () => {
    expect(formatChange(-1.2)).toBe("-1.20%");
  });
  it("no sign for zero", () => {
    expect(formatChange(0)).toBe("0.00%");
  });
});

describe("formatCompact", () => {
  it("uses compact USD notation", () => {
    const out = formatCompact(1.34e12);
    expect(out).toContain("$");
    expect(out).toMatch(/T$/);
  });
});

describe("formatRelativeTime", () => {
  const now = new Date("2026-04-18T12:00:00.000Z");
  const ago = (secs: number) => new Date(now.getTime() - secs * 1000);

  it("just now for < 5s", () => {
    expect(formatRelativeTime(ago(0), now)).toBe("just now");
    expect(formatRelativeTime(ago(4), now)).toBe("just now");
  });
  it("seconds for 5..59", () => {
    expect(formatRelativeTime(ago(5), now)).toBe("5s ago");
    expect(formatRelativeTime(ago(59), now)).toBe("59s ago");
  });
  it("minutes for 60..3599", () => {
    expect(formatRelativeTime(ago(60), now)).toBe("1m ago");
    expect(formatRelativeTime(ago(3599), now)).toBe("59m ago");
  });
  it("hours for 3600..86399", () => {
    expect(formatRelativeTime(ago(3600), now)).toBe("1h ago");
    expect(formatRelativeTime(ago(7200), now)).toBe("2h ago");
  });
  it("days for >= 86400", () => {
    expect(formatRelativeTime(ago(86400), now)).toBe("1d ago");
    expect(formatRelativeTime(ago(172800), now)).toBe("2d ago");
  });
  it("clamps future dates to just now", () => {
    const future = new Date(now.getTime() + 5000);
    expect(formatRelativeTime(future, now)).toBe("just now");
  });
});
