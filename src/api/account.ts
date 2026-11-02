// Data hooks for the signed-in person's own account: profile, password, devices, and who to ask for help.
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { api } from "./client";
import type { ChangePasswordRequest, MyProfile, SignedInDevice, SupportContacts } from "./types";

export function useMyProfile() {
  return useQuery({ queryKey: ["me", "profile"], queryFn: () => api.get<MyProfile>("/me/profile") });
}

/** The profile and the top bar (name, photo) both change */
function useRefreshMe() {
  const queryClient = useQueryClient();
  return () => queryClient.invalidateQueries({ queryKey: ["me"] });
}

export function useUpdateMyPhone() {
  const refresh = useRefreshMe();
  return useMutation({ mutationFn: (phone: string) => api.patch<void>("/me/profile", { phone }), onSuccess: refresh });
}

export function useUploadMyPhoto() {
  const refresh = useRefreshMe();
  return useMutation({
    mutationFn: (photo: File) => {
      const form = new FormData();
      form.append("photo", photo);
      return api.upload<void>("/me/photo", form);
    },
    onSuccess: refresh,
  });
}

export function useRemoveMyPhoto() {
  const refresh = useRefreshMe();
  return useMutation({ mutationFn: () => api.delete<void>("/me/photo"), onSuccess: refresh });
}

export function useChangePassword() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (request: ChangePasswordRequest) => api.post<void>("/me/password", request),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ["me", "sessions"] }),
  });
}

export function useMySessions() {
  return useQuery({ queryKey: ["me", "sessions"], queryFn: () => api.get<SignedInDevice[]>("/me/sessions") });
}

export function useSignOutOtherDevices() {
  const queryClient = useQueryClient();
  return useMutation({ mutationFn: () => api.post<void>("/me/sessions/sign-out-others"), onSuccess: () => queryClient.invalidateQueries({ queryKey: ["me", "sessions"] }) });
}

export function useSupportContacts() {
  return useQuery({ queryKey: ["support"], queryFn: () => api.get<SupportContacts>("/support/contacts"), staleTime: 5 * 60_000 });
}
