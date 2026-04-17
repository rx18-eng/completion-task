import {
  describeError,
  formatChange,
  formatCompact,
  formatPrice,
  formatRelativeTime,
} from "./api";
import {
  SUMMARY_STALE_THRESHOLD_MS,
  useNow,
  usePriceFlash,
  usePriceSummary,
} from "./hooks";
import { AnimatedPrice } from "./AnimatedPrice";
import { RetryButton } from "./RetryButton";

export function PriceCard() {
  const query = usePriceSummary();
  const now = useNow(1000);
  const flash = usePriceFlash(query.data?.price);

  if (query.isPending) return <PriceCardSkeleton />;
  if (query.isError && !query.data)
    return (
      <PriceCardError
        error={query.error}
        onRetry={() => query.refetch()}
        fetching={query.isFetching}
      />
    );

  const { data, isFetching } = query;
  const up = data.change24hPct >= 0;
  const isStale =
    now.getTime() - data.updatedAt.getTime() > SUMMARY_STALE_THRESHOLD_MS;

  return (
    <section className="card">
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
          {isStale && (
            <span className="stale-pill" title="Data may be out of date">
              Stale
            </span>
          )}
        </div>
      </header>

      <div className="card__price-row">
        <AnimatedPrice
          value={data.price}
          className={`price${flash ? ` price--flash-${flash}` : ""}`}
        />
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

function PriceCardError({
  error,
  onRetry,
  fetching,
}: {
  error: unknown;
  onRetry: () => void;
  fetching: boolean;
}) {
  const { heading, message } = describeError(error);
  return (
    <section className="card card--error" role="alert">
      <header className="card__head">
        <span className="eyebrow eyebrow--error">{heading}</span>
      </header>
      <p className="card__error-msg">{message}</p>
      <RetryButton onClick={onRetry} fetching={fetching} />
    </section>
  );
}
