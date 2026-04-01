import { Link } from "react-router-dom";
import { useMe, useLogout } from "@/api/auth";
import { Button } from "@/components/ui/button";

export function Topbar() {
  const { data: user } = useMe();
  const logout = useLogout();

  function handleLogout() {
    logout.mutate();
  }

  return (
    <header
      style={{ height: "56px", marginLeft: "240px" }}
      className="fixed top-0 right-0 left-0 bg-white border-b border-[var(--color-border)] flex items-center justify-between px-6 z-10"
    >
      <div />
      <div className="flex items-center gap-4">
        {user && (
          <Link to="/profile" className="text-sm text-[var(--color-text-secondary)] hover:text-[var(--color-text-primary)] transition-colors duration-150">
            {user.name}
          </Link>
        )}
        <Button
          variant="secondary"
          size="default"
          onClick={handleLogout}
          disabled={logout.isPending}
        >
          Logga ut
        </Button>
      </div>
    </header>
  );
}
