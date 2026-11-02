// Sign-in and sign-out. The backend keeps the session in an HTTP-only cookie.
import { useState } from "react";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { announceSession, clearSessionEndReason, endSession, type SessionEndReason } from "../auth/session";
import { api } from "./client";

export interface SignInRequest {
  email: string;
  password: string;
}

export function useSignIn() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationKey: ["sign-in"],
    mutationFn: (credentials: SignInRequest) => api.post<void>("/auth/login", credentials),
    onSuccess: async () => {
      clearSessionEndReason();
      // Load the signed-in user; the login page then opens the page they asked for
      await queryClient.invalidateQueries({ queryKey: ["me"] });
      announceSession("signed-in");
    },
  });
}

/**
 * Signs out: ends the session on the server, wipes everything cached in this tab and signs
 * out the app's other tabs. The page guard then opens the login page. A deliberate sign-out
 * doesn't remember the page, so the next person starts on the dashboard; an idle sign-out does.
 */
export function useSignOut() {
  const queryClient = useQueryClient();
  const [isSigningOut, setIsSigningOut] = useState(false);

  const signOut = async (reason: SessionEndReason | null = null) => {
    setIsSigningOut(true);
    try {
      await api.post<void>("/auth/logout");
    } catch {
      // Even if the server can't be reached, never leave data on screen
    }
    endSession(queryClient, reason, { returnToPage: reason === "idle" });
    announceSession("signed-out");
  };

  return { signOut, isSigningOut };
}
