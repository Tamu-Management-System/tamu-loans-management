// Data hooks for Accounting.
import { keepPreviousData, useQuery } from "@tanstack/react-query";
import { api } from "./client";
import type { PayoutList } from "./types";

/** Loans paid out between two dates (ISO, inclusive). */
export function usePayouts(from: string, to: string) {
  return useQuery({
    queryKey: ["accounting", "payouts", from, to],
    queryFn: () => api.get<PayoutList>(`/accounting/payouts?from=${from}&to=${to}`),
    placeholderData: keepPreviousData,
  });
}
