import {
  ApiError,
  formatChange,
  formatCompact,
  formatPrice,
  formatRelativeTime,
} from "./api";
import { useNow, usePriceFlash, usePriceSummary } from "./hooks";

export function PriceCard() {
  const query = usePriceSummary();
  const now = useNow(1000);
  const flash = usePriceFlash(query.data?.price);

  if (query.isPending) return <PriceCardSkeleton />;
  if (query.isError) return <PriceCardError error={query.error} />;

  const { data, isFetching } = query;
  const up = data.change24hPct >= 0;

  return (
    <section className="card" aria-live="polite">
      <header className="card__head">
        <span className="eyebrow">Bitcoin · USD</span>
        <div className="card__meta" aria-live="off">
          <span
            className={`dot ${isFetching ? "dot--live" : ""}`}
            aria-hidden="true"
          />
          <span className="eyebrow">
            updated {formatRelativeTime(data.updatedAt, now)}
          </span>
        </div>
      </header>

      <div className="card__price-row">
        <div
          className={`price${flash ? ` price--flash-${flash}` : ""}`}
          aria-label={`Bitcoin price ${formatPrice(data.price)}`}
        >
          {formatPrice(data.price)}
        </div>
        <div className={`change change--${up ? "up" : "down"}`}>
          <span className="change__arrow" aria-hidden="true">
            {up ? "▲" : "▼"}
          </span>
          <span className="change__pct">{formatChange(data.change24hPct)}</span>
          <span className="change__label">24h</span>
        </div>
      </div>

      <dl className="card__stats">
        <Stat label="24h High" value={formatPrice(data.high24h)} />
        <Stat label="24h Low" value={formatPrice(data.low24h)} />
        <Stat label="Volume" value={formatCompact(data.volume24h)} />
        <Stat label="Market Cap" value={formatCompact(data.marketCap)} />
      </dl>
    </section>
  );
}

function Stat({ label, value }: { label: string; value: string }) {
  return (
    <div className="stat">
      <dt className="stat__label eyebrow">{label}</dt>
      <dd className="stat__value">{value}</dd>
    </div>
  );
}

function PriceCardSkeleton() {
  return (
    <section className="card card--skeleton" aria-busy="true" aria-label="Loading Bitcoin price">
      <header className="card__head">
        <span className="skeleton skeleton--sm" style={{ width: 120 }} />
        <span className="skeleton skeleton--sm" style={{ width: 96 }} />
      </header>
      <div className="card__price-row">
        <span className="skeleton skeleton--price" />
        <span className="skeleton skeleton--sm" style={{ width: 140, marginTop: 12 }} />
      </div>
      <div className="card__stats">
        {[0, 1, 2, 3].map((i) => (
          <div key={i} className="stat">
            <span className="skeleton skeleton--sm" style={{ width: 70 }} />
            <span className="skeleton skeleton--md" style={{ width: 100, marginTop: 8 }} />
          </div>
        ))}
      </div>
    </section>
  );
}

function PriceCardError({ error }: { error: unknown }) {
  const { heading, message } = describeError(error);
  return (
    <section className="card card--error" role="alert">
      <header className="card__head">
        <span className="eyebrow eyebrow--error">{heading}</span>
      </header>
      <p className="card__error-msg">{message}</p>
    </section>
  );
}

function describeError(error: unknown): { heading: string; message: string } {
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
  return {
    heading: "Error",
    message: "Couldn't load Bitcoin price.",
  };
}
