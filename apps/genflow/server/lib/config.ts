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
    return {
      backendUrl: parsed.backendUrl ?? DEFAULT_CONFIG.backendUrl,
      apiKey: parsed.apiKey ?? DEFAULT_CONFIG.apiKey,
      pollInterval: parsed.pollInterval ?? DEFAULT_CONFIG.pollInterval,
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
