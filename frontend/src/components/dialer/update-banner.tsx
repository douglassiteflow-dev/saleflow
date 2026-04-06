import { useState, useEffect } from "react";
import { RefreshCw, X } from "lucide-react";
import { APP_VERSION } from "@/version";

export function UpdateBanner() {
  const [dismissed, setDismissed] = useState(false);
  const [serverVersion, setServerVersion] = useState<string | null>(null);

  useEffect(() => {
    const check = async () => {
      try {
        const res = await fetch("/version.json", { cache: "no-store" });
        if (res.ok) {
          const data = (await res.json()) as { version: string };
          setServerVersion(data.version);
        }
      } catch {
        // ignore
      }
    };
    check();
    const interval = setInterval(check, 60 * 1000);
    return () => clearInterval(interval);
  }, []);

  if (dismissed || !serverVersion) return null;
  if (serverVersion <= APP_VERSION) return null;

  return (
    <div
      className="flex items-center justify-between gap-3 border-b px-4 py-2"
      style={{ background: "#ffffff", borderColor: "#E2E8F0" }}
    >
      <div className="flex items-center gap-2 text-[13px] font-medium" style={{ color: "#4F46E5" }}>
        <RefreshCw className="h-4 w-4" />
        <span>
          Ny uppdatering tillgänglig (v{serverVersion}). Tryck Ctrl+R för att uppdatera.
        </span>
      </div>
      <button
        onClick={() => setDismissed(true)}
        className="rounded-full p-0.5 hover:bg-gray-100"
        style={{ color: "#94A3B8" }}
      >
        <X className="h-3.5 w-3.5" />
      </button>
    </div>
  );
}
