"use client";

import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { useState } from "react";

export function Providers({ children }: { children: React.ReactNode }) {
  const [client] = useState(() => new QueryClient({
    defaultOptions: {
      queries: {
        retry: (failureCount, error) =>
          (error as Error & { status?: number }).status !== 429 && failureCount < 1,
        staleTime: 15_000,
        refetchOnWindowFocus: false,
      },
    },
  }));
  return <QueryClientProvider client={client}>{children}</QueryClientProvider>;
}
