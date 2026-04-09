import { readFileSync, writeFileSync, existsSync } from 'node:fs'
import { join } from 'node:path'
import { runClaude } from '../claude-runner'
import { PIPELINE_DIR } from '../lib/platform'
import type { Strategy, LogFn } from '../lib/types'

export async function runStrategy(outputDir: string, log: LogFn): Promise<Strategy> {
  log('Strategisk analys startad...')

  const dataPath = join(outputDir, 'företagsdata.json')
  if (!existsSync(dataPath)) {
    throw new Error(`Företagsdata saknas: ${dataPath}`)
  }
  const businessData = readFileSync(dataPath, 'utf-8').slice(0, 3000)

  const templatePath = join(PIPELINE_DIR, 'strategy-prompt.md')
  const template = readFileSync(templatePath, 'utf-8')
  const prompt = template.replace('$BUSINESS_DATA', businessData)

  const stdout = await runClaude({
    args: [
      '--dangerously-skip-permissions',
      '-p', prompt,
      '--output-format', 'json',
    ],
    cwd: outputDir,
    log,
  })

  const strategy = parseStrategyResult(stdout)
  const strategyPath = join(outputDir, 'strategy.json')
  writeFileSync(strategyPath, JSON.stringify(strategy, null, 2))

  log(`Strategi klar — ${strategy.pages.length} sidor, ${strategy.services.total} tjänster`)
  return strategy
}

function parseStrategyResult(stdout: string): Strategy {
  // Claude --output-format json returnerar en JSON-array av messages.
  // Det sista meddelandet har type="result" med ett "result"-fält.
  try {
    const messages = JSON.parse(stdout)
    if (Array.isArray(messages)) {
      const resultMsg = messages.find((m) => m.type === 'result' && m.result)
      if (resultMsg) {
        let text: string = resultMsg.result
        // Strippa eventuella markdown code-blocks
        text = text.replace(/```json\s*/g, '').replace(/```\s*/g, '')
        const match = text.match(/\{[\s\S]*"reasoning"[\s\S]*\}/)
        if (match) {
          return JSON.parse(match[0]) as Strategy
        }
      }
    }
  } catch {
    // fall through
  }

  // Fallback: försök extrahera från rå stdout
  const cleaned = stdout.replace(/```json\s*/g, '').replace(/```\s*/g, '')
  const match = cleaned.match(/\{"reasoning"[\s\S]*?"categoryOrder"\s*:\s*\[[^\]]*\]\s*\}\s*\}/)
  if (match) {
    return JSON.parse(match[0]) as Strategy
  }

  throw new Error('Kunde inte parsa strategi-JSON från Claude output')
}
