// Data hooks for the worklist, loans and payments.
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { api } from "./client";
import type { CallOutcome, LoanSummary, RecordPaymentRequest, RecordPaymentResponse, WorklistAction, WorklistTask } from "./types";

export function useWorklist() {
  return useQuery({
    queryKey: ["worklist"],
    queryFn: () => api.get<WorklistTask[]>("/worklist"),
  });
}

export function usePayableLoans() {
  return useQuery({
    queryKey: ["loans", "payable"],
    queryFn: () => api.get<LoanSummary[]>("/loans"),
  });
}

/** Everything that changes when work is done: refetch it all after a change. */
function useRefreshWork() {
  const queryClient = useQueryClient();
  return () =>
    Promise.all(
      [["worklist"], ["dashboard"], ["loans"], ["payments"], ["borrowers"], ["navigation-badges"], ["notifications"], ["portfolio"], ["team"]].map((queryKey) =>
        queryClient.invalidateQueries({ queryKey }),
      ),
    );
}

export function useRecordPayment() {
  const refresh = useRefreshWork();
  return useMutation({
    mutationFn: ({ idempotencyKey, ...payment }: RecordPaymentRequest & { idempotencyKey?: string }) => api.post<RecordPaymentResponse>("/payments", payment, { idempotencyKey }),
    onSuccess: refresh,
  });
}

export function useLogCallOutcome() {
  const refresh = useRefreshWork();
  return useMutation({
    mutationFn: ({ taskId, outcome }: { taskId: string; outcome: CallOutcome }) =>
      api.post<WorklistTask>(`/worklist/${taskId}/call-outcome`, outcome),
    onSuccess: refresh,
  });
}

export function useWorklistAction() {
  const refresh = useRefreshWork();
  return useMutation({
    mutationFn: ({ taskId, action }: { taskId: string; action: WorklistAction }) =>
      api.post<WorklistTask>(`/worklist/${taskId}/actions`, { action }),
    onSuccess: refresh,
  });
}

export function useUndoTask() {
  const refresh = useRefreshWork();
  return useMutation({
    mutationFn: (taskId: string) => api.post<void>(`/worklist/${taskId}/undo`),
    onSuccess: refresh,
  });
}
