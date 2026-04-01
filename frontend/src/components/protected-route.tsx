import { Navigate, Outlet } from "react-router-dom";
import { useMe } from "@/api/auth";

export function ProtectedRoute() {
  const { data: user, isLoading } = useMe();
  if (isLoading)
    return (
      <div className="flex items-center justify-center min-h-screen">
        <p className="text-[var(--color-text-secondary)]">Laddar...</p>
      </div>
    );
  if (!user) return <Navigate to="/login" replace />;
  return <Outlet />;
}
