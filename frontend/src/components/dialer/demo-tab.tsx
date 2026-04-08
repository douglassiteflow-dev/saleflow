import { useDemoConfigs } from "@/api/demo-configs";
import { cn } from "@/lib/cn";
import type { DemoConfig, DemoStage } from "@/api/types";

const STAGE_LABELS: Record<DemoStage, { label: string; bg: string; text: string }> = {
  meeting_booked: { label: "Möte bokat", bg: "#ede9fe", text: "#5b21b6" },
  generating: { label: "Genererar...", bg: "#fef3c7", text: "#92400e" },
  demo_ready: { label: "Demo klar", bg: "#d1fae5", text: "#065f46" },
  followup: { label: "Uppföljning", bg: "#dbeafe", text: "#1e40af" },
  cancelled: { label: "Avbruten", bg: "#f3f4f6", text: "#6b7280" },
};

interface DemoTabProps {
  onSelectDemoConfig: (id: string) => void;
}

export function DemoTab({ onSelectDemoConfig }: DemoTabProps) {
  const { data: configs, isLoading } = useDemoConfigs();

  if (isLoading) {
    return (
      <div className="flex-1 flex items-center justify-center">
        <p className="text-sm text-[var(--color-text-secondary)]">Laddar demos...</p>
      </div>
    );
  }

  if (!configs?.length) {
    return (
      <div className="flex-1 flex items-center justify-center">
        <p className="text-sm text-[var(--color-text-secondary)]">Inga demo-konfigurationer ännu...</p>
      </div>
    );
  }

  return (
    <div className="flex-1 overflow-auto">
      <table className="w-full text-[13px]">
        <thead>
          <tr className="border-b border-[var(--color-border)] bg-[var(--color-bg-panel)]">
            <th className="text-left px-5 py-2.5 text-[10px] font-medium uppercase tracking-[0.5px] text-[var(--color-text-secondary)]">Företag</th>
            <th className="text-left px-5 py-2.5 text-[10px] font-medium uppercase tracking-[0.5px] text-[var(--color-text-secondary)]">Status</th>
          </tr>
        </thead>
        <tbody>
          {configs.map((dc) => (
            <DemoConfigRow key={dc.id} config={dc} onClick={() => onSelectDemoConfig(dc.id)} />
          ))}
        </tbody>
      </table>
    </div>
  );
}

function DemoConfigRow({ config, onClick }: { config: DemoConfig; onClick: () => void }) {
  const name = config.lead_name ?? config.source_url ?? config.lead_id;
  const stage = STAGE_LABELS[config.stage];

  return (
    <tr
      onClick={onClick}
      className="border-b border-[var(--color-border)] hover:bg-[var(--color-bg-panel)] cursor-pointer transition-colors"
    >
      <td className="px-5 py-2.5 font-medium text-[var(--color-text-primary)]">
          <span
            className={cn(
              "inline-block w-2 h-2 rounded-full mr-2",
              config.health_score == null && "bg-gray-300",
              config.health_score != null && config.health_score > 70 && "bg-emerald-500",
              config.health_score != null && config.health_score >= 40 && config.health_score <= 70 && "bg-amber-500",
              config.health_score != null && config.health_score < 40 && "bg-red-500",
            )}
            title={config.health_score != null ? `Hälsa: ${config.health_score}%` : "Ej beräknad"}
          />
          {name}
        </td>
      <td className="px-5 py-2.5">
        <span
          className={cn("inline-flex items-center rounded-full px-2 py-0.5 text-[11px] font-medium border")}
          style={{ backgroundColor: stage.bg, color: stage.text, borderColor: stage.bg }}
        >
          {stage.label}
        </span>
      </td>
    </tr>
  );
}
