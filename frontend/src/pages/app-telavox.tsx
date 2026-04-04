import { TelavoxConnect } from "@/components/telavox-connect";
import { LiveCalls } from "@/components/live-calls";

export function AppTelavoxPage() {
  return (
    <div className="space-y-6">
      <h1 className="text-[22px] font-light tracking-[-0.5px] text-[var(--color-text-primary)]">
        Telavox
      </h1>
      <TelavoxConnect />
      <LiveCalls />
    </div>
  );
}
