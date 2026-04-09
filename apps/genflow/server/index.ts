// Utility process entry point.
import { join } from 'node:path'
import { loadConfig } from './lib/config'
import { startPolling, stopPolling, togglePause } from './poller'
import { runJob } from './orchestrator'
import { deployToVercel } from './pipeline/deploy'
import { completeJob, failJob } from './lib/saleflow-client'
import { createJobLogger } from './lib/logger'
import { killAllActive } from './claude-runner'
import { OUTPUT_DIR } from './lib/platform'
import type { GenJob } from './lib/types'

console.log('[server] utility process started, pid:', process.pid)

type ServerToMainMessage =
  | { type: 'log'; payload: { message: string; jobSlug?: string; timestamp?: string } }
  | { type: 'heartbeat'; timestamp: number }
  | { type: 'pong' }
  | { type: 'polling-status'; payload: { running: boolean; paused: boolean } }
  | { type: 'job-start'; payload: { job: GenJob } }
  | { type: 'job-complete'; payload: { job: GenJob; resultUrl: string } }
  | { type: 'job-failed'; payload: { job: GenJob; error: string } }

function send(msg: ServerToMainMessage) {
  process.parentPort?.postMessage(msg)
}

function broadcast(event: { type: string; payload?: unknown }) {
  send(event as ServerToMainMessage)
}

const config = loadConfig()

async function handleJob(job: GenJob): Promise<void> {
  const logPath = join(OUTPUT_DIR, job.slug, 'pipeline.log')
  const { log } = createJobLogger(job.slug, logPath, broadcast)

  log(`Nytt jobb plockat: ${job.slug} (${job.source_url})`)
  broadcast({ type: 'job-start', payload: { job } })

  try {
    const { siteDir } = await runJob(job, log)
    const resultUrl = await deployToVercel(siteDir, job.slug, log)
    await completeJob(job.id, resultUrl, config)
    log(`Jobb komplett: ${resultUrl}`)
    broadcast({ type: 'job-complete', payload: { job, resultUrl } })
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err)
    log(`Jobb misslyckades: ${msg}`)
    try {
      await failJob(job.id, msg, config)
    } catch (failErr) {
      log(`Kunde inte rapportera fail till backend: ${(failErr as Error).message}`)
    }
    broadcast({ type: 'job-failed', payload: { job, error: msg } })
  }
}

process.parentPort?.on('message', (event: Electron.MessageEvent) => {
  const msg = event.data as { type?: string } | undefined

  if (msg?.type === 'ping') {
    send({ type: 'pong' })
  }

  if (msg?.type === 'toggle-polling') {
    togglePause()
    console.log('[server] Polling-toggle mottaget')
  }

  if (msg?.type === 'shutdown') {
    console.log('[server] Shutdown mottaget, avslutar')
    killAllActive()
    stopPolling()
    setTimeout(() => process.exit(0), 500)
  }
})

// Heartbeat var 30:e sekund
setInterval(() => {
  send({ type: 'heartbeat', timestamp: Date.now() })
}, 30_000)

// Starta polling
const startupLog = (message: string) => {
  console.log('[server]', message)
  broadcast({ type: 'log', payload: { message } })
}

if (!config.apiKey) {
  startupLog('Ingen API-nyckel i ~/.genflow/config.json — polling pausad')
  startupLog('Lägg till apiKey i config och restarta appen')
} else {
  startupLog(`Startar polling mot ${config.backendUrl}`)
  startPolling(config, startupLog, broadcast, handleJob).catch((err) => {
    startupLog(`Polling-loop krasch: ${err.message}`)
    process.exit(1)
  })
}
