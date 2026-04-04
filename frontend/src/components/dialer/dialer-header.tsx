interface DialerHeaderProps {
  callsToday: number;
  meetingsToday: number;
  conversionRate: number;
}

export function DialerHeader({ callsToday, meetingsToday, conversionRate }: DialerHeaderProps) {
  return (
    <div className="flex items-center px-5 py-3 rounded-t-[14px]" style={{ background: "linear-gradient(135deg, #312E81, #4F46E5, #6366F1)" }}>
      <span className="text-[15px] font-semibold tracking-[-0.3px] text-white">
        Saleflow
      </span>

      <div className="flex-1" />

      <div className="flex gap-5">
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
      </div>
    </div>
  );
}
