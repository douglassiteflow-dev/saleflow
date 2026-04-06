import { lazy, Suspense } from "react";
import { BrowserRouter, Routes, Route, Navigate } from "react-router-dom";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { Layout } from "@/components/layout";
import { ProtectedRoute, AdminRoute, AdminOnlyRoute } from "@/components/protected-route";
import Loader from "@/components/kokonutui/loader";

// Eager imports: login, dashboard, dialer, meetings (frequently used)
import { LoginPage } from "@/pages/login";
import { ForgotPasswordPage } from "@/pages/forgot-password";
import { ResetPasswordPage } from "@/pages/reset-password";
import { DashboardPage } from "@/pages/dashboard";
import { DialerPage } from "@/pages/dialer";
import { LeadDetailPage } from "@/pages/lead-detail";
import { MeetingsPage } from "@/pages/meetings";
import { MeetingDetailPage } from "@/pages/meeting-detail";

// Eager import: history (now a simpler page)
import { HistoryPage } from "@/pages/history";

import { AppPlaceholderPage } from "@/pages/app-placeholder";
import { DownloadAppPage } from "@/pages/download-app";
import { AppTelavoxPage } from "@/pages/app-telavox";
import { AppTeamsPage } from "@/pages/app-teams";

// Lazy imports: admin pages, profile
const AdminLogsPage = lazy(() => import("@/pages/admin-logs").then((m) => ({ default: m.AdminLogsPage })));
const AdminUsersPage = lazy(() => import("@/pages/admin-users").then((m) => ({ default: m.AdminUsersPage })));
const AdminImportPage = lazy(() => import("@/pages/admin-import").then((m) => ({ default: m.AdminImportPage })));
const AdminStatsPage = lazy(() => import("@/pages/admin-stats").then((m) => ({ default: m.AdminStatsPage })));
const AdminListsPage = lazy(() => import("@/pages/admin-lists").then((m) => ({ default: m.AdminListsPage })));
const AdminRequestsPage = lazy(() => import("@/pages/admin-requests").then((m) => ({ default: m.AdminRequestsPage })));
const ProfilePage = lazy(() => import("@/pages/profile").then((m) => ({ default: m.ProfilePage })));
const AdminAppsPage = lazy(() => import("@/pages/admin-apps").then((m) => ({ default: m.AdminAppsPage })));
const AdminAppDetailPage = lazy(() => import("@/pages/admin-app-detail").then((m) => ({ default: m.AdminAppDetailPage })));
const PipelinePage = lazy(() => import("@/pages/pipeline").then((m) => ({ default: m.PipelinePage })));
const PipelineDetailPage = lazy(() => import("@/pages/pipeline-detail").then((m) => ({ default: m.PipelineDetailPage })));
const CustomersPage = lazy(() => import("@/pages/customers").then((m) => ({ default: m.CustomersPage })));
const CustomerDetailPage = lazy(() => import("@/pages/customer-detail").then((m) => ({ default: m.CustomerDetailPage })));

const queryClient = new QueryClient({
  defaultOptions: { queries: { staleTime: 30_000, retry: 1 } },
});

function LazyFallback() {
  return (
    <div className="flex items-center justify-center min-h-[60vh]">
      <Loader size="sm" title="Laddar sida..." />
    </div>
  );
}

export function App() {
  return (
    <QueryClientProvider client={queryClient}>
      <BrowserRouter>
        <Routes>
          <Route path="/login" element={<LoginPage />} />
          <Route path="/forgot-password" element={<ForgotPasswordPage />} />
          <Route path="/reset-password" element={<ResetPasswordPage />} />
          <Route path="/download-app" element={<DownloadAppPage />} />
          {/* Desktop app route — dialer without sidebar/topbar (agents + admins) */}
          <Route element={<ProtectedRoute />}>
            <Route path="/app" element={<DialerPage />} />
          </Route>
          {/* Web app — admin only (agents get redirected to /download-app) */}
          <Route element={<AdminOnlyRoute />}>
            <Route element={<Layout />}>
              <Route path="/dashboard" element={<DashboardPage />} />
              <Route path="/dialer" element={<DialerPage />} />
              <Route path="/leads/:id" element={<LeadDetailPage />} />
              <Route path="/meetings" element={<MeetingsPage />} />
              <Route path="/meetings/:id" element={<MeetingDetailPage />} />
              <Route path="/history" element={<HistoryPage />} />
              <Route path="/apps/telavox" element={<AppTelavoxPage />} />
              <Route path="/apps/microsoft-teams" element={<AppTeamsPage />} />
              <Route path="/apps/:slug/*" element={<AppPlaceholderPage />} />
              <Route path="/profile" element={<Suspense fallback={<LazyFallback />}><ProfilePage /></Suspense>} />
              <Route path="/admin/users" element={<Suspense fallback={<LazyFallback />}><AdminUsersPage /></Suspense>} />
              <Route path="/admin/import" element={<Suspense fallback={<LazyFallback />}><AdminImportPage /></Suspense>} />
              <Route path="/admin/lists" element={<Suspense fallback={<LazyFallback />}><AdminListsPage /></Suspense>} />
              <Route path="/admin/stats" element={<Suspense fallback={<LazyFallback />}><AdminStatsPage /></Suspense>} />
              <Route path="/admin/requests" element={<Suspense fallback={<LazyFallback />}><AdminRequestsPage /></Suspense>} />
              <Route path="/admin/logs" element={<Suspense fallback={<LazyFallback />}><AdminLogsPage /></Suspense>} />
              <Route path="/admin/apps" element={<Suspense fallback={<LazyFallback />}><AdminAppsPage /></Suspense>} />
              <Route path="/admin/apps/:slug" element={<Suspense fallback={<LazyFallback />}><AdminAppDetailPage /></Suspense>} />
              <Route path="/pipeline" element={<Suspense fallback={<LazyFallback />}><PipelinePage /></Suspense>} />
              <Route path="/pipeline/:id" element={<Suspense fallback={<LazyFallback />}><PipelineDetailPage /></Suspense>} />
              <Route path="/customers" element={<Suspense fallback={<LazyFallback />}><CustomersPage /></Suspense>} />
              <Route path="/customers/:id" element={<Suspense fallback={<LazyFallback />}><CustomerDetailPage /></Suspense>} />
            </Route>
          </Route>
          <Route path="*" element={<Navigate to={(window as any).saleflowDesktop ? "/app" : "/login"} replace />} />
        </Routes>
      </BrowserRouter>
    </QueryClientProvider>
  );
}
