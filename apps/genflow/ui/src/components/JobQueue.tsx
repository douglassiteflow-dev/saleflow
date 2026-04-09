interface Job {
  slug: string
  sourceUrl: string
  status: 'running' | 'ok' | 'failed'
  startedAt: string
  resultUrl?: string
  error?: string
}

interface JobQueueProps {
  jobs: Job[]
}

export default function JobQueue({ jobs }: JobQueueProps) {
  if (jobs.length === 0) {
    return (
      <div>
        <h2 style={{ fontSize: 14, color: '#666', marginBottom: 8 }}>Jobb</h2>
        <div style={{ color: '#999', fontSize: 13 }}>Inga jobb ännu</div>
      </div>
    )
  }

  return (
    <div>
      <h2 style={{ fontSize: 14, color: '#666', marginBottom: 8 }}>Jobb</h2>
      <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
        {jobs.map((job) => (
          <div
            key={`${job.slug}-${job.startedAt}`}
            style={{
              padding: 10,
              background: '#f5f5f5',
              borderRadius: 6,
              fontSize: 12,
            }}
          >
            <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 4 }}>
              <span style={{ fontWeight: 500 }}>
                {job.status === 'ok' ? '✓' : job.status === 'failed' ? '✗' : '⏳'} {job.slug}
              </span>
              <span style={{ color: '#999', fontSize: 11 }}>{job.startedAt}</span>
            </div>
            {job.resultUrl && (
              <a href={job.resultUrl} target="_blank" rel="noreferrer" style={{ color: '#3b82f6', fontSize: 11 }}>
                {job.resultUrl}
              </a>
            )}
            {job.error && (
              <div style={{ color: '#ef4444', fontSize: 11 }}>{job.error}</div>
            )}
          </div>
        ))}
      </div>
    </div>
  )
}
