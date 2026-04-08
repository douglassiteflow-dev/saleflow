import type { DealStage } from "@/api/types";

export interface StageConfig {
  key: DealStage;
  label: string;
  color: string;      // Tailwind bg class for badges
  textColor: string;  // Tailwind text class
  actionLabel: string; // Button text for advancing
}

export const STAGE_CONFIG: Record<string, StageConfig> = {
  booking_wizard: {
    key: "booking_wizard",
    label: "Bokning pågår",
    color: "bg-blue-100",
    textColor: "text-blue-700",
    actionLabel: "Schemalägg demo",
  },
  demo_scheduled: {
    key: "demo_scheduled",
    label: "Demo schemalagd",
    color: "bg-purple-100",
    textColor: "text-purple-700",
    actionLabel: "Markera möte genomfört",
  },
  meeting_completed: {
    key: "meeting_completed",
    label: "Möte genomfört",
    color: "bg-emerald-100",
    textColor: "text-emerald-700",
    actionLabel: "Skicka formulär",
  },
  questionnaire_sent: {
    key: "questionnaire_sent",
    label: "Formulär skickat",
    color: "bg-cyan-100",
    textColor: "text-cyan-700",
    actionLabel: "Skicka avtal",
  },
  contract_sent: {
    key: "contract_sent",
    label: "Avtal skickat",
    color: "bg-orange-100",
    textColor: "text-orange-700",
    actionLabel: "Markera som kund",
  },
  won: {
    key: "won",
    label: "Kund",
    color: "bg-green-100",
    textColor: "text-green-700",
    actionLabel: "",
  },
  cancelled: {
    key: "cancelled",
    label: "Avbruten",
    color: "bg-gray-100",
    textColor: "text-gray-500",
    actionLabel: "",
  },
};

export const ACTIVE_STAGES: DealStage[] = [
  "booking_wizard",
  "demo_scheduled",
  "meeting_completed",
  "questionnaire_sent",
  "contract_sent",
];

export function getStageConfig(stage: string): StageConfig {
  return STAGE_CONFIG[stage] ?? STAGE_CONFIG.cancelled;
}

export function formatDaysAgo(dateStr: string): string {
  const days = Math.floor((Date.now() - new Date(dateStr).getTime()) / 86400000);
  if (days === 0) return "Idag";
  if (days === 1) return "1 dag";
  return `${days} dagar`;
}
