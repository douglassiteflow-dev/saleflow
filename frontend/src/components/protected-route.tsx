import { useEffect } from "react";
import { Navigate, Outlet } from "react-router-dom";
import { useMe, getSocketToken } from "@/api/auth";
import { connectSocket, disconnectSocket } from "@/lib/socket";
import { useDashboardSync } from "@/lib/use-dashboard-sync";
import Loader from "@/components/kokonutui/loader";

function SocketProvider({ children }: { children: React.ReactNode }) {
  const token = getSocketToken();

  useEffect(() => {
    if (token) {
      connectSocket(token);
    }
    return () => {
      disconnectSocket();
    };
  }, [token]);

  useDashboardSync();

  return <>{children}</>;
}

export function ProtectedRoute() {
  const { data: user, isLoading } = useMe();
  if (isLoading)
    return (
      <div className="flex items-center justify-center min-h-screen">
        <Loader size="md" title="Laddar Saleflow" subtitle="Verifierar din session" />
      </div>
    );
  if (!user) return <Navigate to="/login" replace />;
  return (
    <SocketProvider>
      <Outlet />
    </SocketProvider>
  );
}

export function AdminRoute() {
  const { data: user, isLoading } = useMe();
  if (isLoading) return null;
  if (!user) return <Navigate to="/login" replace />;
  if (user.role !== "admin") return <Navigate to="/download-app" replace />;
  return <Outlet />;
}

export function AdminOnlyRoute() {
  const { data: user, isLoading } = useMe();
  if (isLoading)
    return (
      <div className="flex items-center justify-center min-h-screen">
        <Loader size="md" title="Laddar Saleflow" subtitle="Verifierar din session" />
      </div>
    );
  if (!user) return <Navigate to="/login" replace />;
  if (user.role !== "admin") return <Navigate to="/download-app" replace />;
  return (
    <SocketProvider>
      <Outlet />
    </SocketProvider>
  );
}
