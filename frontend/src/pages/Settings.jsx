import React, { useState, useEffect } from 'react'
import { students as studApi } from '../api/client.js'

export default function Settings() {
  const [students, setStudents] = useState([])
  const [saved,    setSaved]    = useState(false)

  useEffect(() => { studApi.getAll().then(setStudents) }, [])

  const saveMsg = () => { setSaved(true); setTimeout(() => setSaved(false), 2000) }

  const Section = ({ title, children }) => (
    <div className="card" style={{ marginBottom: 16 }}>
      <div style={{ fontWeight: 600, fontSize: '.95rem', marginBottom: 14,
        paddingBottom: 10, borderBottom: '1px solid var(--border)' }}>
        {title}
      </div>
      {children}
    </div>
  )

  const Row = ({ label, desc, children }) => (
    <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between',
      paddingBottom: 12, marginBottom: 12, borderBottom: '1px solid #1e293b' }}>
      <div>
        <div style={{ fontSize: '.88rem', fontWeight: 500 }}>{label}</div>
        {desc && <div style={{ fontSize: '.75rem', color: 'var(--muted)', marginTop: 2 }}>{desc}</div>}
      </div>
      <div style={{ minWidth: 200 }}>{children}</div>
    </div>
  )

  return (
    <div style={{ padding: 24 }}>
      <div style={{ marginBottom: 20 }}>
        <h1 style={{ fontSize: '1.4rem', fontWeight: 700 }}>⚙️ Settings</h1>
        <p style={{ color: 'var(--muted)', fontSize: '.85rem', marginTop: 2 }}>
          Configure detection, alerts, and system behaviour
        </p>
      </div>

      <div className="grid-2" style={{ alignItems: 'start' }}>
        <div>
          <Section title="🎥 Detection">
            <Row label="Max students" desc="Maximum simultaneous faces to track">
              <input type="number" defaultValue={15} min={1} max={30} style={{ width: '100%' }} />
            </Row>
            <Row label="Frame rate" desc="Frames per second sent to ML server">
              <select defaultValue="5" style={{ width: '100%' }}>
                <option value="3">3 fps (low CPU)</option>
                <option value="5">5 fps (balanced)</option>
                <option value="10">10 fps (high accuracy)</option>
              </select>
            </Row>
            <Row label="Privacy mode" desc="Blur faces in the video feed">
              <select defaultValue="off" style={{ width: '100%' }}>
                <option value="off">Off</option>
                <option value="on">On</option>
              </select>
            </Row>
          </Section>

          <Section title="⚠️ Alerts">
            <Row label="High load threshold" desc="P(High) above this → alert">
              <input type="number" defaultValue={60} min={30} max={95} style={{ width: '100%' }} />
            </Row>
            <Row label="Sustained alert (seconds)" desc="Fire alert after N seconds of high load">
              <input type="number" defaultValue={30} min={10} style={{ width: '100%' }} />
            </Row>
            <Row label="Alert cooldown (seconds)" desc="Minimum time between alerts per student">
              <input type="number" defaultValue={60} min={10} style={{ width: '100%' }} />
            </Row>
            <Row label="Sound alerts" desc="Beep when alert fires">
              <select defaultValue="on" style={{ width: '100%' }}>
                <option value="on">Enabled</option>
                <option value="off">Disabled</option>
              </select>
            </Row>
            <Row label="Slack webhook" desc="Post alerts to Slack channel">
              <input type="text" placeholder="https://hooks.slack.com/…" style={{ width: '100%' }} />
            </Row>
          </Section>
        </div>

        <div>
          <Section title="🖥️ Server">
            <Row label="Backend URL" desc="Node.js API server">
              <input defaultValue="http://localhost:3001" style={{ width: '100%' }} />
            </Row>
            <Row label="ML server URL" desc="Python FastAPI server">
              <input defaultValue="http://localhost:8000" style={{ width: '100%' }} />
            </Row>
          </Section>

          <Section title="👥 Student Roster">
            {students.length === 0 ? (
              <p style={{ color: 'var(--muted)', fontSize: '.85rem' }}>
                No students registered — names are auto-assigned during live sessions.
              </p>
            ) : (
              <table className="data-table">
                <thead>
                  <tr><th>ID</th><th>Name</th><th>Seat</th></tr>
                </thead>
                <tbody>
                  {students.map(s => (
                    <tr key={s.id}>
                      <td style={{ color: 'var(--muted)' }}>S{String(s.face_id + 1).padStart(2,'0')}</td>
                      <td>{s.name}</td>
                      <td style={{ color: 'var(--muted)' }}>{s.seat || '—'}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            )}
          </Section>

          <Section title="ℹ️ About">
            <div style={{ fontSize: '.85rem', color: 'var(--muted)', lineHeight: 1.7 }}>
              <div>CogniSense v2.0</div>
              <div>React · Node.js · Python FastAPI · MediaPipe · SQLite</div>
              <div style={{ marginTop: 8 }}>
                <strong style={{ color: 'var(--text)' }}>Stack:</strong><br />
                Frontend: localhost:5173<br />
                Backend:  localhost:3001<br />
                ML Server: localhost:8000
              </div>
            </div>
          </Section>

          <button className="btn btn-primary" onClick={saveMsg} style={{ width: '100%' }}>
            {saved ? '✓ Saved' : '💾 Save Settings'}
          </button>
        </div>
      </div>
    </div>
  )
}
