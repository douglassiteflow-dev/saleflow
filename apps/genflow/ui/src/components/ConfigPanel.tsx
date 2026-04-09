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

  if (!isEditing) {
    return (
      <div style={{ marginBottom: 16, padding: 16, background: '#f9f9f9', borderRadius: 8 }}>
        <div style={{ fontSize: 12, color: '#666' }}>Backend URL:</div>
        <div style={{ fontSize: 14, marginBottom: 8 }}>{backendUrl}</div>
        <div style={{ fontSize: 12, color: '#666' }}>API Key:</div>
        <div style={{ fontSize: 14, fontFamily: 'monospace' }}>
          {apiKey ? apiKey.slice(0, 8) + '...' : '(inte satt)'}
        </div>
        <button
          onClick={() => setIsEditing(true)}
          style={{ marginTop: 8, padding: '4px 12px', fontSize: 12 }}
        >
          Redigera
        </button>
      </div>
    )
  }

  return (
    <div style={{ marginBottom: 16, padding: 16, background: '#f9f9f9', borderRadius: 8 }}>
      <label style={{ display: 'block', marginBottom: 8 }}>
        <div style={{ fontSize: 12, color: '#666' }}>Backend URL:</div>
        <input
          type="text"
          value={backendUrl}
          onChange={(e) => setBackendUrl(e.target.value)}
          style={{ width: '100%', padding: 6, fontSize: 14 }}
        />
      </label>
      <label style={{ display: 'block', marginBottom: 8 }}>
        <div style={{ fontSize: 12, color: '#666' }}>API Key:</div>
        <input
          type="password"
          value={apiKey}
          onChange={(e) => setApiKey(e.target.value)}
          style={{ width: '100%', padding: 6, fontSize: 14, fontFamily: 'monospace' }}
        />
      </label>
      <div style={{ display: 'flex', gap: 8 }}>
        <button
          onClick={() => {
            onSave(backendUrl, apiKey)
            setIsEditing(false)
          }}
          style={{ padding: '6px 16px', fontSize: 14 }}
        >
          Spara
        </button>
        <button
          onClick={() => setIsEditing(false)}
          style={{ padding: '6px 16px', fontSize: 14 }}
        >
          Avbryt
        </button>
      </div>
    </div>
  )
}
