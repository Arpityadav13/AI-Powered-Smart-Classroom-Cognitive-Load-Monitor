import React, { useState, useEffect } from 'react'
import { sessions as sessApi } from '../api/client.js'

export default function SessionHistory() {
  const [allSessions, setAllSessions] = useState([])
  const [expanded,    setExpanded]    = useState(null)
  const [alerts,      setAlerts]      = useState({})

  useEffect(() => { sessApi.getAll().then(setAllSessions) }, [])

  const toggleExpand = async (id) => {
    if (expanded === id) { setExpanded(null); return }
    setExpanded(id)
    if (!alerts[id]) {
      const a = await sessApi.getAlerts(id)
      setAlerts(prev => ({ ...prev, [id]: a }))
    }
  }

  const duration = (sess) => {
    if (!sess.ended_at) return 'In progress'
    const s = new Date(sess.started_at)
    const e = new Date(sess.ended_at)
    const m = Math.round((e - s) / 60000)
    return `${m} min`
  }

  return (
    <div style={{ padding: 24 }}>
      <div style={{ marginBottom: 20 }}>
        <h1 style={{ fontSize: '1.4rem', fontWeight: 700 }}>📋 Session History</h1>
        <p style={{ color: 'var(--muted)', fontSize: '.85rem', marginTop: 2 }}>
          All recorded sessions — click to expand
        </p>
      </div>

      {allSessions.length === 0 ? (
        <div className="card" style={{ textAlign: 'center', padding: 60, color: 'var(--hint)' }}>
          No sessions recorded yet
        </div>
      ) : (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
          {allSessions.map(sess => (
            <div key={sess.id} className="card" style={{ padding: 0, overflow: 'hidden' }}>
              {/* Header row */}
              <div
                onClick={() => toggleExpand(sess.id)}
                style={{
                  display: 'flex', alignItems: 'center', gap: 16,
                  padding: '14px 20px', cursor: 'pointer',
                  borderBottom: expanded === sess.id ? '1px solid var(--border)' : 'none',
                  transition: 'background .15s',
                }}
                onMouseEnter={e => e.currentTarget.style.background = '#1e293b88'}
                onMouseLeave={e => e.currentTarget.style.background = 'transparent'}
              >
                <div style={{
                  width: 36, height: 36, borderRadius: 8,
                  background: '#6366f122', border: '1px solid #6366f144',
                  display: 'flex', alignItems: 'center', justifyContent: 'center',
                  fontWeight: 700, fontSize: '.85rem', color: '#818cf8',
                }}>#{sess.id}</div>

                <div style={{ flex: 1 }}>
                  <div style={{ fontWeight: 600 }}>{sess.name}</div>
                  <div style={{ fontSize: '.78rem', color: 'var(--muted)' }}>
                    {sess.topic || 'No topic'} · {sess.teacher || 'No teacher'}
                  </div>
                </div>

                <div style={{ fontSize: '.78rem', color: 'var(--muted)', textAlign: 'right' }}>
                  <div>{sess.started_at?.slice(0, 10)}</div>
                  <div>{duration(sess)}</div>
                </div>

                <div style={{ color: 'var(--muted)', fontSize: '1.2rem' }}>
                  {expanded === sess.id ? '▲' : '▼'}
                </div>
              </div>

              {/* Expanded content */}
              {expanded === sess.id && (
                <div style={{ padding: 20 }}>
                  <div className="grid-3" style={{ marginBottom: 16 }}>
                    {[
                      ['Started',  sess.started_at?.slice(0, 16).replace('T', ' ')],
                      ['Ended',    sess.ended_at?.slice(0, 16).replace('T', ' ') || '—'],
                      ['Duration', duration(sess)],
                    ].map(([k, v]) => (
                      <div key={k} style={{ background: 'var(--bg2)', borderRadius: 8, padding: 12 }}>
                        <div style={{ fontSize: '.72rem', color: 'var(--muted)', marginBottom: 4 }}>{k}</div>
                        <div style={{ fontWeight: 600, fontSize: '.88rem' }}>{v}</div>
                      </div>
                    ))}
                  </div>

                  {sess.notes && (
                    <div style={{ color: 'var(--muted)', fontSize: '.85rem', marginBottom: 12,
                      padding: '8px 12px', background: 'var(--bg2)', borderRadius: 8 }}>
                      📝 {sess.notes}
                    </div>
                  )}

                  {/* Alerts */}
                  {alerts[sess.id]?.length > 0 && (
                    <div style={{ marginBottom: 12 }}>
                      <div style={{ fontWeight: 600, fontSize: '.85rem', marginBottom: 8 }}>
                        ⚠️ Alerts ({alerts[sess.id].length})
                      </div>
                      <div style={{ display: 'flex', flexDirection: 'column', gap: 5, maxHeight: 180, overflowY: 'auto' }}>
                        {alerts[sess.id].map((a, i) => (
                          <div key={i} className={`alert-item ${a.alert_type === 'CLASS_WIDE' ? 'alert-class' : ''}`}>
                            {a.timestamp?.slice(11, 19)} — {a.message}
                          </div>
                        ))}
                      </div>
                    </div>
                  )}

                  <div style={{ display: 'flex', gap: 8, marginTop: 4 }}>
                    <button className="btn btn-ghost" style={{ fontSize: '.82rem' }}
                      onClick={() => sessApi.exportCSV(sess.id)}>
                      📥 Export CSV
                    </button>
                  </div>
                </div>
              )}
            </div>
          ))}
        </div>
      )}
    </div>
  )
}
