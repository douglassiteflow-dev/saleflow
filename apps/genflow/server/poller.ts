import { setTimeout as sleep } from 'node:timers/promises'
import type { GenflowConfig, GenJob, LogFn } from './lib/types'
import { fetchPendingJob } from './lib/saleflow-client'

type BroadcastFn = (event: { type: string; payload?: unknown }) => void

let running = false
let paused = false
let processing = false

export async function startPolling(
  config: GenflowConfig,
  log: LogFn,
  broadcast: BroadcastFn,
  handleJob: (job: GenJob) => Promise<void>,
) {
  if (running) return
  running = true
  paused = false
  log('Polling startat')
  broadcast({ type: 'polling-status', payload: { running: true, paused: false } })

  while (running) {
    if (!paused && !processing) {
      try {
        const job = await fetchPendingJob(config)
        if (job) {
          processing = true
          try {
            await handleJob(job)
          } finally {
            processing = false
          }
        }
      } catch (err) {
        const msg = err instanceof Error ? err.message : String(err)
        // Nätverksfel är tysta — vi loggar bara debug
        if (!msg.includes('fetch failed') && !msg.includes('ECONNREFUSED')) {
          log(`Pollingfel: ${msg}`)
        }
      }
    }
    await sleep(config.pollInterval)
  }

  log('Polling stoppat')
  broadcast({ type: 'polling-status', payload: { running: false, paused: false } })
}

export function stopPolling() {
  running = false
}

export function togglePause() {
  paused = !paused
}

export function isPaused(): boolean {
  return paused
}

export function isRunning(): boolean {
  return running
}
