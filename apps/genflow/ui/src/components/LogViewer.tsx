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
    <div>
      <h2 style={{ fontSize: 14, color: '#666', marginBottom: 8 }}>Loggar</h2>
      <div
        ref={containerRef}
        style={{
          background: '#111',
          color: '#ddd',
          fontFamily: 'ui-monospace, Menlo, monospace',
          fontSize: 11,
          padding: 12,
          borderRadius: 6,
          height: 400,
          overflow: 'auto',
        }}
      >
        {logs.length === 0 && <div style={{ opacity: 0.5 }}>Inga loggar ännu</div>}
        {logs.map((log, i) => (
          <div key={i} style={{ lineHeight: 1.4 }}>
            <span style={{ opacity: 0.5 }}>[{log.timestamp}]</span>
            {log.jobSlug && (
              <span style={{ color: '#60a5fa' }}> [{log.jobSlug}]</span>
            )}{' '}
            {log.message}
          </div>
        ))}
      </div>
    </div>
  )
}
