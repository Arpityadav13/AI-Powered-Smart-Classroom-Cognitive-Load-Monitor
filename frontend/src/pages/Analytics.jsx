import React, { useState, useEffect } from 'react'
import {
  AreaChart, Area, BarChart, Bar, LineChart, Line,
  XAxis, YAxis, Tooltip, Legend, ResponsiveContainer, Cell,
} from 'recharts'
import { useSession } from '../context/SessionContext.jsx'
import { sessions as sessApi, analytics as analyticsApi } from '../api/client.js'

const CHART_STYLE = {
  contentStyle: { background:'var(--card)', border:'1px solid var(--border)', borderRadius:8, fontSize:12 }
}

function StatCard({ val, label, color }) {
  return (
    <div className="metric-card">
      <div className="metric-val" style={{ color }}>{val}</div>
      <div className="metric-lbl">{label}</div>
    </div>
  )
}

export default function Analytics() {
  const { session } = useSession()
  const [allSessions, setAllSessions] = useState([])
  const [selectedId,  setSelectedId]  = useState(null)
  const [data,        setData]        = useState(null)
  const [loading,     setLoading]     = useState(false)

  useEffect(() => {
    sessApi.getAll().then(s => {
      setAllSessions(s)
      if (s.length > 0) setSelectedId(s[0].id)
    })
  }, [])

  useEffect(() => {
    if (!selectedId) return
    setLoading(true)
    analyticsApi.summary(selectedId)
      .then(setData)
      .finally(() => setLoading(false))
  }, [selectedId])

  const s = data?.summary || {}
  const students = data?.students || []
  const timeline = data?.timeLine || []

  return (
    <div style={{ padding: 24 }}>
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 20 }}>
        <div>
          <h1 style={{ fontSize: '1.4rem', fontWeight: 700 }}>📊 Analytics</h1>
          <p style={{ color: 'var(--muted)', fontSize: '.85rem', marginTop: 2 }}>Session insights and trends</p>
        </div>
        <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
          <select
            value={selectedId || ''}
            onChange={e => setSelectedId(Number(e.target.value))}
            style={{ width: 280 }}
          >
            {allSessions.map(s => (
              <option key={s.id} value={s.id}>
                #{s.id} — {s.name} ({s.started_at?.slice(0, 10)})
              </option>
            ))}
          </select>
          {selectedId && (
            <button className="btn btn-ghost" onClick={() => sessApi.exportCSV(selectedId)}>
              📥 Export CSV
            </button>
          )}
        </div>
      </div>

      {loading && (
        <div style={{ display: 'flex', justifyContent: 'center', padding: 60 }}>
          <div className="spinner" style={{ width: 32, height: 32 }} />
        </div>
      )}

      {!loading && data && (
        <>
          {/* Summary metrics */}
          <div className="grid-4" style={{ marginBottom: 20 }}>
            <StatCard val={s.unique_students || 0} label="Students"     color="#22d3ee" />
            <StatCard val={`${s.pct_low || 0}%`}  label="Avg Low"      color="#22c55e" />
            <StatCard val={`${s.pct_medium || 0}%`}label="Avg Medium"   color="#f59e0b" />
            <StatCard val={`${s.pct_high || 0}%`} label="Avg High"     color="#ef4444" />
          </div>

          {/* Load over time */}
          {timeline.length > 0 && (
            <div className="card" style={{ marginBottom: 20 }}>
              <div style={{ fontWeight: 600, marginBottom: 12 }}>Cognitive Load Over Time</div>
              <ResponsiveContainer width="100%" height={200}>
                <AreaChart data={timeline}>
                  <XAxis dataKey="time_bin" tick={{ fontSize: 11, fill: 'var(--muted)' }} />
                  <YAxis domain={[0, 100]} tick={{ fontSize: 11, fill: 'var(--muted)' }} unit="%" />
                  <Tooltip {...CHART_STYLE} formatter={v => `${v}%`} />
                  <Legend wrapperStyle={{ fontSize: 12 }} />
                  <Area type="monotone" dataKey="avg_low"    name="Low"    stackId="1" stroke="#22c55e" fill="#22c55e33" />
                  <Area type="monotone" dataKey="avg_medium" name="Medium" stackId="1" stroke="#f59e0b" fill="#f59e0b33" />
                  <Area type="monotone" dataKey="avg_high"   name="High"   stackId="1" stroke="#ef4444" fill="#ef444433" />
                </AreaChart>
              </ResponsiveContainer>
            </div>
          )}

          <div className="grid-2" style={{ marginBottom: 20 }}>
            {/* Per-student bar */}
            {students.length > 0 && (
              <div className="card">
                <div style={{ fontWeight: 600, marginBottom: 12 }}>Per-Student Breakdown</div>
                <ResponsiveContainer width="100%" height={200}>
                  <BarChart data={students} layout="vertical">
                    <XAxis type="number" domain={[0, 100]} tick={{ fontSize: 11, fill: 'var(--muted)' }} unit="%" />
                    <YAxis type="category" dataKey="student_name" tick={{ fontSize: 11, fill: 'var(--muted)' }} width={80} />
                    <Tooltip {...CHART_STYLE} formatter={v => `${v}%`} />
                    <Legend wrapperStyle={{ fontSize: 12 }} />
                    <Bar dataKey="pct_low"    name="Low"    stackId="a" fill="#22c55e" />
                    <Bar dataKey="pct_medium" name="Medium" stackId="a" fill="#f59e0b" />
                    <Bar dataKey="pct_high"   name="High"   stackId="a" fill="#ef4444" radius={[0, 4, 4, 0]} />
                  </BarChart>
                </ResponsiveContainer>
              </div>
            )}

            {/* Extra stats */}
            <div className="card">
              <div style={{ fontWeight: 600, marginBottom: 12 }}>Signal Statistics</div>
              <table className="data-table">
                <tbody>
                  {[
                    ['Total readings',   s.total_readings || 0],
                    ['Avg confidence',   `${s.avg_confidence || 0}%`],
                    ['Avg blink rate',   `${s.avg_blink_rate || 0}/min`],
                    ['Avg gaze variance',`${(s.avg_gaze_var || 0).toFixed(3)}`],
                    ['Alerts fired',     data.alertCount || 0],
                  ].map(([k, v]) => (
                    <tr key={k}>
                      <td style={{ color: 'var(--muted)' }}>{k}</td>
                      <td style={{ fontWeight: 600, textAlign: 'right' }}>{v}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>

          {/* Student table */}
          {students.length > 0 && (
            <div className="card">
              <div style={{ fontWeight: 600, marginBottom: 12 }}>Detailed Student Table</div>
              <table className="data-table">
                <thead>
                  <tr>
                    <th>Student</th><th>Readings</th>
                    <th>Low %</th><th>Medium %</th><th>High %</th>
                    <th>Avg High</th><th>Peak High</th>
                  </tr>
                </thead>
                <tbody>
                  {students.map(s => (
                    <tr key={s.face_id}>
                      <td>{s.student_name}</td>
                      <td>{s.readings}</td>
                      <td style={{ color: '#22c55e' }}>{s.pct_low}%</td>
                      <td style={{ color: '#f59e0b' }}>{s.pct_medium}%</td>
                      <td style={{ color: '#ef4444' }}>{s.pct_high}%</td>
                      <td>{s.avg_high_prob}%</td>
                      <td style={{ color: s.peak_high_prob > 70 ? '#ef4444' : 'var(--text)' }}>
                        {s.peak_high_prob}%
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </>
      )}

      {!loading && !data && (
        <div className="card" style={{ textAlign: 'center', padding: 60, color: 'var(--hint)' }}>
          No session data yet — run a live session first
        </div>
      )}
    </div>
  )
}
