// Data hooks for the online loan application form (public: clients have no account; the
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
  /** Each guarantor's National ID, front and back */
  guarantorIds: [{ front: Blob; back: Blob }, { front: Blob; back: Blob }];
}

export function useSubmitOnlineApplication(token: string) {
  return useMutation({
    mutationFn: ({ details, idFront, idBack, guarantorIds }: OnlineApplicationUpload) => {
      const form = new FormData();
      form.append("details", JSON.stringify(details));
      form.append("idFront", idFront, "id-front.jpg");
      form.append("idBack", idBack, "id-back.jpg");
      guarantorIds.forEach((ids, index) => {
        form.append(`guarantor${index + 1}IdFront`, ids.front, `guarantor-${index + 1}-id-front.jpg`);
        form.append(`guarantor${index + 1}IdBack`, ids.back, `guarantor-${index + 1}-id-back.jpg`);
      });
      return api.upload<{ reference: string }>(`/public/forms/${encodeURIComponent(token)}`, form);
    },
  });
}
