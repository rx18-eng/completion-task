import { useRef } from "react";
import { useMagnetic } from "./hooks";

export function RetryButton({
  onClick,
  fetching,
}: {
  onClick: () => void;
  fetching: boolean;
}) {
  const ref = useRef<HTMLButtonElement | null>(null);
  useMagnetic(ref, 0.18);

  return (
    <button
      ref={ref}
      type="button"
      className="retry-btn"
      onClick={onClick}
      disabled={fetching}
      data-interactive
    >
      <span className="retry-btn__glyph" aria-hidden="true">
        ↻
      </span>
      <span>{fetching ? "Retrying" : "Retry"}</span>
    </button>
  );
}
