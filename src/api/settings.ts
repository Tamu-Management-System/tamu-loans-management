// Data hooks for Settings: staff accounts and roles.
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { api } from "./client";
import type { DeactivateStaffRequest, InviteStaffRequest, LoanProduct, RoleSummary, SaveLoanProductRequest, SaveRoleRequest, SettingsSection, StaffMember, SystemSettings } from "./types";

export function useStaff(enabled = true) {
  return useQuery({ queryKey: ["staff"], queryFn: () => api.get<StaffMember[]>("/staff"), enabled });
}

export function useRoles() {
  return useQuery({ queryKey: ["roles"], queryFn: () => api.get<RoleSummary[]>("/roles") });
}

/** Staff and roles change together (user counts, who can do what); the signed-in user's own permissions may change too. */
function useRefreshSettings() {
  const queryClient = useQueryClient();
  return () =>
    Promise.all([
      queryClient.invalidateQueries({ queryKey: ["staff"] }),
      queryClient.invalidateQueries({ queryKey: ["roles"] }),
      queryClient.invalidateQueries({ queryKey: ["officers"] }),
      queryClient.invalidateQueries({ queryKey: ["me"] }),
    ]);
}

const staffPath = (staffId: string, rest = "") => `/staff/${encodeURIComponent(staffId)}${rest}`;

export function useInviteStaff() {
  const refresh = useRefreshSettings();
  return useMutation({ mutationFn: (request: InviteStaffRequest) => api.post<StaffMember>("/staff/invites", request), onSuccess: refresh });
}

export function useResendInvite() {
  const refresh = useRefreshSettings();
  return useMutation({ mutationFn: (staffId: string) => api.post<StaffMember>(staffPath(staffId, "/invite")), onSuccess: refresh });
}

export function useCancelInvite() {
  const refresh = useRefreshSettings();
  return useMutation({ mutationFn: (staffId: string) => api.delete<void>(staffPath(staffId, "/invite")), onSuccess: refresh });
}

export function useChangeStaffRole() {
  const refresh = useRefreshSettings();
  return useMutation({ mutationFn: ({ staffId, roleId }: { staffId: string; roleId: string }) => api.put<StaffMember>(staffPath(staffId, "/role"), { roleId }), onSuccess: refresh });
}

export function useChangeStaffBranch() {
  const refresh = useRefreshSettings();
  return useMutation({ mutationFn: ({ staffId, branchId }: { staffId: string; branchId: string }) => api.put<StaffMember>(staffPath(staffId, "/branch"), { branchId }), onSuccess: refresh });
}

/** Switches an account off. Their clients may move to someone else, so every list is refreshed. */
export function useDeactivateStaff() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: ({ staffId, ...request }: DeactivateStaffRequest & { staffId: string }) => api.post<StaffMember>(staffPath(staffId, "/deactivate"), request),
    onSuccess: () => queryClient.invalidateQueries(),
  });
}

export function useReactivateStaff() {
  const refresh = useRefreshSettings();
  return useMutation({ mutationFn: (staffId: string) => api.post<StaffMember>(staffPath(staffId, "/reactivate")), onSuccess: refresh });
}

export function useSaveRole() {
  const refresh = useRefreshSettings();
  return useMutation({
    mutationFn: ({ roleId, ...request }: SaveRoleRequest & { roleId: string | null }) =>
      roleId ? api.put<RoleSummary>(`/roles/${encodeURIComponent(roleId)}`, request) : api.post<RoleSummary>("/roles", request),
    onSuccess: refresh,
  });
}

export function useDeleteRole() {
  const refresh = useRefreshSettings();
  return useMutation({ mutationFn: (roleId: string) => api.delete<void>(`/roles/${encodeURIComponent(roleId)}`), onSuccess: refresh });
}

// ---------- System settings and loan products ----------

/** Settings the whole app follows (payment methods, rules, sign-out time…). Everyone signed in reads them. */
export function useSystemSettings() {
  return useQuery({ queryKey: ["settings"], queryFn: () => api.get<SystemSettings>("/settings"), staleTime: 5 * 60_000 });
}

export function useSaveSettings<S extends SettingsSection>(section: S) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (values: SystemSettings[S]) => api.put<SystemSettings>(`/settings/${section}`, values),
    onSuccess: (saved) => {
      queryClient.setQueryData(["settings"], saved);
      // Screens that follow these settings (lists, loans, applications) pick up the change
      return queryClient.invalidateQueries({ predicate: (query) => query.queryKey[0] !== "settings" });
    },
  });
}

export function useLoanProducts() {
  return useQuery({ queryKey: ["loan-products"], queryFn: () => api.get<LoanProduct[]>("/loan-products"), staleTime: 60_000 });
}

export function useSaveLoanProduct() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: ({ productId, ...request }: SaveLoanProductRequest & { productId: string | null }) =>
      productId ? api.put<LoanProduct>(`/loan-products/${encodeURIComponent(productId)}`, request) : api.post<LoanProduct>("/loan-products", request),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ["loan-products"] }),
  });
}

export function useSetLoanProductOffered() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: ({ productId, offered }: { productId: string; offered: boolean }) => api.post<LoanProduct>(`/loan-products/${encodeURIComponent(productId)}/${offered ? "restore" : "archive"}`),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ["loan-products"] }),
  });
}
