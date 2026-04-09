import { appendFileSync, mkdirSync, writeFileSync } from 'node:fs'
import { dirname } from 'node:path'
import type { LogFn } from './types'

export interface JobLogger {
  log: LogFn
  logPath: string
}

type BroadcastFn = (event: { type: string; payload?: unknown }) => void

export function createJobLogger(
  jobSlug: string,
  logPath: string,
  broadcast: BroadcastFn,
): JobLogger {
  // Se till att katalogen finns
  mkdirSync(dirname(logPath), { recursive: true })
  // Nollställ logfilen vid start
  writeFileSync(logPath, '')

  const log: LogFn = (message) => {
    const timestamp = new Date().toLocaleTimeString('sv-SE')
    const line = `[${timestamp}] ${message}\n`
    try {
      appendFileSync(logPath, line)
    } catch (err) {
      console.error('[logger] failed to append:', err)
    }
    broadcast({
      type: 'log',
      payload: { message, jobSlug, timestamp },
    })
  }

  return { log, logPath }
}
