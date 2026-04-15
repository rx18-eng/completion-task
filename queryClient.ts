import { QueryClient } from "@tanstack/react-query";
import { ApiError } from "./api";

const MAX_RETRIES = 3;
const MAX_RETRIES_WHEN_RATE_LIMITED = 1;
const MAX_BACKOFF_MS = 30_000;

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
      retryDelay: (attempt) =>
        Math.min(1000 * 2 ** attempt, MAX_BACKOFF_MS),
    },
  },
});
