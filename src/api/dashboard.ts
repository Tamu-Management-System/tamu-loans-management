// Data hooks for the dashboard.
import { useQuery } from "@tanstack/react-query";
import { api } from "./client";
import type { DashboardToday } from "./types";

export function useDashboardToday() {
  return useQuery({
    queryKey: ["dashboard", "today"],
    queryFn: () => api.get<DashboardToday>("/dashboard/today"),
    refetchInterval: 60_000,
  });
}
