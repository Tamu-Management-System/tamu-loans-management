// Data hooks for loans.
import { keepPreviousData, useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { api } from "./client";
import type { DisburseRequest, DisburseResult, LoanDetail, LoanList, LoanListTab, LoanToDisburse, ReturnFromRecoveryRequest, SendToRecoveryRequest } from "./types";

/** Approved loans waiting to be paid out. */
export function useLoansToDisburse() {
  return useQuery({
    queryKey: ["loans", "to-disburse"],
    queryFn: () => api.get<LoanToDisburse[]>("/loans/to-disburse"),
  });
}

/** Records a payout (sent by hand in the MVP). The loan becomes active and its schedule starts. */
export function useDisburse(applicationId: string) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: ({ idempotencyKey, ...payout }: DisburseRequest & { idempotencyKey?: string }) =>
      api.post<DisburseResult>(`/applications/${encodeURIComponent(applicationId)}/disburse`, payout, { idempotencyKey }),
    onSuccess: () =>
      Promise.all(
        [["loans"], ["applications"], ["borrowers"], ["dashboard"], ["worklist"], ["navigation-badges"], ["notifications"], ["activity"], ["portfolio"]].map((queryKey) =>
          queryClient.invalidateQueries({ queryKey }),
        ),
      ),
  });
}

export const LOANS_PAGE_SIZE = 25;

export interface LoanListParams {
  tab: LoanListTab;
  query: string;
  officerId: string | null;
  lateOnly: boolean;
  page: number;
}

/** Active, cleared or all loans, with the counts for the tabs and the totals strip. */
export function useLoanList(params: LoanListParams) {
  const search = new URLSearchParams({ status: params.tab, page: String(params.page), pageSize: String(LOANS_PAGE_SIZE) });
  if (params.query) search.set("q", params.query);
  if (params.officerId) search.set("officerId", params.officerId);
  if (params.lateOnly) search.set("late", "true");
  return useQuery({
    queryKey: ["loans", "list", params],
    queryFn: () => api.get<LoanList>(`/loans/list?${search}`),
    placeholderData: keepPreviousData,
  });
}

/** Everything that shows a loan's recovery status. */
function useRefreshAfterRecovery() {
  const queryClient = useQueryClient();
  return () => Promise.all([["loans"], ["borrowers"], ["activity"], ["dashboard"], ["worklist"]].map((queryKey) => queryClient.invalidateQueries({ queryKey })));
}

/** Hands a loan to the recovery team (manual for now; an automatic day limit comes once Tamu sets it). */
export function useSendToRecovery(loanId: string) {
  const refresh = useRefreshAfterRecovery();
  return useMutation({
    mutationFn: (request: SendToRecoveryRequest) => api.post<void>(`/loans/${encodeURIComponent(loanId)}/recovery`, request),
    onSuccess: refresh,
  });
}

/** Brings a loan back from recovery to its loan officer. */
export function useReturnFromRecovery(loanId: string) {
  const refresh = useRefreshAfterRecovery();
  return useMutation({
    mutationFn: (request: ReturnFromRecoveryRequest) => api.post<void>(`/loans/${encodeURIComponent(loanId)}/recovery/return`, request),
    onSuccess: refresh,
  });
}

/** One loan: its schedule, payments and where it came from. */
export function useLoan(loanId: string) {
  return useQuery({
    queryKey: ["loans", "detail", loanId],
    queryFn: () => api.get<LoanDetail>(`/loans/${encodeURIComponent(loanId)}`),
  });
}
