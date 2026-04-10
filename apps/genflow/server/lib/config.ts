import { readFileSync, writeFileSync, existsSync, mkdirSync } from 'node:fs'
import { join } from 'node:path'
import { homedir } from 'node:os'
import type { GenflowConfig } from './types'

const CONFIG_DIR = join(homedir(), '.genflow')
const CONFIG_PATH = join(CONFIG_DIR, 'config.json')

const DEFAULT_CONFIG: GenflowConfig = {
  backendUrl: 'https://api.siteflow.se',
  apiKey: '',
  pollInterval: 5000,
  claudeConcurrency: 6,
  claudeMaxRuntimeMs: 45 * 60 * 1000,
  claudeIdleTimeoutMs: 10 * 60 * 1000,
  autoStartPolling: true,
  outputDir: '',
}

export function loadConfig(): GenflowConfig {
  if (!existsSync(CONFIG_PATH)) {
    mkdirSync(CONFIG_DIR, { recursive: true })
    writeFileSync(CONFIG_PATH, JSON.stringify(DEFAULT_CONFIG, null, 2))
    return { ...DEFAULT_CONFIG }
  }

  try {
    const raw = readFileSync(CONFIG_PATH, 'utf-8')
    const parsed = JSON.parse(raw)
    const { flowingAiUrl, ...rest } = parsed  // ignorera gammal nyckel
    return {
      backendUrl: rest.backendUrl ?? DEFAULT_CONFIG.backendUrl,
      apiKey: rest.apiKey ?? DEFAULT_CONFIG.apiKey,
      pollInterval: rest.pollInterval ?? DEFAULT_CONFIG.pollInterval,
      claudeConcurrency: rest.claudeConcurrency ?? DEFAULT_CONFIG.claudeConcurrency,
      claudeMaxRuntimeMs: rest.claudeMaxRuntimeMs ?? DEFAULT_CONFIG.claudeMaxRuntimeMs,
      claudeIdleTimeoutMs: rest.claudeIdleTimeoutMs ?? DEFAULT_CONFIG.claudeIdleTimeoutMs,
      autoStartPolling: rest.autoStartPolling ?? DEFAULT_CONFIG.autoStartPolling,
      outputDir: rest.outputDir ?? DEFAULT_CONFIG.outputDir,
    }
  } catch (err) {
    console.error('[config] failed to parse, using defaults:', err)
    return { ...DEFAULT_CONFIG }
  }
}

export function saveConfig(config: GenflowConfig): void {
  mkdirSync(CONFIG_DIR, { recursive: true })
  writeFileSync(CONFIG_PATH, JSON.stringify(config, null, 2))
}
