import { QueryClient } from "@tanstack/react-query";
import { ApiError } from "./api";

const MAX_RETRIES = 3;
const MAX_RETRIES_WHEN_RATE_LIMITED = 1;
const MAX_BACKOFF_MS = 30_000;
// CoinGecko's free tier is 30 req/min on a sliding window — a retry inside
// ~10s almost always lands in the same window that triggered the 429. Wait
// long enough for the window to roll before trying again.
const RATE_LIMIT_BACKOFF_MS = 15_000;

export const queryClient = new QueryClient({
  defaultOptions: {
    queries: {
      refetchOnWindowFocus: true,
      refetchOnReconnect: true,
      structuralSharing: true,
      retry: (failureCount, error) => {
        if (error instanceof ApiError && error.isRateLimit) {
          return failureCount < MAX_RETRIES_WHEN_RATE_LIMITED;
        }
        return failureCount < MAX_RETRIES;
      },
      retryDelay: (attempt, error) => {
        if (error instanceof ApiError && error.isRateLimit) {
          return RATE_LIMIT_BACKOFF_MS;
        }
        return Math.min(1000 * 2 ** attempt, MAX_BACKOFF_MS);
      },
    },
  },
});
