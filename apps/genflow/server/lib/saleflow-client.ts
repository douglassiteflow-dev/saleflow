import type { GenflowConfig, GenJob } from './types'

export async function fetchPendingJob(config: GenflowConfig): Promise<GenJob | null> {
  const res = await fetch(`${config.backendUrl}/api/gen-jobs/pending`, {
    headers: { 'X-GenFlow-Key': config.apiKey },
  })
  if (!res.ok) {
    throw new Error(`fetchPendingJob: HTTP ${res.status}`)
  }
  const data = (await res.json()) as { job: GenJob | null }
  return data.job ?? null
}

export async function pickJob(jobId: string, config: GenflowConfig): Promise<void> {
  const res = await fetch(`${config.backendUrl}/api/gen-jobs/${jobId}/pick`, {
    method: 'POST',
    headers: { 'X-GenFlow-Key': config.apiKey },
  })
  if (!res.ok) {
    throw new Error(`pickJob: HTTP ${res.status}`)
  }
}

export async function completeJob(
  jobId: string,
  resultUrl: string,
  config: GenflowConfig,
): Promise<void> {
  const res = await fetch(`${config.backendUrl}/api/gen-jobs/${jobId}/complete`, {
    method: 'POST',
    headers: {
      'X-GenFlow-Key': config.apiKey,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({ result_url: resultUrl }),
  })
  if (!res.ok) {
    throw new Error(`completeJob: HTTP ${res.status}`)
  }
}

export async function failJob(
  jobId: string,
  error: string,
  config: GenflowConfig,
): Promise<void> {
  const res = await fetch(`${config.backendUrl}/api/gen-jobs/${jobId}/fail`, {
    method: 'POST',
    headers: {
      'X-GenFlow-Key': config.apiKey,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({ error }),
  })
  if (!res.ok) {
    throw new Error(`failJob: HTTP ${res.status}`)
  }
}
