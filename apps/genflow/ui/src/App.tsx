import { useEffect, useState } from 'react'
import StatusPanel from './components/StatusPanel'
import LogViewer from './components/LogViewer'
import JobQueue from './components/JobQueue'

interface ServerEvent {
  type: string
  payload?: unknown
}

interface LogEntry {
  timestamp: string
  message: string
  jobSlug?: string
}

interface Job {
  slug: string
  sourceUrl: string
  status: 'running' | 'ok' | 'failed'
  startedAt: string
  resultUrl?: string
  error?: string
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
  const [jobs, setJobs] = useState<Job[]>([])

  useEffect(() => {
    if (!window.genflow) return

    const unsub = window.genflow.onEvent('server-event', (payload) => {
      const event = payload as ServerEvent

      if (event.type === 'log') {
        const p = event.payload as { message: string; jobSlug?: string; timestamp?: string }
        setLogs((prev) => [
          ...prev.slice(-199),
          {
            timestamp: p.timestamp ?? new Date().toLocaleTimeString('sv-SE'),
            message: p.message,
            jobSlug: p.jobSlug,
          },
        ])
      }

      if (event.type === 'polling-status') {
        const p = event.payload as { running: boolean; paused: boolean }
        setStatus(p.paused ? 'paused' : p.running ? 'connected' : 'disconnected')
      }

      if (event.type === 'job-start') {
        const p = event.payload as { job: { slug: string; source_url: string } }
        setStatus('working')
        setJobs((prev) => [
          {
            slug: p.job.slug,
            sourceUrl: p.job.source_url,
            status: 'running',
            startedAt: new Date().toLocaleTimeString('sv-SE'),
          },
          ...prev.slice(0, 9),
        ])
      }

      if (event.type === 'job-complete') {
        const p = event.payload as { job: { slug: string }; resultUrl: string }
        setStatus('connected')
        setJobs((prev) =>
          prev.map((j) =>
            j.slug === p.job.slug && j.status === 'running'
              ? { ...j, status: 'ok', resultUrl: p.resultUrl }
              : j,
          ),
        )
      }

      if (event.type === 'job-failed') {
        const p = event.payload as { job: { slug: string }; error: string }
        setStatus('connected')
        setJobs((prev) =>
          prev.map((j) =>
            j.slug === p.job.slug && j.status === 'running'
              ? { ...j, status: 'failed', error: p.error }
              : j,
          ),
        )
      }
    })

    return () => unsub()
  }, [])

  return (
    <div className="min-h-screen bg-[var(--color-bg-panel)]">
      {/* Topbar */}
      <header className="border-b bg-[var(--color-bg-primary)]">
        <div className="mx-auto flex h-14 max-w-[1200px] items-center justify-between px-[var(--spacing-page)]">
          <div className="flex items-center gap-3">
            <img src="/genflow-logo.svg" alt="Genflow" className="h-7 w-7" />
            <h1 className="text-[15px] font-semibold tracking-tight text-[var(--color-text-primary)]">
              Genflow
            </h1>
          </div>
          <StatusPanel status={status} />
        </div>
      </header>

      {/* Page content */}
      <main className="mx-auto max-w-[1200px] px-[var(--spacing-page)] py-[var(--spacing-section)]">
        <div className="grid grid-cols-3 gap-[var(--spacing-element)]">
          <div className="col-span-2">
            <LogViewer logs={logs} />
          </div>
          <div>
            <JobQueue jobs={jobs} />
          </div>
        </div>
      </main>
    </div>
  )
}
