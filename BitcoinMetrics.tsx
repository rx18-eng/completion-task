import {
  describeError,
  formatBlockHeight,
  formatCountdown,
  formatRelativeTime,
} from "./api";
import { useBitcoinMetrics, useNow } from "./hooks";
import { RetryButton } from "./RetryButton";

export function BitcoinMetrics() {
  const query = useBitcoinMetrics();
  const now = useNow(30_000);

  if (query.isPending) return <BitcoinMetricsSkeleton />;
  if (query.isError && !query.data)
    return (
      <BitcoinMetricsError
        error={query.error}
        onRetry={() => query.refetch()}
        fetching={query.isFetching}
      />
    );

  const { data, isFetching } = query;
  const halvingMsLeft = data.halving.estimatedDate.getTime() - now.getTime();

  return (
    <section className="card metrics-card" aria-label="Bitcoin network metrics">
      <header className="card__head">
        <span className="eyebrow">Bitcoin Network · mempool.space</span>
        <div className="card__meta" aria-live="off">
          <span
            className={`dot ${isFetching ? "dot--live" : ""}`}
            aria-hidden="true"
          />
          <span className="eyebrow">
            block {formatBlockHeight(data.blockHeight)}
          </span>
        </div>
      </header>

      <dl className="card__stats metrics-card__stats">
        <div className="stat">
          <dt className="stat__label eyebrow">Block Height</dt>
          <dd className="stat__value">{formatBlockHeight(data.blockHeight)}</dd>
        </div>
        <div className="stat">
          <dt className="stat__label eyebrow">Last Block</dt>
          <dd className="stat__value">
            {formatRelativeTime(data.lastBlockTime, now)}
          </dd>
        </div>
        <div className="stat">
          <dt className="stat__label eyebrow">Next Halving</dt>
          <dd className="stat__value">{formatCountdown(halvingMsLeft)}</dd>
          <dd className="stat__sub eyebrow">
            block {formatBlockHeight(data.halving.nextHalvingHeight)}
          </dd>
        </div>
        <div className="stat">
          <dt className="stat__label eyebrow">Fees (sat/vB)</dt>
          <dd className="stat__value stat__value--fees">
            <span>{data.fees.fastest}</span>
            <span className="fee-divider" aria-hidden="true">·</span>
            <span>{data.fees.halfHour}</span>
            <span className="fee-divider" aria-hidden="true">·</span>
            <span>{data.fees.hour}</span>
          </dd>
          <dd className="stat__sub eyebrow">next · 30m · 1h</dd>
        </div>
      </dl>
    </section>
  );
}

function BitcoinMetricsSkeleton() {
  return (
    <section
      className="card metrics-card card--skeleton"
      aria-busy="true"
      aria-label="Loading Bitcoin network metrics"
    >
      <header className="card__head">
        <span className="skeleton skeleton--sm" style={{ width: 180 }} />
        <span className="skeleton skeleton--sm" style={{ width: 96 }} />
      </header>
      <div className="card__stats metrics-card__stats">
        {[0, 1, 2, 3].map((i) => (
          <div key={i} className="stat">
            <span className="skeleton skeleton--sm" style={{ width: 78 }} />
            <span className="skeleton skeleton--md" style={{ width: 110, marginTop: 8 }} />
          </div>
        ))}
      </div>
    </section>
  );
}

function BitcoinMetricsError({
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
    <section className="card metrics-card card--error" role="alert">
      <header className="card__head">
        <span className="eyebrow eyebrow--error">{heading}</span>
      </header>
      <p className="card__error-msg">{message}</p>
      <RetryButton onClick={onRetry} fetching={fetching} />
    </section>
  );
}
