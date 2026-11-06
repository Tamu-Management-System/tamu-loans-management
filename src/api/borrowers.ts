// Data hooks for the Clients module.
import { keepPreviousData, useInfiniteQuery, useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { saveFile } from "../lib/saveFile";
import { api } from "./client";
import type { BorrowerActivityCategory, BorrowerActivityPage, BorrowerDetailsUpdate, BorrowerDocuments, BorrowerList, BorrowerLoanHistory, DocumentFile, OnlineFormLink, BorrowerProfile, BorrowerSort, BorrowerStatus, NationalIdReveal, OfficerOption } from "./types";

export interface BorrowerListParams {
  query: string;
  status: BorrowerStatus | null;
  officerId: string | null;
  sort: BorrowerSort;
  order: "asc" | "desc";
  page: number;
}

export const BORROWERS_PAGE_SIZE = 25;

export function useBorrowerList(params: BorrowerListParams, { enabled = true }: { enabled?: boolean } = {}) {
  const search = new URLSearchParams({ sort: params.sort, order: params.order, page: String(params.page), pageSize: String(BORROWERS_PAGE_SIZE) });
  if (params.query) search.set("q", params.query);
  if (params.status) search.set("status", params.status);
  if (params.officerId) search.set("officerId", params.officerId);
  return useQuery({
    queryKey: ["clients", "list", params],
    queryFn: () => api.get<BorrowerList>(`/borrowers?${search}`),
    enabled,
    // Keep showing the current page while the next one loads, so the table doesn't jump
    placeholderData: keepPreviousData,
  });
}

export function useOfficers(enabled: boolean) {
  return useQuery({
    queryKey: ["officers"],
    queryFn: () => api.get<OfficerOption[]>("/officers"),
    enabled,
    staleTime: 5 * 60_000,
  });
}

export function useBorrowerProfile(borrowerId: string) {
  return useQuery({
    queryKey: ["clients", "profile", borrowerId],
    queryFn: () => api.get<BorrowerProfile>(`/borrowers/${encodeURIComponent(borrowerId)}`),
    enabled: !!borrowerId,
  });
}

/**
 * Fetches the full National ID number (the server logs every request). The number is never
 * put in the query cache, and the mutation result is dropped as soon as it's unused (gcTime 0).
 */
export function useRevealNationalId(borrowerId: string) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: () => api.post<NationalIdReveal>(`/borrowers/${encodeURIComponent(borrowerId)}/national-id`),
    gcTime: 0,
    // The reveal is now in the audit log
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ["activity"] }),
  });
}

export function useBorrowerLoans(borrowerId: string) {
  return useQuery({
    queryKey: ["clients", "loans", borrowerId],
    queryFn: () => api.get<BorrowerLoanHistory>(`/borrowers/${encodeURIComponent(borrowerId)}/loans`),
  });
}

/** Downloads a loan's signed loan application PDF (the server logs each download: it contains National IDs). */
export function useDownloadAgreement() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async (loanId: string) => {
      const file = await api.getFile(`/loans/${encodeURIComponent(loanId)}/application-pdf`);
      saveFile(file, `Loan application ${loanId}.pdf`);
    },
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ["activity"] }),
  });
}

export function useBorrowerDocuments(borrowerId: string) {
  return useQuery({
    queryKey: ["clients", "documents", borrowerId],
    queryFn: () => api.get<BorrowerDocuments>(`/borrowers/${encodeURIComponent(borrowerId)}/documents`),
  });
}

/**
 * A document's file, for the in-app preview. Each fetch is a logged view, so it's fetched once
 * per opening and dropped from memory when the preview closes (gcTime 0).
 */
export function useDocumentPreview(documentId: string) {
  const queryClient = useQueryClient();
  return useQuery({
    queryKey: ["document-preview", documentId],
    queryFn: async () => {
      const file = await api.getFile(`/documents/${encodeURIComponent(documentId)}/file?disposition=inline`);
      void queryClient.invalidateQueries({ queryKey: ["activity"] }); // the view is now in the audit log
      return file;
    },
    gcTime: 0,
    staleTime: Infinity,
    retry: false,
  });
}

/** Saves a document to the device (logged as a download, separately from viewing it). */
export function useDownloadDocument() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async (document: DocumentFile) => {
      const file = await api.getFile(`/documents/${encodeURIComponent(document.id)}/file?disposition=attachment`);
      saveFile(file, document.fileName);
    },
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ["activity"] }),
  });
}

/** Uploads a missing document or replaces one (the server keeps the old version). */
export function useUploadDocument(borrowerId: string) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: ({ slotKey, file }: { slotKey: string; file: File }) => {
      const form = new FormData();
      form.append("slot", slotKey);
      form.append("file", file);
      return api.upload<DocumentFile>(`/borrowers/${encodeURIComponent(borrowerId)}/documents`, form);
    },
    onSuccess: () =>
      Promise.all([
        queryClient.invalidateQueries({ queryKey: ["borrowers", "documents", borrowerId] }),
        queryClient.invalidateQueries({ queryKey: ["activity"] }),
      ]),
  });
}

/** Everything about one client (profile, list rows, timeline) plus the audit preview. */
function useRefreshBorrower() {
  const queryClient = useQueryClient();
  return () =>
    Promise.all([queryClient.invalidateQueries({ queryKey: ["borrowers"] }), queryClient.invalidateQueries({ queryKey: ["activity"] }), queryClient.invalidateQueries({ queryKey: ["loans"] })]);
}

/** Saves contact, next of kin and work details. A new main phone becomes a pending change. */
export function useUpdateBorrower(borrowerId: string) {
  const refresh = useRefreshBorrower();
  return useMutation({
    mutationFn: (update: BorrowerDetailsUpdate) => api.patch<void>(`/borrowers/${encodeURIComponent(borrowerId)}`, update),
    onSuccess: refresh,
  });
}

/** Approve or reject (or, for the person who asked, withdraw) a new mobile money number. */
export function usePhoneChangeDecision(borrowerId: string) {
  const refresh = useRefreshBorrower();
  return useMutation({
    mutationFn: ({ changeId, decision }: { changeId: string; decision: "approve" | "reject" }) =>
      api.post<void>(`/borrowers/${encodeURIComponent(borrowerId)}/phone-change/${encodeURIComponent(changeId)}`, { decision }),
    onSuccess: refresh,
  });
}

/** The client's timeline, newest first; fetchNextPage loads older events. */
export function useBorrowerActivity(borrowerId: string, category: BorrowerActivityCategory | null) {
  return useInfiniteQuery({
    queryKey: ["clients", "activity", borrowerId, category],
    queryFn: ({ pageParam }) => {
      const search = new URLSearchParams();
      if (category) search.set("category", category);
      if (pageParam) search.set("before", pageParam);
      return api.get<BorrowerActivityPage>(`/borrowers/${encodeURIComponent(borrowerId)}/activity?${search}`);
    },
    initialPageParam: null as string | null,
    getNextPageParam: (lastPage) => lastPage.nextBefore,
  });
}

/**
 * Creates a one-time link for the client or a guarantor to complete a form online. The officer
 * copies it into WhatsApp; any earlier link for the same form stops working.
 */
export function useCreateOnlineLink(borrowerId: string) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (slotKey: string) => api.post<OnlineFormLink>(`/borrowers/${encodeURIComponent(borrowerId)}/online-links`, { slot: slotKey }),
    onSuccess: () =>
      Promise.all([
        queryClient.invalidateQueries({ queryKey: ["borrowers", "documents", borrowerId] }),
        queryClient.invalidateQueries({ queryKey: ["borrowers", "activity", borrowerId] }),
        queryClient.invalidateQueries({ queryKey: ["activity"] }),
      ]),
  });
}
