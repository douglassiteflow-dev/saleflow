interface DialerFooterProps {
  telavoxConnected: boolean;
  leadCount?: number;
}

export function DialerFooter({ telavoxConnected, leadCount }: DialerFooterProps) {
  return (
    <div
      className="flex items-center px-5 py-2 rounded-b-[14px]"
      style={{ background: "linear-gradient(135deg, #6366F1, #4F46E5, #312E81)" }}
    >
      <span className="inline-flex items-center gap-1.5 text-[11px]">
        <span
          className={`w-1.5 h-1.5 rounded-full ${telavoxConnected ? "bg-emerald-400" : "bg-red-400"}`}
        />
        <span className={telavoxConnected ? "text-emerald-400" : "text-red-400"}>
          {telavoxConnected ? "Kopplad" : "Ej kopplad"}
        </span>
      </span>

      <div className="flex-1" />

      <div className="flex items-center gap-2 text-[10px] text-white/40">
        {leadCount != null && <span>{leadCount} leads</span>}
        <span>·</span>
        <span>Saleflow v0.9</span>
      </div>
    </div>
  );
}
