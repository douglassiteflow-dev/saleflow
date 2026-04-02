import { BrowserRouter, Routes, Route, Navigate } from "react-router-dom";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { Layout } from "@/components/layout";
import { ProtectedRoute, AdminRoute } from "@/components/protected-route";
import { LoginPage } from "@/pages/login";
import { ForgotPasswordPage } from "@/pages/forgot-password";
import { ResetPasswordPage } from "@/pages/reset-password";
import { DashboardPage } from "@/pages/dashboard";
import { DialerPage } from "@/pages/dialer";
import { LeadDetailPage } from "@/pages/lead-detail";
import { MeetingsPage } from "@/pages/meetings";
import { HistoryPage } from "@/pages/history";
import { AdminUsersPage } from "@/pages/admin-users";
import { AdminImportPage } from "@/pages/admin-import";
import { AdminStatsPage } from "@/pages/admin-stats";
import { ProfilePage } from "@/pages/profile";

const queryClient = new QueryClient({
  defaultOptions: { queries: { staleTime: 30_000, retry: 1 } },
});

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
              <Route path="/history" element={<HistoryPage />} />
              <Route path="/profile" element={<ProfilePage />} />
              <Route element={<AdminRoute />}>
                <Route path="/admin/users" element={<AdminUsersPage />} />
                <Route path="/admin/import" element={<AdminImportPage />} />
                <Route path="/admin/stats" element={<AdminStatsPage />} />
              </Route>
            </Route>
          </Route>
          <Route path="*" element={<Navigate to="/dashboard" replace />} />
        </Routes>
      </BrowserRouter>
    </QueryClientProvider>
  );
}
