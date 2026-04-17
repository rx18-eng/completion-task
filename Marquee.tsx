import { useMemo } from "react";
import { formatChange, formatCompact, formatPrice } from "./api";
import { usePriceSummary } from "./hooks";

const DIVIDER = "·";
const ITEM_GAP = "  ";

// Live BTC stats ticker — infinite marquee using the duplicated-content
// pattern (span + aria-hidden clone, translateX(-50%) for seamless loop).
// Pauses on hover. Reduced-motion shows a static snapshot.
export function Marquee() {
  const { data } = usePriceSummary();

  const line = useMemo(() => {
    const items = data
      ? [
          `BTC ${formatPrice(data.price)}`,
          `24H ${formatChange(data.change24hPct)}`,
          `HIGH ${formatPrice(data.high24h)}`,
          `LOW ${formatPrice(data.low24h)}`,
          `VOL ${formatCompact(data.volume24h)}`,
          `MCAP ${formatCompact(data.marketCap)}`,
        ]
      : ["— LIVE BTC FEED —"];
    // Trailing divider so the seam between the two copies matches the
    // inter-item separator — visually seamless at the 50% wrap point.
    return items.join(`${ITEM_GAP}${DIVIDER}${ITEM_GAP}`) + `${ITEM_GAP}${DIVIDER}${ITEM_GAP}`;
  }, [data]);

  return (
    <div className="marquee" aria-label="Bitcoin live stats">
      <div className="marquee__track">
        <span className="marquee__line">{line}</span>
        <span className="marquee__line" aria-hidden="true">{line}</span>
      </div>
    </div>
  );
}
