import { useState, useEffect } from "react";
import { RefreshCw, X } from "lucide-react";
import { APP_VERSION } from "@/version";

export function UpdateBanner() {
  const [dismissed, setDismissed] = useState(false);
  const [serverVersion, setServerVersion] = useState<string | null>(null);

  useEffect(() => {
    // Fetch the latest deployed version from the server
    // by loading version.ts as a module would be complex,
    // so we use a simple endpoint or check the HTML for the version
    const check = async () => {
      try {
        const res = await fetch("/version.json", { cache: "no-store" });
        if (res.ok) {
          const data = await res.json();
          setServerVersion(data.version);
        }
      } catch {
        // ignore — endpoint might not exist yet
      }
    };
    check();
    // Re-check every 15 seconds (short for testing, increase later)
    const interval = setInterval(check, 15 * 1000);
    return () => clearInterval(interval);
  }, []);

  if (dismissed || !serverVersion) return null;
  if (serverVersion <= APP_VERSION) return null;

  return (
    <div className="flex items-center justify-between gap-3 px-4 py-2" style={{ background: "#F59E0B", color: "#1a1a1a" }}>
      <div className="flex items-center gap-2 text-[13px] font-medium">
        <RefreshCw className="h-4 w-4" />
        <span>
          Ny uppdatering tillgänglig (v{serverVersion}). Tryck Ctrl+R för att uppdatera.
        </span>
      </div>
      <button
        onClick={() => setDismissed(true)}
        className="rounded-full p-0.5"
        style={{ background: "rgba(0,0,0,0.1)" }}
      >
        <X className="h-3.5 w-3.5" />
      </button>
    </div>
  );
}
