interface StatusPanelProps {
  status: 'connected' | 'disconnected' | 'paused' | 'working'
}

export default function StatusPanel({ status }: StatusPanelProps) {
  const statusLabels: Record<string, string> = {
    connected: 'Ansluten',
    working: 'Arbetar',
    paused: 'Pausad',
    disconnected: 'Frånkopplad',
  }

  const statusColors: Record<string, string> = {
    connected: '#22c55e',
    working: '#3b82f6',
    paused: '#eab308',
    disconnected: '#ef4444',
  }

  return (
    <div style={{
      display: 'flex',
      alignItems: 'center',
      gap: 12,
      padding: '16px 20px',
      background: '#f5f5f5',
      borderRadius: 8,
      marginBottom: 16,
    }}>
      <span style={{
        display: 'inline-block',
        width: 12,
        height: 12,
        borderRadius: '50%',
        background: statusColors[status],
      }} />
      <span style={{ fontSize: 14, fontWeight: 500 }}>
        {statusLabels[status]}
      </span>
    </div>
  )
}
