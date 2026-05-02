import React, { useState, useEffect } from 'react'
import { BrowserRouter, Routes, Route, NavLink, useLocation } from 'react-router-dom'
import LiveMonitor    from './pages/LiveMonitor.jsx'
import ClassroomView  from './pages/ClassroomView.jsx'
import Analytics      from './pages/Analytics.jsx'
import SessionHistory from './pages/SessionHistory.jsx'
import Settings       from './pages/Settings.jsx'
import StudentPortal  from './pages/StudentPortal.jsx'
import { useWebSocket } from './hooks/useWebSocket.js'
import { SessionContext } from './context/SessionContext.jsx'

const NAV = [
  { to: '/',          icon: '🎥', label: 'Live Monitor'    },
  { to: '/classroom', icon: '🏫', label: 'Classroom'       },
  { to: '/analytics', icon: '📊', label: 'Analytics'       },
  { to: '/history',   icon: '📋', label: 'History'         },
  { to: '/settings',  icon: '⚙️', label: 'Settings'        },
]

function Sidebar({ session, alertCount }) {
  return (
    <aside style={{
      width: 220, minHeight: '100vh', background: 'var(--bg2)',
      borderRight: '1px solid var(--border)', padding: '24px 0',
      display: 'flex', flexDirection: 'column', flexShrink: 0,
    }}>
      {/* Logo */}
      <div style={{ padding: '0 20px 24px', borderBottom: '1px solid var(--border)' }}>
        <div style={{ fontSize: '1.3rem', fontWeight: 700, letterSpacing: '-0.02em' }}>
          🧠 CogniSense
        </div>
        <div style={{ fontSize: '0.72rem', color: 'var(--muted)', marginTop: 3 }}>
          v2.0 · Multi-student AI
        </div>
      </div>

      {/* Nav */}
      <nav style={{ padding: '16px 12px', flex: 1 }}>
        {NAV.map(({ to, icon, label }) => (
          <NavLink key={to} to={to} end={to === '/'} style={({ isActive }) => ({
            display: 'flex', alignItems: 'center', gap: 10,
            padding: '9px 12px', borderRadius: 8, marginBottom: 4,
            textDecoration: 'none', fontSize: '0.88rem', fontWeight: 500,
            background: isActive ? '#6366f122' : 'transparent',
            color:      isActive ? '#818cf8'   : 'var(--muted)',
            borderLeft: isActive ? '2px solid #6366f1' : '2px solid transparent',
            transition: 'all .15s',
          })}>
            <span style={{ fontSize: 16 }}>{icon}</span>
            {label}
          </NavLink>
        ))}
      </nav>

      {/* Session info */}
      <div style={{ padding: '16px 20px', borderTop: '1px solid var(--border)' }}>
        {session ? (
          <>
            <div style={{ display: 'flex', alignItems: 'center', gap: 6, marginBottom: 6 }}>
              <div className="dot-live" />
              <span style={{ fontSize: '0.78rem', color: 'var(--green)', fontWeight: 600 }}>
                Live
              </span>
            </div>
            <div style={{ fontSize: '0.8rem', color: 'var(--text)', fontWeight: 500 }}>
              {session.name}
            </div>
            <div style={{ fontSize: '0.72rem', color: 'var(--muted)', marginTop: 2 }}>
              Session #{session.id}
            </div>
            {alertCount > 0 && (
              <div style={{ marginTop: 8, padding: '4px 8px', borderRadius: 6,
                background: '#7f1d1d33', color: '#fca5a5', fontSize: '0.75rem' }}>
                ⚠️ {alertCount} alert{alertCount > 1 ? 's' : ''}
              </div>
            )}
          </>
        ) : (
          <div style={{ fontSize: '0.78rem', color: 'var(--hint)' }}>
            No active session
          </div>
        )}
      </div>
    </aside>
  )
}

export default function App() {
  const [session,    setSession]    = useState(null)
  const [faceResults, setFaceResults] = useState({})
  const [classHistory, setClassHistory] = useState([])
  const [alertLog,   setAlertLog]   = useState([])
  const ws = useWebSocket()

  useEffect(() => {
    if (!ws) return
    ws.on('ml:result', ({ faces = [] }) => {
      const map = {}
      faces.forEach(f => { map[f.face_id] = f })
      setFaceResults(map)
      if (faces.length) {
        const avg = (fn) => faces.reduce((s, f) => s + fn(f), 0) / faces.length
        setClassHistory(h => [...h.slice(-119), {
          p_low:    avg(f => f.result.proba[0]),
          p_medium: avg(f => f.result.proba[1]),
          p_high:   avg(f => f.result.proba[2]),
          n:        faces.length,
        }])
      }
    })
    ws.on('ml:alert', (alert) => {
      setAlertLog(log => [...log.slice(-49), { ...alert, ts: new Date().toLocaleTimeString() }])
    })
    return () => { ws.off('ml:result'); ws.off('ml:alert') }
  }, [ws])

  const ctx = { session, setSession, faceResults, classHistory, alertLog, setAlertLog, ws }

  return (
    <SessionContext.Provider value={ctx}>
      <BrowserRouter>
        <Routes>
          {/* ── Student portal — no sidebar ── */}
          <Route path="/student" element={<StudentPortal />} />

          {/* ── Teacher dashboard — with sidebar ── */}
          <Route path="/*" element={
            <div style={{ display: 'flex', minHeight: '100vh' }}>
              <Sidebar session={session} alertCount={alertLog.length} />
              <main style={{ flex: 1, overflowY: 'auto', minHeight: '100vh' }}>
                <Routes>
                  <Route path="/"          element={<LiveMonitor />} />
                  <Route path="/classroom" element={<ClassroomView />} />
                  <Route path="/analytics" element={<Analytics />} />
                  <Route path="/history"   element={<SessionHistory />} />
                  <Route path="/settings"  element={<Settings />} />
                </Routes>
              </main>
            </div>
          } />
        </Routes>
      </BrowserRouter>
    </SessionContext.Provider>
  )
}
