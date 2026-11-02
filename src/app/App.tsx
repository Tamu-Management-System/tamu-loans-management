import { lazy, Suspense, type ReactNode } from "react";
import { MutationCache, QueryCache, QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { ApiError } from "../api/client";
import { BrowserRouter, Route, Routes, useLocation } from "react-router";
import { RequireSignIn, SessionProvider } from "../auth/AuthContext";
import { IdleSessionGuard } from "../auth/IdleSessionGuard";
import { RequirePermission } from "../auth/RequirePermission";
import { endSession } from "../auth/session";
import { AppShell } from "../components/layout/AppShell";
import { ToastProvider } from "../components/ui/Toast";
import { ApplicationReviewPage } from "../modules/applications/ApplicationReviewPage";
import { ContinueApplicationPage } from "../modules/applications/ContinueApplicationPage";
import { ApplicationsPage } from "../modules/applications/ApplicationsPage";
import { NewApplicationPage } from "../modules/applications/NewApplicationPage";
import { LoanDetailsPage } from "../modules/loans/LoanDetailsPage";
import { PaymentsPage } from "../modules/payments/PaymentsPage";
import { SettingsPage } from "../modules/settings/SettingsPage";
import { AuditLogPage } from "../modules/audit/AuditLogPage";
import { ReportsPage } from "../modules/reports/ReportsPage";
import { AccountSettingsPage } from "../modules/account/AccountSettingsPage";
import { HelpPage } from "../modules/account/HelpPage";
import { ProfilePage } from "../modules/account/ProfilePage";
import { LoansPage } from "../modules/loans/LoansPage";
import { BorrowerProfilePage } from "../modules/borrowers/BorrowerProfilePage";
import { BorrowersPage } from "../modules/borrowers/BorrowersPage";
import { DashboardPage } from "../pages/DashboardPage";
import { LoginPage } from "../pages/LoginPage";
import { MorePage } from "../pages/MorePage";
import { NotFoundPage, PlaceholderPage } from "../pages/PlaceholderPage";
import { ROUTABLE_NAV_ITEMS } from "./navigation";
import { FeatureFlagsProvider } from "./featureFlags";

/** A 401 on any request means the server ended the session: wipe the cache and go to the login page. */
function handleSessionExpiry(error: unknown, queryKey?: readonly unknown[]) {
  if (error instanceof ApiError && error.status === 401 && queryKey?.[0] !== "me") {
    endSession(queryClient, "expired");
  }
}

const queryClient: QueryClient = new QueryClient({
  defaultOptions: {
    queries: {
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

// The borrowers' online application form: its own bundle, outside the staff app (no sign-in, no menus)
const OnlineApplicationPage = lazy(() => import("../modules/online-application/OnlineApplicationPage").then((module) => ({ default: module.OnlineApplicationPage })));

// TEMPORARY demo controls; not part of production builds (__MOCK_API_ENABLED__ in vite.config.ts)
const DemoControls = __MOCK_API_ENABLED__ ? lazy(() => import("../demo/DemoControls").then((module) => ({ default: module.DemoControls }))) : null;

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
};

/** Everything a signed-in user sees: the app shell, the inactivity timeout and (in demos) the demo controls. */
function SignedInApp() {
  return (
    <RequireSignIn>
      <AppShell />
      <IdleSessionGuard />
      {DemoControls && (
        <Suspense fallback={null}>
          <DemoControls />
        </Suspense>
      )}
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
                  <RequirePermission requires={item.requires}>
                    {BUILT_PAGES[item.to!] ?? <PlaceholderPage title={item.label} upcoming={item.release === "phase-2"} />}
                  </RequirePermission>
                }
              />
            ))}
            <Route
              path="borrowers/:borrowerId"
              element={
                <RequirePermission requires="borrowers.view">
                  <BorrowerProfilePage />
                </RequirePermission>
              }
            />
            <Route
              path="applications/new"
              element={
                <RequirePermission requires="applications.create">
                  <NewApplicationRoute />
                </RequirePermission>
              }
            />
            <Route
              path="loans/:loanId"
              element={
                <RequirePermission requires="loans.view">
                  <LoanDetailsPage />
                </RequirePermission>
              }
            />
            <Route
            path="applications/:applicationId/edit"
            element={
              <RequirePermission requires="applications.create">
                <ContinueApplicationPage />
              </RequirePermission>
            }
          />
          <Route
              path="applications/:applicationId"
              element={
                <RequirePermission requires="applications.view">
                  <ApplicationReviewPage />
                </RequirePermission>
              }
            />
            <Route path="account/profile" element={<ProfilePage />} />
            <Route path="account/settings" element={<AccountSettingsPage />} />
            <Route path="help" element={<HelpPage />} />
            <Route path="more" element={<MorePage />} />
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
      <FeatureFlagsProvider>
        <BrowserRouter>
          <Routes>
            {/* Opened by borrowers from the link their loan officer sends; the token in the link is the only access */}
            <Route
              path="forms/:token"
              element={
                <Suspense fallback={null}>
                  <OnlineApplicationPage />
                </Suspense>
              }
            />
            <Route path="*" element={<StaffApp />} />
          </Routes>
        </BrowserRouter>
      </FeatureFlagsProvider>
    </QueryClientProvider>
  );
}
