interface StatusPanelProps {
  status: 'connected' | 'disconnected' | 'paused' | 'working'
}

const STATUS_CONFIG: Record<
  StatusPanelProps['status'],
  { label: string; bgClass: string; textClass: string; borderClass: string; dotClass: string; pulse: boolean }
> = {
  connected: {
    label: 'Ansluten',
    bgClass: 'bg-emerald-50',
    textClass: 'text-emerald-700',
    borderClass: 'border-emerald-200',
    dotClass: 'bg-emerald-500',
    pulse: true,
  },
  working: {
    label: 'Arbetar',
    bgClass: 'bg-indigo-50',
    textClass: 'text-indigo-700',
    borderClass: 'border-indigo-200',
    dotClass: 'bg-indigo-500',
    pulse: true,
  },
  paused: {
    label: 'Pausad',
    bgClass: 'bg-amber-50',
    textClass: 'text-amber-700',
    borderClass: 'border-amber-200',
    dotClass: 'bg-amber-500',
    pulse: false,
  },
  disconnected: {
    label: 'Frånkopplad',
    bgClass: 'bg-red-50',
    textClass: 'text-red-700',
    borderClass: 'border-red-200',
    dotClass: 'bg-red-500',
    pulse: false,
  },
}

export default function StatusPanel({ status }: StatusPanelProps) {
  const cfg = STATUS_CONFIG[status]
  return (
    <span
      className={`inline-flex items-center gap-2 rounded-full border px-3 py-1 text-xs font-medium ${cfg.bgClass} ${cfg.textClass} ${cfg.borderClass}`}
    >
      <span className={`inline-block h-2 w-2 rounded-full ${cfg.dotClass} ${cfg.pulse ? 'animate-pulse' : ''}`} />
      {cfg.label}
    </span>
  )
}
