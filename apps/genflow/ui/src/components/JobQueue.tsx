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

const STATUS_BADGE: Record<Job['status'], { label: string; cls: string; icon: string }> = {
  running: {
    label: 'Pågår',
    cls: 'bg-indigo-50 text-indigo-700 border-indigo-200',
    icon: '⏳',
  },
  ok: {
    label: 'Klar',
    cls: 'bg-emerald-50 text-emerald-700 border-emerald-200',
    icon: '✓',
  },
  failed: {
    label: 'Misslyckades',
    cls: 'bg-red-50 text-red-700 border-red-200',
    icon: '✗',
  },
}

export default function JobQueue({ jobs }: JobQueueProps) {
  return (
    <div className="rounded-[14px] bg-[var(--color-bg-primary)] p-[var(--spacing-card)] shadow-[0_1px_3px_rgba(0,0,0,0.04)] border">
      <div className="mb-3 flex items-baseline justify-between">
        <h2 className="text-[11px] font-medium uppercase tracking-[1px] text-[var(--color-text-secondary)]">
          Jobb
        </h2>
        <span className="text-[10px] text-[var(--color-text-secondary)]">
          {jobs.length === 0 ? 'inga' : `${jobs.length} st`}
        </span>
      </div>

      {jobs.length === 0 ? (
        <div className="rounded-[10px] border border-dashed border-[var(--color-border)] p-6 text-center text-[13px] text-[var(--color-text-secondary)]">
          Inga jobb än — väntar på pending GenerationJob från Saleflow
        </div>
      ) : (
        <div className="flex flex-col gap-2">
          {jobs.map((job) => {
            const badge = STATUS_BADGE[job.status]
            return (
              <div
                key={`${job.slug}-${job.startedAt}`}
                className="rounded-[10px] border bg-[var(--color-bg-panel)] p-3"
              >
                <div className="flex items-center justify-between gap-2">
                  <span className="truncate text-[13px] font-medium text-[var(--color-text-primary)]">
                    {job.slug}
                  </span>
                  <span
                    className={`inline-flex shrink-0 items-center gap-1 rounded-full border px-2 py-0.5 text-[11px] font-medium ${badge.cls}`}
                  >
                    <span>{badge.icon}</span>
                    {badge.label}
                  </span>
                </div>
                <div className="mt-1 text-[11px] text-[var(--color-text-secondary)]">
                  startad {job.startedAt}
                </div>
                {job.resultUrl && (
                  <a
                    href={job.resultUrl}
                    target="_blank"
                    rel="noreferrer"
                    className="mt-1 inline-block truncate text-[11px] text-[var(--color-accent)] hover:underline"
                  >
                    {job.resultUrl}
                  </a>
                )}
                {job.error && (
                  <div className="mt-1 text-[11px] text-[var(--color-danger)]">{job.error}</div>
                )}
              </div>
            )
          })}
        </div>
      )}
    </div>
  )
}
