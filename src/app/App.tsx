import { lazy, Suspense, type ComponentType, type ReactNode } from "react";
import { MutationCache, QueryCache, QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { ApiError } from "../api/client";
import { BrowserRouter, Route, Routes, useLocation } from "react-router";
import { RequireSignIn, SessionProvider } from "../auth/AuthContext";
import { IdleSessionGuard } from "../auth/IdleSessionGuard";
import { RequirePermission } from "../auth/RequirePermission";
import { endSession } from "../auth/session";
import { AppShell } from "../components/layout/AppShell";
import { ToastProvider } from "../components/ui/Toast";
import { DashboardPage } from "../pages/DashboardPage";
import { LoginPage } from "../pages/LoginPage";
import { NotFoundPage, PlaceholderPage } from "../pages/PlaceholderPage";
import { ROUTABLE_NAV_ITEMS } from "./navigation";

/** A 401 on any request means the server ended the session: wipe the cache and go to the login page. */
function handleSessionExpiry(error: unknown, queryKey?: readonly unknown[]) {
  if (error instanceof ApiError && error.status === 401 && queryKey?.[0] !== "me") {
    endSession(queryClient, "expired");
  }
}

// How long fetched data counts as fresh. Opening a page again inside this time shows what is already there instead of asking the
// server again (the big pages are slow to build). Every change (record a payment, approve, ...) refreshes what it affects at once,
// and the dashboard, bell and menu badges still refresh on their own timers. This is screen tuning, not a business rule.
const DATA_FRESH_MS = 30_000;

const queryClient: QueryClient = new QueryClient({
  defaultOptions: {
    queries: {
      staleTime: DATA_FRESH_MS,
      retry: (failureCount, error) => !(error instanceof ApiError && error.status === 401) && failureCount < 1,
      refetchOnWindowFocus: false,
    },
  },
  queryCache: new QueryCache({ onError: (error, query) => handleSessionExpiry(error, query.queryKey) }),
  mutationCache: new MutationCache({
    // Wrong password on the login screen is also a 401, but that isn't an expired session
    onError: (error, _variables, _context, mutation) => {
      if (mutation.options.mutationKey?.[0] !== "sign-in") handleSessionExpiry(error);
    },
  }),
});

import { SetPasswordPage } from "../modules/set-password/SetPasswordPage";

// The clients' online application form: its own bundle, outside the staff app (no sign-in, no menus)
import { FormSkeletonPage } from "../modules/online-application/FormSkeleton";

// Each screen is its own file that loads when it is first opened, so signing in does not download every screen
const screen = <Name extends string, Props extends object>(load: () => Promise<Record<Name, ComponentType<Props>>>, name: Name) =>
  lazy(() => load().then((module) => ({ default: module[name] })));

const ApplicationReviewPage = screen(() => import("../modules/applications/ApplicationReviewPage"), "ApplicationReviewPage");
const ContinueApplicationPage = screen(() => import("../modules/applications/ContinueApplicationPage"), "ContinueApplicationPage");
const ApplicationsPage = screen(() => import("../modules/applications/ApplicationsPage"), "ApplicationsPage");
const NewApplicationPage = screen(() => import("../modules/applications/NewApplicationPage"), "NewApplicationPage");
const LoanDetailsPage = screen(() => import("../modules/loans/LoanDetailsPage"), "LoanDetailsPage");
const PaymentsPage = screen(() => import("../modules/payments/PaymentsPage"), "PaymentsPage");
const SettingsPage = screen(() => import("../modules/settings/SettingsPage"), "SettingsPage");
const AuditLogPage = screen(() => import("../modules/audit/AuditLogPage"), "AuditLogPage");
const AccountingPage = screen(() => import("../modules/accounting/AccountingPage"), "AccountingPage");
const ArrearsPage = screen(() => import("../modules/arrears/ArrearsPage"), "ArrearsPage");
const ReportsPage = screen(() => import("../modules/reports/ReportsPage"), "ReportsPage");
const AccountSettingsPage = screen(() => import("../modules/account/AccountSettingsPage"), "AccountSettingsPage");
const HelpPage = screen(() => import("../modules/account/HelpPage"), "HelpPage");
const NotificationsPage = screen(() => import("../modules/account/NotificationsPage"), "NotificationsPage");
const ProfilePage = screen(() => import("../modules/account/ProfilePage"), "ProfilePage");
const LoansPage = screen(() => import("../modules/loans/LoansPage"), "LoansPage");
const BorrowerProfilePage = screen(() => import("../modules/borrowers/BorrowerProfilePage"), "BorrowerProfilePage");
const BorrowersPage = screen(() => import("../modules/borrowers/BorrowersPage"), "BorrowersPage");

const OnlineApplicationPage = lazy(() => import("../modules/online-application/OnlineApplicationPage").then((module) => ({ default: module.OnlineApplicationPage })));

/** Menu pages that have been built; the others show a placeholder. */
const BUILT_PAGES: Record<string, ReactNode> = {
  "/borrowers": <BorrowersPage />,
  "/applications": <ApplicationsPage />,
  "/payments": <PaymentsPage />,
  "/loans/to-disburse": <LoansPage tab="to-disburse" />,
  "/loans/active": <LoansPage tab="active" />,
  "/loans/recovery": <LoansPage tab="recovery" />,
  "/loans/cleared": <LoansPage tab="cleared" />,
  "/loans/all": <LoansPage tab="all" />,
  "/settings": <SettingsPage />,
  "/audit-log": <AuditLogPage />,
  "/reports": <ReportsPage />,
  "/arrears": <ArrearsPage />,
  "/accounting": <AccountingPage />,
};

/** Everything a signed-in user sees: the app shell and the inactivity timeout. */
function SignedInApp() {
  return (
    <RequireSignIn>
      <AppShell />
      <IdleSessionGuard />
    </RequireSignIn>
  );
}

/** A fresh form each time it's opened (including "Start another application"). */
function NewApplicationRoute() {
  const location = useLocation();
  return <NewApplicationPage key={location.key} />;
}

/** Everything staff use: sign-in and the signed-in screens. */
function StaffApp() {
  return (
    <SessionProvider>
      <ToastProvider>
        <Routes>
          <Route path="login" element={<LoginPage />} />
          <Route element={<SignedInApp />}>
            <Route index element={<DashboardPage />} />
            {/* Menu pages: built ones from BUILT_PAGES, the rest are placeholders until their module is built */}
            {ROUTABLE_NAV_ITEMS.filter((item) => item.to !== "/").map((item) => (
              <Route
                key={item.to}
                path={item.subpages ? `${item.to}/*` : item.to}
                element={
                  <RequirePermission requires={item.requires} screen={item.label}>
                    {BUILT_PAGES[item.to!] ?? <PlaceholderPage title={item.label} />}
                  </RequirePermission>
                }
              />
            ))}
            <Route
              path="borrowers/:borrowerId"
              element={
                <RequirePermission requires="borrowers.view" screen="Client profile">
                  <BorrowerProfilePage />
                </RequirePermission>
              }
            />
            <Route
              path="applications/new"
              element={
                <RequirePermission requires="applications.create" screen="New application">
                  <NewApplicationRoute />
                </RequirePermission>
              }
            />
            <Route
              path="loans/:loanId"
              element={
                <RequirePermission requires="loans.view" screen="Loan">
                  <LoanDetailsPage />
                </RequirePermission>
              }
            />
            <Route
            path="applications/:applicationId/edit"
            element={
              <RequirePermission requires="applications.create" screen="Continue application">
                <ContinueApplicationPage />
              </RequirePermission>
            }
          />
          <Route
              path="applications/:applicationId"
              element={
                <RequirePermission requires="applications.view" screen="Application">
                  <ApplicationReviewPage />
                </RequirePermission>
              }
            />
            <Route path="notifications" element={<NotificationsPage />} />
            <Route path="account/profile" element={<ProfilePage />} />
            <Route path="account/settings" element={<AccountSettingsPage />} />
            <Route path="help" element={<HelpPage />} />
            <Route path="*" element={<NotFoundPage />} />
          </Route>
        
        </Routes>
      </ToastProvider>
    </SessionProvider>
  );
}

export function App() {
  return (
    <QueryClientProvider client={queryClient}>
      <BrowserRouter>
        <Routes>
          {/* Opened by borrowers from the link their loan officer sends; the token in the link is the only access */}
          <Route
            path="forms/:token"
            element={
              <Suspense fallback={<FormSkeletonPage />}>
                <OnlineApplicationPage />
              </Suspense>
            }
          />
          {/* Opened from an emailed invite or reset link, before the person has a password to sign in with */}
          <Route path="set-password/:token" element={<SetPasswordPage />} />
          <Route path="*" element={<StaffApp />} />
        </Routes>
      </BrowserRouter>
    </QueryClientProvider>
  );
}
