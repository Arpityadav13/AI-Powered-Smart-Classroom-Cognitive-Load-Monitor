import React, { useState } from 'react'
import { useSession } from '../context/SessionContext.jsx'
import { students as studApi } from '../api/client.js'

const LABEL_COLOR = { Low: '#22c55e', Medium: '#f59e0b', High: '#ef4444' }
const LABEL_EMOJI = { Low: '🟢', Medium: '🟡', High: '🔴' }

function SeatCell({ fid, data, onRename }) {
  const [editing, setEditing] = useState(false)
  const [nameVal, setNameVal] = useState('')
  const res   = data?.result || {}
  const color = LABEL_COLOR[res.name] || '#475569'
  const emoji = LABEL_EMOJI[res.name] || '⚫'
  const name  = data?.student_name || `S${String(fid + 1).padStart(2, '0')}`
  const conf  = ((res.confidence || 0) * 100).toFixed(0)

  const save = () => {
    if (nameVal.trim()) {
      studApi.update(fid, nameVal.trim())
      onRename(fid, nameVal.trim())
    }
    setEditing(false)
  }

  return (
    <div style={{
      border: `2px solid ${color}`,
      borderRadius: 12,
      background: `${color}11`,
      padding: 12,
      textAlign: 'center',
      cursor: 'pointer',
      minHeight: 90,
      display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', gap: 4,
      transition: 'transform .15s',
    }}
      onDoubleClick={() => { setNameVal(name); setEditing(true) }}
      title="Double-click to rename"
    >
      <div style={{ fontSize: '1.5rem' }}>{emoji}</div>
      {editing ? (
        <input
          autoFocus
          value={nameVal}
          onChange={e => setNameVal(e.target.value)}
          onBlur={save}
          onKeyDown={e => e.key === 'Enter' && save()}
          style={{ width: '90%', textAlign: 'center', fontSize: '.75rem', padding: '2px 4px' }}
          onClick={e => e.stopPropagation()}
        />
      ) : (
        <div style={{ fontSize: '.78rem', fontWeight: 600, color }}>{name}</div>
      )}
      <div style={{ fontSize: '.68rem', color: 'var(--muted)' }}>
        {res.name || '—'} · {conf}%
      </div>
    </div>
  )
}

export default function ClassroomView() {
  const { faceResults, session } = useSession()
  const [names, setNames] = useState({})

  const fids = Object.keys(faceResults).map(Number).sort()
  const COLS  = 5
  const rows  = []
  for (let i = 0; i < fids.length; i += COLS) rows.push(fids.slice(i, i + COLS))

  const total  = fids.length
  const nLow   = fids.filter(f => faceResults[f]?.result?.label === 0).length
  const nMed   = fids.filter(f => faceResults[f]?.result?.label === 1).length
  const nHigh  = fids.filter(f => faceResults[f]?.result?.label === 2).length

  return (
    <div style={{ padding: 24 }}>
      <div style={{ marginBottom: 20 }}>
        <h1 style={{ fontSize: '1.4rem', fontWeight: 700 }}>🏫 Classroom View</h1>
        <p style={{ color: 'var(--muted)', fontSize: '.85rem', marginTop: 2 }}>
          Live seat heatmap · Double-click a seat to rename student
        </p>
      </div>

      {/* Summary pills */}
      <div style={{ display: 'flex', gap: 12, marginBottom: 20 }}>
        {[
          { label: `🟢 Low — ${nLow}/${total}`,    color: '#22c55e' },
          { label: `🟡 Medium — ${nMed}/${total}`,  color: '#f59e0b' },
          { label: `🔴 High — ${nHigh}/${total}`,   color: '#ef4444' },
        ].map(({ label, color }) => (
          <div key={label} style={{
            padding: '6px 16px', borderRadius: 20,
            background: `${color}22`, border: `1px solid ${color}55`,
            fontSize: '.82rem', fontWeight: 600, color,
          }}>{label}</div>
        ))}
        <div style={{ marginLeft: 'auto', fontSize: '.82rem', color: 'var(--muted)', alignSelf: 'center' }}>
          {session ? `Session: ${session.name}` : 'No active session'}
        </div>
      </div>

      {/* Heatmap grid */}
      {rows.length === 0 ? (
        <div className="card" style={{ textAlign: 'center', padding: 60, color: 'var(--hint)' }}>
          Start a session and point the camera at students to see the heatmap
        </div>
      ) : (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
          {rows.map((row, ri) => (
            <div key={ri} style={{ display: 'grid', gridTemplateColumns: `repeat(${COLS}, 1fr)`, gap: 12 }}>
              {row.map(fid => (
                <SeatCell
                  key={fid}
                  fid={fid}
                  data={{ ...faceResults[fid], student_name: names[fid] || faceResults[fid]?.student_name }}
                  onRename={(f, n) => setNames(prev => ({ ...prev, [f]: n }))}
                />
              ))}
              {/* Fill empty cells */}
              {Array.from({ length: COLS - row.length }).map((_, i) => (
                <div key={`empty-${i}`} style={{
                  borderRadius: 12, background: '#1e293b44',
                  border: '1px dashed var(--border)', minHeight: 90,
                }} />
              ))}
            </div>
          ))}
        </div>
      )}

      {/* Teacher board row */}
      {rows.length > 0 && (
        <div style={{ marginTop: 20, textAlign: 'center' }}>
          <div style={{
            display: 'inline-block', padding: '8px 40px',
            background: 'var(--card)', border: '1px solid var(--border)',
            borderRadius: 8, fontSize: '.8rem', color: 'var(--muted)',
          }}>
            🖥 Teacher's Board / Projector Screen
          </div>
        </div>
      )}
    </div>
  )
}
