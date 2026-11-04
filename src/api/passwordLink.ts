import { useMutation, useQuery } from "@tanstack/react-query";
import { api } from "./client";
import type { PasswordLinkInfo, SetPasswordRequest } from "./types";

const linkPath = (token: string) => `/public/invites/${encodeURIComponent(token)}`;

/** The invite or reset link behind a token. Public: no sign-in. A used, expired or unknown link is an ApiError (404 or 410, with a `reason`). */
export function usePasswordLink(token: string) {
  return useQuery({
    queryKey: ["password-link", token],
    queryFn: () => api.get<PasswordLinkInfo>(linkPath(token)),
    retry: false,
    // The link is secret and used once: never keep it around or refetch it behind the person's back
    staleTime: Infinity,
    gcTime: 0,
  });
}

/** Sets the password and ends the link. The password is only ever sent in this request body, never in a URL. */
export function useSetPassword(token: string) {
  return useMutation({ mutationFn: (request: SetPasswordRequest) => api.post<void>(linkPath(token), request) });
}
