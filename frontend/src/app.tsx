import { lazy, Suspense } from "react";
import { BrowserRouter, Routes, Route, Navigate } from "react-router-dom";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { Layout } from "@/components/layout";
import { ProtectedRoute, AdminRoute } from "@/components/protected-route";

// Eager imports: login, dashboard, dialer, meetings (frequently used)
import { LoginPage } from "@/pages/login";
import { ForgotPasswordPage } from "@/pages/forgot-password";
import { ResetPasswordPage } from "@/pages/reset-password";
import { DashboardPage } from "@/pages/dashboard";
import { DialerPage } from "@/pages/dialer";
import { LeadDetailPage } from "@/pages/lead-detail";
import { MeetingsPage } from "@/pages/meetings";
import { MeetingDetailPage } from "@/pages/meeting-detail";

// Lazy imports: admin pages, history, profile
const HistoryPage = lazy(() => import("@/pages/history").then((m) => ({ default: m.HistoryPage })));
const AdminUsersPage = lazy(() => import("@/pages/admin-users").then((m) => ({ default: m.AdminUsersPage })));
const AdminImportPage = lazy(() => import("@/pages/admin-import").then((m) => ({ default: m.AdminImportPage })));
const AdminStatsPage = lazy(() => import("@/pages/admin-stats").then((m) => ({ default: m.AdminStatsPage })));
const AdminListsPage = lazy(() => import("@/pages/admin-lists").then((m) => ({ default: m.AdminListsPage })));
const AdminRequestsPage = lazy(() => import("@/pages/admin-requests").then((m) => ({ default: m.AdminRequestsPage })));
const ProfilePage = lazy(() => import("@/pages/profile").then((m) => ({ default: m.ProfilePage })));

const queryClient = new QueryClient({
  defaultOptions: { queries: { staleTime: 30_000, retry: 1 } },
});

function LazyFallback() {
  return (
    <div className="flex items-center justify-center min-h-[40vh]">
      <p className="text-[var(--color-text-secondary)]">Laddar...</p>
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
          <Route element={<ProtectedRoute />}>
            <Route element={<Layout />}>
              <Route path="/dashboard" element={<DashboardPage />} />
              <Route path="/dialer" element={<DialerPage />} />
              <Route path="/leads/:id" element={<LeadDetailPage />} />
              <Route path="/meetings" element={<MeetingsPage />} />
              <Route path="/meetings/:id" element={<MeetingDetailPage />} />
              <Route path="/history" element={<Suspense fallback={<LazyFallback />}><HistoryPage /></Suspense>} />
              <Route path="/profile" element={<Suspense fallback={<LazyFallback />}><ProfilePage /></Suspense>} />
              <Route element={<AdminRoute />}>
                <Route path="/admin/users" element={<Suspense fallback={<LazyFallback />}><AdminUsersPage /></Suspense>} />
                <Route path="/admin/import" element={<Suspense fallback={<LazyFallback />}><AdminImportPage /></Suspense>} />
                <Route path="/admin/lists" element={<Suspense fallback={<LazyFallback />}><AdminListsPage /></Suspense>} />
                <Route path="/admin/stats" element={<Suspense fallback={<LazyFallback />}><AdminStatsPage /></Suspense>} />
                <Route path="/admin/requests" element={<Suspense fallback={<LazyFallback />}><AdminRequestsPage /></Suspense>} />
              </Route>
            </Route>
          </Route>
          <Route path="*" element={<Navigate to="/dashboard" replace />} />
        </Routes>
      </BrowserRouter>
    </QueryClientProvider>
  );
}
