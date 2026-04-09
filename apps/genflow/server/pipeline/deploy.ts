import { spawn } from 'node:child_process'
import { existsSync, writeFileSync } from 'node:fs'
import { join } from 'node:path'
import type { LogFn } from '../lib/types'

export async function deployToVercel(
  siteDir: string,
  slug: string,
  log: LogFn,
): Promise<string> {
  log(`Deploy startat för ${slug}`)

  if (!existsSync(siteDir)) {
    throw new Error(`Site-katalog saknas: ${siteDir}`)
  }

  // Skapa vercel.json om den inte finns
  const vercelJsonPath = join(siteDir, 'vercel.json')
  if (!existsSync(vercelJsonPath)) {
    writeFileSync(vercelJsonPath, JSON.stringify({
      cleanUrls: true,
    }, null, 2))
  }

  const output: string[] = []

  await new Promise<void>((resolve, reject) => {
    const proc = spawn('vercel', ['deploy', '--prod', '--yes'], {
      cwd: siteDir,
      stdio: ['ignore', 'pipe', 'pipe'],
      env: process.env,
    })

    proc.stdout?.on('data', (chunk: Buffer) => {
      const text = chunk.toString()
      output.push(text)
      for (const line of text.split('\n')) {
        if (line.trim()) log(`[deploy] ${line.trim()}`)
      }
    })

    proc.stderr?.on('data', (chunk: Buffer) => {
      const text = chunk.toString().trim()
      if (text) log(`[deploy err] ${text.slice(0, 200)}`)
    })

    proc.on('error', (err) => reject(err))
    proc.on('exit', (code) => {
      if (code === 0) resolve()
      else reject(new Error(`vercel deploy exit code ${code}`))
    })
  })

  // Extrahera URL från output
  const fullOutput = output.join('')
  const urlMatch = fullOutput.match(/https:\/\/[\w-]+\.vercel\.app/g)
  if (!urlMatch || urlMatch.length === 0) {
    throw new Error('Kunde inte hitta deployed URL i vercel output')
  }

  const deployedUrl = urlMatch[urlMatch.length - 1]  // sista URL:en är prod-alias
  log(`Deploy klar: ${deployedUrl}`)
  return deployedUrl
}
