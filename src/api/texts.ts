// Data hooks for texts to clients (Arrears & SMS).
import { keepPreviousData, useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { api } from "./client";
import type { SendTextRequest, SentText, SentTextList } from "./types";

export const TEXTS_PAGE_SIZE = 25;

/** The texts staff sent to clients (own clients, or the whole market). */
export function useSentTexts(page: number, enabled = true) {
  return useQuery({
    queryKey: ["texts", "history", page],
    queryFn: () => api.get<SentTextList>(`/sms/history?page=${page}&pageSize=${TEXTS_PAGE_SIZE}`),
    placeholderData: keepPreviousData,
    enabled,
  });
}

/** Sends a text to the client on a loan. */
export function useSendText(loanId: string) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (body: SendTextRequest) => api.post<SentText>(`/loans/${encodeURIComponent(loanId)}/sms`, body),
    onSuccess: () => Promise.all([["texts"], ["borrowers"], ["audit"]].map((queryKey) => queryClient.invalidateQueries({ queryKey }))),
  });
}
