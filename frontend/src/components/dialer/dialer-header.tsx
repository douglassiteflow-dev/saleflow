import { useState } from "react";
import { NotificationDropdown } from "./notification-dropdown";
import { ReportModal } from "@/components/report-modal";
import { useUnreadCount } from "@/api/notifications";

interface DialerHeaderProps {
  userName?: string;
  callsToday: number;
  meetingsToday: number;
  conversionRate: number;
  callbackCount?: number;
  onProfileClick?: () => void;
  onOpenMeeting?: (id: string) => void;
  onOpenLead?: (id: string) => void;
  onUpdateMeetingStatus?: (id: string, status: "completed" | "cancelled") => void;
  onRebookMeeting?: (id: string) => void;
}

export function DialerHeader({
  userName,
  callsToday,
  meetingsToday,
  conversionRate,
  onProfileClick,
  onOpenMeeting,
  onOpenLead,
  onUpdateMeetingStatus,
  onRebookMeeting,
}: DialerHeaderProps) {
  const [dropdownOpen, setDropdownOpen] = useState(false);
  const [reportOpen, setReportOpen] = useState(false);
  const unreadCount = useUnreadCount();
  const isDesktop = window.location.pathname === "/app" || !!window.saleflowDesktop;
  const isWindows = navigator.platform?.includes("Win") || navigator.userAgent?.includes("Windows");

  return (
    <div className={`relative flex items-center py-3 ${isDesktop ? (isWindows ? "pl-5" : "pl-[85px]") + " pr-5" : "px-5 rounded-t-[14px]"}`} style={{ background: "linear-gradient(135deg, #312E81, #4F46E5, #6366F1)", WebkitAppRegion: isDesktop ? "drag" : undefined } as React.CSSProperties}>
      <div className="flex items-center gap-2">
        <img src="/app-icons/saleflow.png" alt="Saleflow" className="h-7 w-7 rounded" />
        <span className="text-[15px] font-semibold tracking-[-0.3px] text-white">
          Saleflow
        </span>
      </div>

      <div className="flex-1" />

      <div className="flex items-center gap-5" style={{ WebkitAppRegion: "no-drag" } as React.CSSProperties}>
        <div className="text-center">
          <p className="text-[9px] uppercase tracking-[1px] text-white/50 mb-0.5">Samtal</p>
          <p className="text-lg font-light text-white leading-none">{callsToday}</p>
        </div>
        <div className="text-center">
          <p className="text-[9px] uppercase tracking-[1px] text-white/50 mb-0.5">Möten</p>
          <p className="text-lg font-light text-emerald-400 leading-none">{meetingsToday}</p>
        </div>
        <div className="text-center">
          <p className="text-[9px] uppercase tracking-[1px] text-white/50 mb-0.5">Konv.</p>
          <p className="text-lg font-light text-amber-300 leading-none">{conversionRate}%</p>
        </div>

        <div className="w-px h-6 bg-white/20 mx-1" />

        {/* Notifications bell */}
        <button
          type="button"
          onClick={() => setDropdownOpen((prev) => !prev)}
          className="relative flex items-center justify-center h-8 w-8 rounded-full bg-white/10 hover:bg-white/20 transition-colors cursor-pointer"
        >
          <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="white" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
            <path d="M18 8A6 6 0 0 0 6 8c0 7-3 9-3 9h18s-3-2-3-9" />
            <path d="M13.73 21a2 2 0 0 1-3.46 0" />
          </svg>
          {unreadCount > 0 && (
            <span className="absolute -top-0.5 -right-0.5 flex h-4 w-4 items-center justify-center rounded-full bg-red-500 text-[9px] font-bold text-white">
              {unreadCount}
            </span>
          )}
        </button>

        {/* Notification dropdown */}
        <NotificationDropdown
          open={dropdownOpen}
          onClose={() => setDropdownOpen(false)}
          onOpenMeeting={(id) => {
            setDropdownOpen(false);
            onOpenMeeting?.(id);
          }}
          onOpenLead={(id) => {
            setDropdownOpen(false);
            onOpenLead?.(id);
          }}
          onUpdateMeetingStatus={(id, status) => {
            setDropdownOpen(false);
            onUpdateMeetingStatus?.(id, status);
          }}
          onRebookMeeting={(id) => {
            setDropdownOpen(false);
            onRebookMeeting?.(id);
          }}
        />

        {/* Report button */}
        <button
          type="button"
          onClick={() => setReportOpen(true)}
          className="flex items-center gap-1.5 rounded-full bg-white/10 px-3 py-1.5 text-[11px] text-white/70 hover:bg-white/20 hover:text-white transition-colors cursor-pointer"
        >
          <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round">
            <path d="M10 6v4M10 14h.01" />
            <circle cx="10" cy="10" r="9" />
          </svg>
          Rapportera
        </button>

        {/* Profile */}
        <button
          type="button"
          onClick={onProfileClick}
          className="flex items-center gap-2 cursor-pointer hover:opacity-80 transition-opacity"
        >
          <span className="flex h-7 w-7 items-center justify-center rounded-full bg-white/20 text-[11px] font-medium text-white">
            {userName?.charAt(0)?.toUpperCase() ?? "?"}
          </span>
          <span className="text-[12px] text-white/80">{userName ?? ""}</span>
        </button>
      </div>

      {/* Report modal */}
      {reportOpen && <ReportModal onClose={() => setReportOpen(false)} />}
    </div>
  );
}
