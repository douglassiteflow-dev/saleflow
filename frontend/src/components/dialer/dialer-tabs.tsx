import { cn } from "@/lib/cn";

export type DialerTab = "dialer" | "callbacks" | "history" | "meetings";

interface DialerTabsProps {
  activeTab: string;
  onTabChange: (tab: DialerTab) => void;
  callbackCount?: number;
  meetingCount?: number;
}

const TABS: { key: DialerTab; label: string }[] = [
  { key: "dialer", label: "Dialer" },
  { key: "history", label: "Samtalshistorik" },
  { key: "meetings", label: "Möten" },
  { key: "callbacks", label: "Callbacks" },
];

export function DialerTabs({
  activeTab,
  onTabChange,
  callbackCount,
  meetingCount,
}: DialerTabsProps) {
  return (
    <div className="flex border-b border-[var(--color-border)] bg-[var(--color-bg-primary)]">
      {TABS.map((tab) => {
        const isActive = activeTab === tab.key;
        return (
          <button
            key={tab.key}
            type="button"
            onClick={() => onTabChange(tab.key)}
            className={cn(
              "px-[22px] py-[11px] text-[13px] font-medium -mb-px cursor-pointer transition-colors",
              isActive
                ? "text-[var(--color-accent)] border-b-2 border-[var(--color-accent)]"
                : "text-[var(--color-text-secondary)] hover:text-[var(--color-text-primary)]",
            )}
          >
            {tab.label}
            {tab.key === "callbacks" && callbackCount != null && callbackCount > 0 && (
              <span className="ml-1 inline-flex items-center rounded-full bg-amber-50 px-[7px] py-px text-[10px] font-semibold text-amber-800 border border-amber-200">
                {callbackCount}
              </span>
            )}
            {tab.key === "meetings" && meetingCount != null && meetingCount > 0 && (
              <span className="ml-1 inline-flex items-center rounded-full bg-indigo-50 px-[7px] py-px text-[10px] font-semibold text-indigo-800 border border-indigo-200">
                {meetingCount}
              </span>
            )}
          </button>
        );
      })}
    </div>
  );
}
