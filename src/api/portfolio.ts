// Data hooks for the dashboard's portfolio section.
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { api } from "./client";
import type { ActivityList, ArrearsBreakdown, EarlyWarningList, OfficerPerformance, PortfolioRisk, PortfolioSummary, WorklistTask } from "./types";

export const EARLY_WARNINGS_LIMIT = 5;
export const ACTIVITY_LIMIT = 5;

export const usePortfolioRisk = () => useQuery({ queryKey: ["portfolio", "risk"], queryFn: () => api.get<PortfolioRisk>("/portfolio/risk") });

export const useArrearsBreakdown = () => useQuery({ queryKey: ["portfolio", "arrears"], queryFn: () => api.get<ArrearsBreakdown>("/portfolio/arrears") });

export const useEarlyWarnings = () =>
  useQuery({
    queryKey: ["portfolio", "early-warnings"],
    queryFn: () => api.get<EarlyWarningList>(`/portfolio/early-warnings?limit=${EARLY_WARNINGS_LIMIT}`),
  });

export const usePortfolioSummary = () => useQuery({ queryKey: ["portfolio", "summary"], queryFn: () => api.get<PortfolioSummary>("/portfolio/summary") });

export const useRecentActivity = (enabled = true) =>
  useQuery({ queryKey: ["activity"], queryFn: () => api.get<ActivityList>(`/activity?limit=${ACTIVITY_LIMIT}`), enabled });

export const useTeamPerformance = () => useQuery({ queryKey: ["team", "performance"], queryFn: () => api.get<OfficerPerformance[]>("/team/performance") });

/** "Add to today": puts an overdue loan on the user's worklist. */
export function useAddToWorklist() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (loanId: string) => api.post<WorklistTask>("/worklist/tasks", { loanId }),
    onSuccess: () =>
      Promise.all([["worklist"], ["dashboard"], ["portfolio", "early-warnings"]].map((queryKey) => queryClient.invalidateQueries({ queryKey }))),
  });
}
