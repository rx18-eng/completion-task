import { useMemo } from "react";
import { formatChange, formatCompact, formatPrice } from "./api";
import { usePriceSummary } from "./hooks";

const DIVIDER = "·";
const ITEM_GAP = "  ";

// Live BTC stats ticker — infinite marquee using the duplicated-content
// pattern (span + aria-hidden clone, translateX(-50%) for seamless loop).
// Pauses on hover. Reduced-motion shows a static snapshot.
export function Marquee() {
  const { data, isError } = usePriceSummary();
  const hasError = isError && !data;

  const line = useMemo(() => {
    // Keep last-known data visible on transient errors (TanStack Query holds
    // the previous result during failed refetches) — the PriceCard stale pill
    // handles the warning separately. Only fall back when no data ever landed.
    const items = data
      ? [
          `BTC ${formatPrice(data.price)}`,
          `24H ${formatChange(data.change24hPct)}`,
          `HIGH ${formatPrice(data.high24h)}`,
          `LOW ${formatPrice(data.low24h)}`,
          `VOL ${formatCompact(data.volume24h)}`,
          `MCAP ${formatCompact(data.marketCap)}`,
        ]
      : [hasError ? "— CONNECTION LOST —" : "— LIVE BTC FEED —"];
    // Trailing divider so the seam between the two copies matches the
    // inter-item separator — visually seamless at the 50% wrap point.
    return items.join(`${ITEM_GAP}${DIVIDER}${ITEM_GAP}`) + `${ITEM_GAP}${DIVIDER}${ITEM_GAP}`;
  }, [data, hasError]);

  return (
    <div
      className={`marquee${hasError ? " marquee--error" : ""}`}
      aria-hidden="true"
    >
      <div className="marquee__track">
        <span className="marquee__line">{line}</span>
        <span className="marquee__line">{line}</span>
      </div>
    </div>
  );
}
