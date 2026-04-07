import { useState, useRef, useEffect } from "react";
import { useAgentReport } from "@/api/daily-summary";
import { todayISO } from "@/lib/date";
import { ChevronLeft, ChevronRight } from "lucide-react";

function fmtDate(iso: string) {
  return new Date(iso + "T12:00:00").toLocaleDateString("sv-SE", { weekday: "long", day: "numeric", month: "long" });
}

export function ReportTab() {
  const [date, setDate] = useState(todayISO());
  const { data: rd, isLoading } = useAgentReport(date);
  const iframeRef = useRef<HTMLIFrameElement>(null);

  const prev = () => { const d = new Date(date + "T12:00:00"); d.setDate(d.getDate() - 1); setDate(d.toISOString().slice(0, 10)); };
  const next = () => { const d = new Date(date + "T12:00:00"); d.setDate(d.getDate() + 1); if (d.toISOString().slice(0, 10) <= todayISO()) setDate(d.toISOString().slice(0, 10)); };
  const isToday = date === todayISO();

  // Auto-adjust iframe height
  useEffect(() => {
    const iframe = iframeRef.current;
    if (!iframe || !rd?.html) return;

    const adjustHeight = () => {
      try {
        const doc = iframe.contentDocument;
        if (doc?.body) {
          iframe.style.height = doc.body.scrollHeight + 32 + "px";
        }
      } catch { /* cross-origin safety */ }
    };

    iframe.addEventListener("load", adjustHeight);
    return () => iframe.removeEventListener("load", adjustHeight);
  }, [rd?.html]);

  return (
    <div className="flex-1 overflow-auto bg-[#FAFAFA]">
      {/* Nav */}
      <div className="flex items-center justify-between px-6 py-4">
        <button onClick={prev} className="p-1.5 rounded-full hover:bg-black/5 cursor-pointer transition">
          <ChevronLeft className="h-4 w-4 text-[#86868B]" />
        </button>
        <div className="text-center">
          <p className="text-[15px] font-semibold text-[#1D1D1F] capitalize">{fmtDate(date)}</p>
          {isToday && <p className="text-[11px] text-[#0071E3]">Idag</p>}
        </div>
        <button onClick={next} disabled={isToday} className="p-1.5 rounded-full hover:bg-black/5 cursor-pointer transition disabled:opacity-20">
          <ChevronRight className="h-4 w-4 text-[#86868B]" />
        </button>
      </div>

      {isLoading ? (
        <div className="px-6 py-16 text-center">
          <p className="text-[13px] text-[#86868B]">Laddar rapport...</p>
        </div>
      ) : rd?.html ? (
        <iframe
          ref={iframeRef}
          srcDoc={rd.html}
          sandbox="allow-same-origin"
          className="w-full border-0"
          style={{ minHeight: "400px" }}
          title="Daglig rapport"
        />
      ) : (
        <div className="px-6 py-16 text-center">
          <div className="bg-white rounded-2xl p-8 max-w-md mx-auto" style={{ boxShadow: "0 1px 3px rgba(0,0,0,0.06)" }}>
            <p className="text-[15px] text-[#1D1D1F]">Dagens rapport uppdateras kl 16:10 varje vardag</p>
            <p className="text-[12px] text-[#86868B] mt-1">Bläddra bakåt för att se tidigare rapporter</p>
          </div>
          <button onClick={prev} className="mt-4 text-[13px] text-[#0071E3] hover:underline cursor-pointer">&#8592; Föregående dag</button>
        </div>
      )}
    </div>
  );
}
