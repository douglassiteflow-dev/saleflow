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

  // Test-jobb (id startar med "test-") kringgår saleflow backend completely.
  // De skapas av "Test pipeline"-knappen i UI:t för lokal verifiering.
  const isTest = job.id.startsWith('test-')

  log(`Nytt jobb${isTest ? ' (TEST)' : ''} plockat: ${job.slug} (${job.source_url})`)
  broadcast({ type: 'job-start', payload: { job } })

  try {
    const { siteDir } = await runJob(job, log)
    const resultUrl = await deployToVercel(siteDir, job.slug, log)
    if (!isTest) await completeJob(job.id, resultUrl, config)
    log(`Jobb komplett: ${resultUrl}`)
    broadcast({ type: 'job-complete', payload: { job, resultUrl } })
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err)
    log(`Jobb misslyckades: ${msg}`)
    if (!isTest) {
      try {
        await failJob(job.id, msg, config)
      } catch (failErr) {
        log(`Kunde inte rapportera fail till backend: ${(failErr as Error).message}`)
      }
    }
    broadcast({ type: 'job-failed', payload: { job, error: msg } })
  }
}

function buildSlugFromUrl(url: string): string {
  try {
    const path = new URL(url).pathname
    const parts = path.split('/').filter(Boolean)
    return parts[parts.length - 1] ?? `test-${Date.now()}`
  } catch {
    return `test-${Date.now()}`
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

  if (msg?.type === 'trigger-test') {
    const testMsg = msg as { type: 'trigger-test'; sourceUrl?: string }
    const sourceUrl = testMsg.sourceUrl ?? 'https://bokadirekt.se/places/sakura-relax-massage-59498'
    const slug = `test-${buildSlugFromUrl(sourceUrl)}-${Date.now()}`
    const fakeJob: GenJob = {
      id: `test-${Date.now()}`,
      source_url: sourceUrl,
      slug,
      status: 'pending',
      deal_id: null,
      demo_config_id: null,
    }
    console.log('[server] Test-pipeline triggad:', sourceUrl)
    handleJob(fakeJob).catch((err) => {
      console.error('[server] Test-pipeline error:', err.message)
    })
  }
})

// Heartbeat var 30:e sekund + re-broadcast polling-status
setInterval(() => {
  send({ type: 'heartbeat', timestamp: Date.now() })
  // Re-broadcast polling state så renderern alltid kan synca även om
  // den missade initial broadcast pga race condition vid startup.
  broadcast({
    type: 'polling-status',
    payload: { running: !!config.apiKey, paused: false },
  })
}, 5_000)

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
