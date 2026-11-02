// Data hooks for the Payments page.
import { keepPreviousData, useQuery } from "@tanstack/react-query";
import { api } from "./client";
import type { PaymentList } from "./types";

export const PAYMENTS_PAGE_SIZE = 25;

export interface PaymentListParams {
  /** ISO dates, inclusive */
  from: string;
  to: string;
  query: string;
  officerId: string | null;
  method: string | null;
  page: number;
}

export function usePaymentList(params: PaymentListParams) {
  const search = new URLSearchParams({ from: params.from, to: params.to, page: String(params.page), pageSize: String(PAYMENTS_PAGE_SIZE) });
  if (params.query) search.set("q", params.query);
  if (params.officerId) search.set("officerId", params.officerId);
  if (params.method) search.set("method", params.method);
  return useQuery({
    queryKey: ["payments", "list", params],
    queryFn: () => api.get<PaymentList>(`/payments/list?${search}`),
    placeholderData: keepPreviousData,
  });
}
