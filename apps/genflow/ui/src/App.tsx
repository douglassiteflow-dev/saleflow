import { useEffect, useState } from 'react'

interface ServerEvent {
  type: string
  payload?: unknown
  timestamp?: number
}

interface LogEntry {
  timestamp: string
  message: string
}

declare global {
  interface Window {
    genflow?: {
      onEvent: (channel: string, listener: (payload: unknown) => void) => () => void
      send: (channel: string, payload: unknown) => void
    }
  }
}

export default function App() {
  const [status, setStatus] = useState<'connected' | 'disconnected' | 'paused' | 'working'>(
    'disconnected',
  )
  const [logs, setLogs] = useState<LogEntry[]>([])

  useEffect(() => {
    if (!window.genflow) return

    const unsub = window.genflow.onEvent('server-event', (payload) => {
      const event = payload as ServerEvent

      if (event.type === 'log') {
        const p = event.payload as { message: string }
        setLogs((prev) => [
          ...prev.slice(-199),
          { timestamp: new Date().toLocaleTimeString('sv-SE'), message: p.message },
        ])
      }

      if (event.type === 'polling-status') {
        const p = event.payload as { running: boolean; paused: boolean }
        setStatus(p.paused ? 'paused' : p.running ? 'connected' : 'disconnected')
      }

      if (event.type === 'job-start') {
        setStatus('working')
      }

      if (event.type === 'job-complete' || event.type === 'job-failed') {
        setStatus('connected')
      }
    })

    return () => unsub()
  }, [])

  const statusColor =
    status === 'connected' ? '#22c55e' :
    status === 'working' ? '#3b82f6' :
    status === 'paused' ? '#eab308' :
    '#ef4444'

  return (
    <div style={{ padding: 24, fontFamily: 'system-ui, sans-serif', maxWidth: 960, margin: '0 auto' }}>
      <header style={{ display: 'flex', alignItems: 'center', gap: 12, marginBottom: 24 }}>
        <h1 style={{ margin: 0 }}>Genflow</h1>
        <span style={{
          display: 'inline-block',
          width: 10,
          height: 10,
          borderRadius: '50%',
          background: statusColor,
        }} />
        <span style={{ color: '#666', fontSize: 14 }}>
          {status === 'connected' ? 'Ansluten' :
           status === 'working' ? 'Arbetar' :
           status === 'paused' ? 'Pausad' :
           'Frånkopplad'}
        </span>
      </header>

      <section>
        <h2 style={{ fontSize: 16, color: '#666' }}>Loggar</h2>
        <div style={{
          background: '#111',
          color: '#ddd',
          fontFamily: 'ui-monospace, monospace',
          fontSize: 12,
          padding: 12,
          borderRadius: 6,
          height: 400,
          overflow: 'auto',
        }}>
          {logs.length === 0 && <div style={{ opacity: 0.5 }}>Inga loggar ännu</div>}
          {logs.map((log, i) => (
            <div key={i}>
              <span style={{ opacity: 0.5 }}>[{log.timestamp}]</span> {log.message}
            </div>
          ))}
        </div>
      </section>
    </div>
  )
}
