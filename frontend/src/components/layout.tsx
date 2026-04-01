import { Outlet } from "react-router-dom";
import { Sidebar } from "@/components/sidebar";
import { Topbar } from "@/components/topbar";

export function Layout() {
  return (
    <div className="min-h-screen bg-[var(--color-bg-panel)]">
      <Sidebar />
      <Topbar />
      <main
        style={{
          marginLeft: "240px",
          paddingTop: "56px",
        }}
      >
        <div
          style={{
            maxWidth: "1280px",
            margin: "0 auto",
            padding: "24px",
          }}
        >
          <Outlet />
        </div>
      </main>
    </div>
  );
}
