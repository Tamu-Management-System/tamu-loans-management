// Data hooks for the online loan application form (public: borrowers have no account; the
// link's token is the only access, and it stops working once the form is submitted).
import { useMutation, useQuery } from "@tanstack/react-query";
import { api } from "./client";
import type { OnlineApplicationDetails, OnlineApplicationForm } from "./types";

export function useOnlineApplicationForm(token: string) {
  return useQuery({
    queryKey: ["online-application", token],
    queryFn: () => api.get<OnlineApplicationForm>(`/public/forms/${encodeURIComponent(token)}`),
    retry: false,
    staleTime: Infinity,
  });
}

export interface OnlineApplicationUpload {
  details: OnlineApplicationDetails;
  idFront: Blob;
  idBack: Blob;
  signatures: { borrower: Blob; guarantor1: Blob; guarantor2: Blob };
}

export function useSubmitOnlineApplication(token: string) {
  return useMutation({
    mutationFn: ({ details, idFront, idBack, signatures }: OnlineApplicationUpload) => {
      const form = new FormData();
      form.append("details", JSON.stringify(details));
      form.append("idFront", idFront, "id-front.jpg");
      form.append("idBack", idBack, "id-back.jpg");
      form.append("borrowerSignature", signatures.borrower, "borrower-signature.jpg");
      form.append("guarantor1Signature", signatures.guarantor1, "guarantor-1-signature.jpg");
      form.append("guarantor2Signature", signatures.guarantor2, "guarantor-2-signature.jpg");
      return api.upload<{ reference: string }>(`/public/forms/${encodeURIComponent(token)}`, form);
    },
  });
}
