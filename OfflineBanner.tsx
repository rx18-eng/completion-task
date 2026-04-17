import { useOnline } from "./hooks";

export function OfflineBanner() {
  const online = useOnline();
  return (
    <div
      className="offline-banner"
      data-visible={online ? undefined : "true"}
      role="status"
      aria-live="polite"
      aria-hidden={online ? "true" : undefined}
    >
      <span className="offline-banner__dot" aria-hidden="true" />
      <span>Offline — waiting for connection</span>
    </div>
  );
}
