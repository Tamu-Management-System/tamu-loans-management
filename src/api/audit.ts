// Data hooks for the audit log.
import { keepPreviousData, useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { saveFile } from "../lib/saveFile";
import { api } from "./client";
import type { AuditCategory, AuditPage } from "./types";

export interface AuditParams {
  /** ISO dates, inclusive */
  from: string;
  to: string;
  actorId: string | null;
  category: AuditCategory | null;
  query: string;
  page: number;
}

const searchOf = (params: AuditParams) => {
  const search = new URLSearchParams({ from: params.from, to: params.to });
  if (params.actorId) search.set("actorId", params.actorId);
  if (params.category) search.set("category", params.category);
  if (params.query) search.set("q", params.query);
  return search;
};

export function useAuditLog(params: AuditParams) {
  const search = searchOf(params);
  search.set("page", String(params.page));
  return useQuery({ queryKey: ["audit", params], queryFn: () => api.get<AuditPage>(`/audit?${search}`), placeholderData: keepPreviousData });
}

/** Downloads what the filters show as a CSV file (the export itself is logged) */
export function useExportAuditLog() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async (params: AuditParams) => saveFile(await api.getFile(`/audit/export?${searchOf(params)}`), `audit-log-${params.from}-to-${params.to}.csv`),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ["audit"] }),
  });
}
