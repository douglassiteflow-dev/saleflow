import { useEffect, useRef } from 'react'

interface LogEntry {
  timestamp: string
  message: string
  jobSlug?: string
}

interface LogViewerProps {
  logs: LogEntry[]
}

export default function LogViewer({ logs }: LogViewerProps) {
  const containerRef = useRef<HTMLDivElement>(null)

  useEffect(() => {
    if (containerRef.current) {
      containerRef.current.scrollTop = containerRef.current.scrollHeight
    }
  }, [logs.length])

  return (
    <div className="rounded-[14px] bg-[var(--color-bg-primary)] p-[var(--spacing-card)] shadow-[0_1px_3px_rgba(0,0,0,0.04)] border">
      <div className="mb-3 flex items-baseline justify-between">
        <h2 className="text-[11px] font-medium uppercase tracking-[1px] text-[var(--color-text-secondary)]">
          Loggar
        </h2>
        <span className="text-[10px] text-[var(--color-text-secondary)]">{logs.length} rader</span>
      </div>
      <div
        ref={containerRef}
        className="h-[420px] overflow-auto rounded-[8px] bg-[#0F172A] p-3 font-mono text-[11px] leading-[1.55] text-slate-200"
      >
        {logs.length === 0 && (
          <div className="text-slate-500">Inga loggar ännu</div>
        )}
        {logs.map((log, i) => (
          <div key={i} className="whitespace-pre-wrap break-words">
            <span className="text-slate-500">[{log.timestamp}]</span>
            {log.jobSlug && <span className="text-indigo-400"> [{log.jobSlug}]</span>}{' '}
            <span>{log.message}</span>
          </div>
        ))}
      </div>
    </div>
  )
}
