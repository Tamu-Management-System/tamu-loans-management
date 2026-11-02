// Data hooks for Reports.
import { keepPreviousData, useMutation, useQuery } from "@tanstack/react-query";
import { saveFile } from "../lib/saveFile";
import { api } from "./client";
import type { Report, ReportName } from "./types";

const reportPath = (name: ReportName, from: string, to: string) => `/reports/${name}?${new URLSearchParams({ from, to })}`;

export function useReport(name: ReportName, from: string, to: string) {
  return useQuery({ queryKey: ["reports", name, from, to], queryFn: () => api.get<Report>(reportPath(name, from, to)), placeholderData: keepPreviousData });
}

/** The report as a PDF (figures and table) or its table as a CSV file (each export is audit-logged) */
export function useExportReport() {
  return useMutation({
    mutationFn: async ({ name, from, to, format }: { name: ReportName; from: string; to: string; format: "pdf" | "csv" }) =>
      saveFile(await api.getFile(`/reports/${name}/export?${new URLSearchParams({ from, to, format })}`), `${name}-report-${from}-to-${to}.${format}`),
  });
}
