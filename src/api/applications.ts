// Data hooks for loan applications.
import { keepPreviousData, useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { api } from "./client";
import type { ApplicationDetail, ApplicationDraft, ApplicationList, ApplicationStatus, ApproveApplicationRequest, NewApplicationRequest, NewApplicationResult, RejectApplicationRequest, UpdateApplicationRequest } from "./types";

export interface NewApplicationUpload {
  application: NewApplicationRequest;
  /** Paper route: the signed agreement, both consents and the ID copies, scanned into one PDF */
  signedApplication?: Blob | null;
}

/** Creates an application (paper draft, paper submitted for approval, or online with a link). */
export function useCreateApplication() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: ({ application, signedApplication }: NewApplicationUpload) => {
      const form = new FormData();
      form.append("application", JSON.stringify(application));
      if (signedApplication) form.append("signedApplication", signedApplication, "signed-application.pdf");
      return api.upload<NewApplicationResult>("/applications", form);
    },
    // New client, application counts, dashboard tasks, audit preview
    onSuccess: () =>
      Promise.all(
        [["applications"], ["borrowers"], ["navigation-badges"], ["dashboard"], ["worklist"], ["activity"], ["loans"]].map((queryKey) => queryClient.invalidateQueries({ queryKey })),
      ),
  });
}

export const APPLICATIONS_PAGE_SIZE = 25;

export interface ApplicationListParams {
  status: ApplicationStatus;
  query: string;
  page: number;
}

export function useApplicationList(params: ApplicationListParams) {
  const search = new URLSearchParams({ status: params.status, page: String(params.page), pageSize: String(APPLICATIONS_PAGE_SIZE) });
  if (params.query) search.set("q", params.query);
  return useQuery({
    queryKey: ["applications", "list", params],
    queryFn: () => api.get<ApplicationList>(`/applications?${search}`),
    placeholderData: keepPreviousData,
  });
}

export function useApplication(applicationId: string) {
  return useQuery({
    queryKey: ["applications", "detail", applicationId],
    queryFn: () => api.get<ApplicationDetail>(`/applications/${encodeURIComponent(applicationId)}`),
  });
}

/** After a decision: show it at once, then refresh lists, badges, dashboard and the client. */
function useApplicationDecision<T>(applicationId: string, action: "approve" | "reject") {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (body: T) => api.post<ApplicationDetail>(`/applications/${encodeURIComponent(applicationId)}/${action}`, body),
    onSuccess: (detail) => {
      queryClient.setQueryData(["applications", "detail", applicationId], detail);
      return Promise.all(
        [["applications", "list"], ["borrowers"], ["navigation-badges"], ["dashboard"], ["worklist"], ["notifications"], ["activity"]].map((queryKey) => queryClient.invalidateQueries({ queryKey })),
      );
    },
  });
}

export const useApproveApplication = (applicationId: string) => useApplicationDecision<ApproveApplicationRequest>(applicationId, "approve");
export const useRejectApplication = (applicationId: string) => useApplicationDecision<RejectApplicationRequest>(applicationId, "reject");

/** A paper draft for its officer to continue (includes the guarantors' full NINs; the server logs each opening). */
export function useApplicationDraft(applicationId: string) {
  return useQuery({
    queryKey: ["applications", "draft", applicationId],
    queryFn: () => api.get<ApplicationDraft>(`/applications/${encodeURIComponent(applicationId)}/draft`),
    gcTime: 0, // don't keep the full NINs in memory once the form is closed
    staleTime: 0,
  });
}

/** Saves a draft, or submits it for approval (also after it was sent back). */
export function useUpdateApplication(applicationId: string) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: ({ application, signedApplication }: { application: UpdateApplicationRequest; signedApplication?: Blob | null }) => {
      const form = new FormData();
      form.append("application", JSON.stringify(application));
      if (signedApplication) form.append("signedApplication", signedApplication, "signed-application.pdf");
      return api.patch<ApplicationDetail>(`/applications/${encodeURIComponent(applicationId)}`, form);
    },
    onSuccess: (detail) => {
      // (The draft's own data, with the full NINs, is dropped when the form closes: gcTime 0)
      queryClient.setQueryData(["applications", "detail", applicationId], detail);
      return Promise.all(
        [["applications", "list"], ["borrowers"], ["navigation-badges"], ["dashboard"], ["worklist"], ["notifications"], ["activity"]].map((queryKey) => queryClient.invalidateQueries({ queryKey })),
      );
    },
  });
}
