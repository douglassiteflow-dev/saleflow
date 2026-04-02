import { Navigate, Outlet } from "react-router-dom";
import { useMe } from "@/api/auth";
import Loader from "@/components/kokonutui/loader";

export function ProtectedRoute() {
  const { data: user, isLoading } = useMe();
  if (isLoading)
    return (
      <div className="flex items-center justify-center min-h-screen">
        <Loader size="md" title="Laddar SaleFlow" subtitle="Verifierar din session" />
      </div>
    );
  if (!user) return <Navigate to="/login" replace />;
  return <Outlet />;
}

export function AdminRoute() {
  const { data: user, isLoading } = useMe();
  if (isLoading) return null;
  if (!user) return <Navigate to="/login" replace />;
  if (user.role !== "admin") return <Navigate to="/dashboard" replace />;
  return <Outlet />;
}
