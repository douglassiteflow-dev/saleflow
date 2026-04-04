import { TelavoxConnect } from "@/components/telavox-connect";
import { LiveCalls } from "@/components/live-calls";

export function AppTelavoxPage() {
  return (
    <div className="space-y-6">
      <div className="flex items-center gap-3">
        <img src="/app-icons/telavox.jpeg" alt="Telavox" className="h-10 w-10 rounded-lg object-cover" />
        <h1 className="text-[22px] font-light tracking-[-0.5px] text-[var(--color-text-primary)]">
          Telavox
        </h1>
      </div>
      <TelavoxConnect />
      <LiveCalls />
    </div>
  );
}
