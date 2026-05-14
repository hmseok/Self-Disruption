'use client'

import { GLASS } from '@/app/utils/ui-tokens'

export default function PlaceholderTab({
  icon,
  title,
  description,
  upcoming,
}: {
  icon: string
  title: string
  description: string
  upcoming?: string[]
}) {
  return (
    <div style={{
      ...GLASS.L4,
      borderRadius: 16,
      padding: 40,
      textAlign: 'center',
      color: '#475569',
    }}>
      <div style={{ fontSize: 60, marginBottom: 12 }}>{icon}</div>
      <h2 style={{ fontSize: 20, fontWeight: 800, color: '#0f2440', margin: 0, marginBottom: 8 }}>{title}</h2>
      <p style={{ fontSize: 13, color: '#64748b', marginBottom: 16 }}>{description}</p>
      {upcoming && upcoming.length > 0 && (
        <div style={{
          display: 'inline-block',
          textAlign: 'left',
          padding: 16,
          background: 'rgba(99,102,241,0.06)',
          border: '1px solid rgba(99,102,241,0.2)',
          borderRadius: 12,
          fontSize: 12,
        }}>
          <div style={{ fontWeight: 700, color: '#4338ca', marginBottom: 8 }}>📋 예정 기능</div>
          {upcoming.map((u) => (
            <div key={u} style={{ marginBottom: 4, color: '#475569' }}>· {u}</div>
          ))}
        </div>
      )}
    </div>
  )
}
