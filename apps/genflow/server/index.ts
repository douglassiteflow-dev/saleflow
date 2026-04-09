// Utility process entry point.
import { loadConfig } from './lib/config'
import { startPolling, stopPolling, togglePause } from './poller'
import type { GenJob, LogFn } from './lib/types'

console.log('[server] utility process started, pid:', process.pid)

type ServerToMainMessage =
  | { type: 'log'; payload: { message: string } }
  | { type: 'heartbeat'; timestamp: number }
  | { type: 'pong' }
  | { type: 'polling-status'; payload: { running: boolean; paused: boolean } }
  | { type: 'job-start'; payload: { job: GenJob } }
  | { type: 'job-complete'; payload: { job: GenJob; resultUrl: string } }
  | { type: 'job-failed'; payload: { job: GenJob; error: string } }

function send(msg: ServerToMainMessage) {
  process.parentPort?.postMessage(msg)
}

const log: LogFn = (message) => {
  console.log('[server]', message)
  send({ type: 'log', payload: { message } })
}

function broadcast(event: { type: string; payload?: unknown }) {
  send(event as ServerToMainMessage)
}

async function handleJob(job: GenJob): Promise<void> {
  log(`Nytt jobb plockat: ${job.slug} (${job.source_url})`)
  broadcast({ type: 'job-start', payload: { job } })

  // Jobbhantering implementeras i Task 22 (orchestrator)
  log(`Jobb ${job.slug}: pipeline inte implementerad än — skippas`)
  broadcast({ type: 'job-failed', payload: { job, error: 'Pipeline inte implementerad ännu' } })
}

process.parentPort?.on('message', (event: Electron.MessageEvent) => {
  const msg = event.data as { type?: string } | undefined

  if (msg?.type === 'ping') {
    send({ type: 'pong' })
  }

  if (msg?.type === 'toggle-polling') {
    togglePause()
    log('Polling-toggle mottaget')
  }

  if (msg?.type === 'shutdown') {
    log('Shutdown mottaget, avslutar')
    stopPolling()
    setTimeout(() => process.exit(0), 500)
  }
})

// Heartbeat var 30:e sekund
setInterval(() => {
  send({ type: 'heartbeat', timestamp: Date.now() })
}, 30_000)

// Starta polling
const config = loadConfig()
if (!config.apiKey) {
  log('Ingen API-nyckel i ~/.genflow/config.json — polling pausad')
  log('Lägg till apiKey i config och restarta appen')
} else {
  log(`Startar polling mot ${config.backendUrl}`)
  startPolling(config, log, broadcast, handleJob).catch((err) => {
    log(`Polling-loop krasch: ${err.message}`)
    process.exit(1)
  })
}
