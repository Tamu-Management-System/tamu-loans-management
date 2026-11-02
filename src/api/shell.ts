// Data hooks for the app shell (top bar and sidebar).
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { api } from "./client";
import type { NavigationBadges, NotificationItem, RiskSummary, SearchResult } from "./types";

export const SEARCH_MIN_LENGTH = 2;

export function useSearch(query: string) {
  const trimmed = query.trim();
  return useQuery({
    queryKey: ["search", trimmed],
    queryFn: () => api.get<SearchResult[]>(`/search?q=${encodeURIComponent(trimmed)}`),
    enabled: trimmed.length >= SEARCH_MIN_LENGTH,
    staleTime: 30_000,
  });
}

export function useNotifications() {
  return useQuery({
    queryKey: ["notifications"],
    queryFn: () => api.get<NotificationItem[]>("/notifications"),
    refetchInterval: 60_000,
  });
}

export function useMarkNotificationsRead() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: () => api.post<void>("/notifications/mark-read"),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ["notifications"] }),
  });
}

export function useNavigationBadges() {
  return useQuery({
    queryKey: ["navigation-badges"],
    queryFn: () => api.get<NavigationBadges>("/navigation/badges"),
    refetchInterval: 60_000,
  });
}

export function useRiskSummary() {
  return useQuery({
    queryKey: ["risk-summary"],
    queryFn: () => api.get<RiskSummary>("/portfolio/risk-summary"),
  });
}
