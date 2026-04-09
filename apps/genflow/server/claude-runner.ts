import { spawn, ChildProcess } from 'node:child_process'
import pLimit from 'p-limit'
import { CLAUDE_BIN } from './lib/platform'
import type { LogFn } from './lib/types'

const CLAUDE_CONCURRENCY = 3
const CLAUDE_MAX_RUNTIME_MS = 45 * 60 * 1000  // 45 min hard timeout
const STDOUT_IDLE_MS = 5 * 60 * 1000           // 5 min utan stdout = hang
                                               // (index-sidan kan tänka länge på
                                               // en stor write utan stdout-aktivitet)

const limit = pLimit(CLAUDE_CONCURRENCY)
const activeProcesses = new Set<ChildProcess>()

export interface RunClaudeOptions {
  args: string[]
  cwd: string
  log: LogFn
  onLine?: (line: string) => void
}

export function runClaude(opts: RunClaudeOptions): Promise<string> {
  return limit(() => new Promise<string>((resolve, reject) => {
    // Strip ANTHROPIC_API_KEY so claude falls back on OAuth/keychain auth.
    // The user's env var is invalid (revoked/wrong-account) but their
    // Claude Code subscription works fine via OAuth — claude --print uses
    // the env var first if set, even if invalid.
    const env = { ...process.env }
    delete env.ANTHROPIC_API_KEY

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
      if (Date.now() - lastActivity > STDOUT_IDLE_MS) {
        opts.log(`Claude tyst i ${STDOUT_IDLE_MS / 1000}s — skickar SIGTERM`)
        proc.kill('SIGTERM')
        setTimeout(() => {
          if (!proc.killed) proc.kill('SIGKILL')
        }, 3000)
      }
    }, 10_000)

    const hardTimer = setTimeout(() => {
      opts.log(`Claude max runtime (${CLAUDE_MAX_RUNTIME_MS / 1000}s) — dödar`)
      proc.kill('SIGKILL')
      finalize(null, new Error('claude max runtime exceeded'))
    }, CLAUDE_MAX_RUNTIME_MS)

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
