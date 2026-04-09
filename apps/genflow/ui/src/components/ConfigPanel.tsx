import { useState } from 'react'

interface ConfigPanelProps {
  initialBackendUrl: string
  initialApiKey: string
  onSave: (backendUrl: string, apiKey: string) => void
}

export default function ConfigPanel({ initialBackendUrl, initialApiKey, onSave }: ConfigPanelProps) {
  const [backendUrl, setBackendUrl] = useState(initialBackendUrl)
  const [apiKey, setApiKey] = useState(initialApiKey)
  const [isEditing, setIsEditing] = useState(false)

  return (
    <div className="rounded-[14px] bg-[var(--color-bg-primary)] p-[var(--spacing-card)] shadow-[0_1px_3px_rgba(0,0,0,0.04)] border">
      <div className="mb-3 flex items-baseline justify-between">
        <h2 className="text-[11px] font-medium uppercase tracking-[1px] text-[var(--color-text-secondary)]">
          Konfiguration
        </h2>
        {!isEditing && (
          <button
            onClick={() => setIsEditing(true)}
            className="text-[11px] font-medium text-[var(--color-accent)] hover:text-[var(--color-accent-hover)]"
          >
            Redigera
          </button>
        )}
      </div>

      {!isEditing ? (
        <div className="space-y-3">
          <div>
            <div className="text-[10px] uppercase tracking-wide text-[var(--color-text-secondary)]">
              Backend
            </div>
            <div className="mt-0.5 text-[13px] text-[var(--color-text-primary)]">{backendUrl}</div>
          </div>
          <div>
            <div className="text-[10px] uppercase tracking-wide text-[var(--color-text-secondary)]">
              API-nyckel
            </div>
            <div className="mt-0.5 font-mono text-[12px] text-[var(--color-text-primary)]">
              {apiKey ? `${apiKey.slice(0, 8)}...` : <span className="text-[var(--color-danger)]">inte satt</span>}
            </div>
          </div>
        </div>
      ) : (
        <div className="space-y-3">
          <label className="block">
            <div className="text-[10px] uppercase tracking-wide text-[var(--color-text-secondary)]">
              Backend
            </div>
            <input
              type="text"
              value={backendUrl}
              onChange={(e) => setBackendUrl(e.target.value)}
              className="mt-1 w-full rounded-[6px] border bg-[var(--color-bg-panel)] px-[var(--spacing-input-x)] py-[var(--spacing-input-y)] text-[13px] focus:outline-none focus:ring-2 focus:ring-indigo-500"
            />
          </label>
          <label className="block">
            <div className="text-[10px] uppercase tracking-wide text-[var(--color-text-secondary)]">
              API-nyckel
            </div>
            <input
              type="password"
              value={apiKey}
              onChange={(e) => setApiKey(e.target.value)}
              className="mt-1 w-full rounded-[6px] border bg-[var(--color-bg-panel)] px-[var(--spacing-input-x)] py-[var(--spacing-input-y)] font-mono text-[12px] focus:outline-none focus:ring-2 focus:ring-indigo-500"
            />
          </label>
          <div className="flex gap-2 pt-1">
            <button
              onClick={() => {
                onSave(backendUrl, apiKey)
                setIsEditing(false)
              }}
              className="rounded-[6px] bg-indigo-600 px-[var(--spacing-button-x)] py-[var(--spacing-button-y)] text-[13px] font-medium text-white hover:bg-indigo-700"
            >
              Spara
            </button>
            <button
              onClick={() => setIsEditing(false)}
              className="rounded-[6px] border border-[var(--color-border-input)] bg-white px-[var(--spacing-button-x)] py-[var(--spacing-button-y)] text-[13px] font-medium text-[var(--color-text-primary)] hover:bg-[var(--color-bg-panel)]"
            >
              Avbryt
            </button>
          </div>
        </div>
      )}
    </div>
  )
}
