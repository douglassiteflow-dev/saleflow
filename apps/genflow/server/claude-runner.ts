import { spawn, ChildProcess } from 'node:child_process'
import pLimit from 'p-limit'
import { CLAUDE_BIN } from './lib/platform'
import { loadConfig } from './lib/config'
import type { LogFn } from './lib/types'

const activeProcesses = new Set<ChildProcess>()

let limit = pLimit(loadConfig().claudeConcurrency)

export function reloadLimiter(): void {
  const config = loadConfig()
  limit = pLimit(config.claudeConcurrency)
}

export interface RunClaudeOptions {
  args: string[]
  cwd: string
  log: LogFn
  onLine?: (line: string) => void
}

export function runClaude(opts: RunClaudeOptions): Promise<string> {
  return limit(() => new Promise<string>((resolve, reject) => {
    const config = loadConfig()
    const maxRuntimeMs = config.claudeMaxRuntimeMs
    const idleTimeoutMs = config.claudeIdleTimeoutMs

    // Strip ALL API keys so Claude always uses OAuth/keychain auth.
    const env = { ...process.env }
    delete env.ANTHROPIC_API_KEY
    delete env.CLAUDE_API_KEY
    delete env.ANTHROPIC_AUTH_TOKEN

    const proc = spawn(CLAUDE_BIN, opts.args, {
      cwd: opts.cwd,
      stdio: ['ignore', 'pipe', 'pipe'],
      env,
    })
    activeProcesses.add(proc)

    let stdout = ''
    let lastActivity = Date.now()
    let finalized = false

    const finalize = (resolveVal: string | null, rejectVal: Error | null) => {
      if (finalized) return
      finalized = true
      clearInterval(watchdog)
      clearTimeout(hardTimer)
      activeProcesses.delete(proc)
      if (rejectVal) reject(rejectVal)
      else resolve(resolveVal ?? '')
    }

    const watchdog = setInterval(() => {
      if (Date.now() - lastActivity > idleTimeoutMs) {
        opts.log(`Claude tyst i ${idleTimeoutMs / 1000}s — skickar SIGTERM`)
        proc.kill('SIGTERM')
        setTimeout(() => {
          if (!proc.killed) proc.kill('SIGKILL')
        }, 3000)
      }
    }, 10_000)

    const hardTimer = setTimeout(() => {
      opts.log(`Claude max runtime (${maxRuntimeMs / 1000}s) — dödar`)
      proc.kill('SIGKILL')
      finalize(null, new Error('claude max runtime exceeded'))
    }, maxRuntimeMs)

    proc.stdout?.on('data', (chunk: Buffer) => {
      lastActivity = Date.now()
      const text = chunk.toString()
      stdout += text
      for (const line of text.split('\n')) {
        const trimmed = line.trim()
        if (trimmed && opts.onLine) {
          opts.onLine(trimmed)
        }
      }
    })

    proc.stderr?.on('data', (chunk: Buffer) => {
      lastActivity = Date.now()  // stderr räknas som aktivitet
      const text = chunk.toString().trim()
      if (text) opts.log(`[stderr] ${text.slice(0, 200)}`)
    })

    proc.on('error', (err) => {
      opts.log(`Claude spawn error: ${err.message}`)
      finalize(null, err)
    })

    proc.on('exit', (code) => {
      if (code === 0) {
        finalize(stdout, null)
      } else {
        finalize(null, new Error(`claude exit code ${code}`))
      }
    })
  }))
}

export function killAllActive(): void {
  for (const proc of activeProcesses) {
    try {
      proc.kill('SIGKILL')
    } catch {
      // ignore
    }
  }
  activeProcesses.clear()
}

export function getActiveCount(): number {
  return activeProcesses.size
}
