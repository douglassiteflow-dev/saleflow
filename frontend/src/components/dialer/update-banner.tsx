import { useState } from "react";
import { Download, X } from "lucide-react";
import { APP_VERSION } from "@/version";

const LATEST_DESKTOP_VERSION = APP_VERSION;
const DOWNLOAD_URL = "https://sale.siteflow.se/download-app";

export function UpdateBanner() {
  const [dismissed, setDismissed] = useState(false);

  const desktop = (window as unknown as Record<string, unknown>).saleflowDesktop as
    | { version?: string }
    | undefined;

  if (!desktop || dismissed) return null;

  const currentVersion = desktop.version ?? "0.0.0";
  if (currentVersion >= LATEST_DESKTOP_VERSION) return null;

  return (
    <div className="flex items-center justify-between gap-3 px-4 py-2" style={{ background: "#F59E0B", color: "#1a1a1a" }}>
      <div className="flex items-center gap-2 text-[13px] font-medium">
        <Download className="h-4 w-4" />
        <span>
          Ny appversion tillgänglig (v{LATEST_DESKTOP_VERSION}). Du har v{currentVersion}.
        </span>
      </div>
      <div className="flex items-center gap-2">
        <a
          href={DOWNLOAD_URL}
          target="_blank"
          rel="noopener noreferrer"
          className="rounded-[6px] px-3 py-1 text-[12px] font-semibold"
          style={{ background: "rgba(0,0,0,0.15)" }}
        >
          Ladda ner
        </a>
        <button
          onClick={() => setDismissed(true)}
          className="rounded-full p-0.5"
          style={{ background: "rgba(0,0,0,0.1)" }}
        >
          <X className="h-3.5 w-3.5" />
        </button>
      </div>
    </div>
  );
}
