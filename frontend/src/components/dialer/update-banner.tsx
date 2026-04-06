import { useState } from "react";
import { Download, X } from "lucide-react";

const LATEST_DESKTOP_VERSION = "1.0.1";
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
    <div className="flex items-center justify-between gap-3 bg-[var(--color-accent-primary)] px-4 py-2 text-white">
      <div className="flex items-center gap-2 text-[13px]">
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
          className="rounded-[6px] bg-white/20 px-3 py-1 text-[12px] font-medium hover:bg-white/30"
        >
          Ladda ner
        </a>
        <button
          onClick={() => setDismissed(true)}
          className="rounded-full p-0.5 hover:bg-white/20"
        >
          <X className="h-3.5 w-3.5" />
        </button>
      </div>
    </div>
  );
}
