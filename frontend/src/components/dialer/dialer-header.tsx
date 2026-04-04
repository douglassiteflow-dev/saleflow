interface DialerHeaderProps {
  userName?: string;
  callsToday: number;
  meetingsToday: number;
  conversionRate: number;
  onProfileClick?: () => void;
}

export function DialerHeader({ userName, callsToday, meetingsToday, conversionRate, onProfileClick }: DialerHeaderProps) {

  return (
    <div className="flex items-center px-5 py-3 rounded-t-[14px]" style={{ background: "linear-gradient(135deg, #312E81, #4F46E5, #6366F1)" }}>
      <span className="text-[15px] font-semibold tracking-[-0.3px] text-white">
        Saleflow
      </span>

      <div className="flex-1" />

      <div className="flex items-center gap-5">
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
    </div>
  );
}
