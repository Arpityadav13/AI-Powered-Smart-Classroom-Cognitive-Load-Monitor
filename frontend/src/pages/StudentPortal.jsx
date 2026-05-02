import React, { useState, useEffect, useRef } from 'react'
import { io } from 'socket.io-client'

const BACKEND = import.meta.env.VITE_BACKEND_URL || 'http://localhost:3001'

const LOAD_CONFIG = {
  Low: {
    color: '#22c55e', bg: '#14532d22', border: '#14532d66',
    emoji: '😌', title: 'You\'re doing great!',
    tip:   'Pace is comfortable. Stay focused and keep it up.',
    ring:  '#22c55e',
  },
  Medium: {
    color: '#f59e0b', bg: '#78350f22', border: '#78350f66',
    emoji: '🤔', title: 'Moderate effort',
    tip:   'You\'re engaged! Ask a question if something is unclear.',
    ring:  '#f59e0b',
  },
  High: {
    color: '#ef4444', bg: '#7f1d1d22', border: '#7f1d1d66',
    emoji: '😵', title: 'You seem overloaded',
    tip:   'Take a breath. Raise your hand — it\'s okay to ask for help.',
    ring:  '#ef4444',
  },
  null: {
    color: '#475569', bg: 'transparent', border: '#334155',
    emoji: '👁️', title: 'Waiting for detection…',
    tip:   'Make sure your face is visible to the camera.',
    ring:  '#334155',
  }
}

// ── Animated ring gauge ───────────────────────────────────────────────────────
function RingGauge({ value, color, size = 160 }) {
  const r = (size / 2) - 12
  const circ = 2 * Math.PI * r
  const filled = circ * (value / 100)

  return (
    <svg width={size} height={size} style={{ transform: 'rotate(-90deg)' }}>
      <circle cx={size/2} cy={size/2} r={r}
        fill="none" stroke="#1e293b" strokeWidth={10} />
      <circle cx={size/2} cy={size/2} r={r}
        fill="none" stroke={color} strokeWidth={10}
        strokeDasharray={`${filled} ${circ}`}
        strokeLinecap="round"
        style={{ transition: 'stroke-dasharray 0.6s ease, stroke 0.4s ease' }}
      />
    </svg>
  )
}

// ── Mini signal bars ───────────────────────────────────────────────────────────
function SignalBars({ value, max, color, label }) {
  const pct = Math.min(100, (value / max) * 100)
  return (
    <div style={{ textAlign: 'center' }}>
      <div style={{
        display: 'flex', alignItems: 'flex-end', gap: 3,
        height: 28, justifyContent: 'center', marginBottom: 4,
      }}>
        {[20, 40, 60, 80, 100].map((thresh, i) => (
          <div key={i} style={{
            width: 6,
            height: `${20 + i * 16}%`,
            borderRadius: 3,
            background: pct >= thresh ? color : '#1e293b',
            transition: 'background 0.4s',
          }} />
        ))}
      </div>
      <div style={{ fontSize: '.7rem', color: '#94a3b8' }}>{label}</div>
      <div style={{ fontSize: '.8rem', fontWeight: 600, color, fontFamily: 'monospace' }}>
        {typeof value === 'number' ? value.toFixed(1) : value}
      </div>
    </div>
  )
}

export default function StudentPortal() {
  const [sessionCode,  setSessionCode]  = useState('')
  const [joined,       setJoined]       = useState(false)
  const [studentName,  setStudentName]  = useState('')
  const [nameInput,    setNameInput]    = useState('')
  const [myResult,     setMyResult]     = useState(null)   // latest ML result for this student
  const [mySignals,    setMySignals]    = useState(null)   // raw + window signals
  const [history,      setHistory]      = useState([])     // last 20 labels
  const [fps,          setFps]          = useState(0)
  const [wsStatus,     setWsStatus]     = useState('disconnected')
  const [sessionInfo,  setSessionInfo]  = useState(null)

  const videoRef   = useRef(null)
  const canvasRef  = useRef(null)
  const wsRef      = useRef(null)
  const intervalRef= useRef(null)
  const fpsRef     = useRef(0)

  // FPS counter
  useEffect(() => {
    const t = setInterval(() => { setFps(fpsRef.current); fpsRef.current = 0 }, 1000)
    return () => clearInterval(t)
  }, [])

  const connect = async () => {
    if (!nameInput.trim()) { alert('Enter your name first'); return }
    setStudentName(nameInput.trim())

    const socket = io(BACKEND, { transports: ['websocket'] })
    wsRef.current = socket

    socket.on('connect', () => {
      setWsStatus('connected')
      // Join a student-specific room so teacher can identify this feed
      socket.emit('student:join', {
        sessionId: sessionCode || null,
        name: nameInput.trim(),
      })
    })

    socket.on('disconnect', () => setWsStatus('disconnected'))

    socket.on('session:info', (info) => setSessionInfo(info))

    // ML results come back tagged with socketId
    socket.on('ml:result', ({ faces = [] }) => {
      // The server sends ALL faces — pick the one closest to socket.id
      // Since student sends their own frames, they get their own result back
      if (faces.length > 0) {
        const f = faces[0]  // student tab always sends 1 face
        setMyResult(f.result)
        setMySignals({ raw: f.raw, window: f.window })
        setHistory(h => [...h.slice(-19), f.result?.label ?? null])
        fpsRef.current++
      }
    })

    // Start camera
    try {
      const stream = await navigator.mediaDevices.getUserMedia({
        video: { width: 320, height: 240, facingMode: 'user' }
      })
      videoRef.current.srcObject = stream

      // Send frames at 3 fps (low bandwidth for student devices)
      intervalRef.current = setInterval(() => {
        const v = videoRef.current
        const c = canvasRef.current
        if (!v || !c || v.readyState < 2) return
        c.width = 320; c.height = 240
        c.getContext('2d').drawImage(v, 0, 0, 320, 240)
        socket.emit('frame', { frame: c.toDataURL('image/jpeg', 0.6) })
      }, 333)

      setJoined(true)
    } catch (e) {
      alert('Camera error: ' + e.message)
      socket.disconnect()
    }
  }

  const leave = () => {
    clearInterval(intervalRef.current)
    wsRef.current?.disconnect()
    videoRef.current?.srcObject?.getTracks().forEach(t => t.stop())
    setJoined(false); setMyResult(null); setHistory([])
  }

  const cfg = LOAD_CONFIG[myResult?.name || null]
  const highPct = myResult ? Math.round(myResult.proba[2] * 100) : 0
  const lowPct  = myResult ? Math.round(myResult.proba[0] * 100) : 0

  return (
    <div style={{
      minHeight: '100vh', background: 'var(--bg)',
      display: 'flex', flexDirection: 'column', alignItems: 'center',
      justifyContent: joined ? 'flex-start' : 'center',
      padding: joined ? '24px 16px' : 16,
    }}>
      {/* ── Join screen ─────────────────────────────────────────────────── */}
      {!joined && (
        <div style={{
          width: '100%', maxWidth: 400,
          background: 'var(--card)', border: '1px solid var(--border)',
          borderRadius: 16, padding: 32, textAlign: 'center',
        }}>
          <div style={{ fontSize: '3rem', marginBottom: 12 }}>🧠</div>
          <h1 style={{ fontSize: '1.5rem', fontWeight: 700, marginBottom: 6 }}>
            CogniSense
          </h1>
          <p style={{ color: 'var(--muted)', fontSize: '.88rem', marginBottom: 28 }}>
            Student check-in — your teacher will see your attention level, not your face.
          </p>

          <div style={{ display: 'flex', flexDirection: 'column', gap: 12, textAlign: 'left' }}>
            <div>
              <label style={{ fontSize: '.78rem', color: 'var(--muted)', display: 'block', marginBottom: 4 }}>
                Your name *
              </label>
              <input
                value={nameInput}
                onChange={e => setNameInput(e.target.value)}
                onKeyDown={e => e.key === 'Enter' && connect()}
                placeholder="Enter your name"
                autoFocus
              />
            </div>
            <div>
              <label style={{ fontSize: '.78rem', color: 'var(--muted)', display: 'block', marginBottom: 4 }}>
                Session code (optional)
              </label>
              <input
                value={sessionCode}
                onChange={e => setSessionCode(e.target.value)}
                placeholder="Leave blank to join current session"
              />
            </div>
          </div>

          <button
            onClick={connect}
            style={{
              width: '100%', marginTop: 20, padding: '12px',
              background: '#6366f1', color: 'white', border: 'none',
              borderRadius: 10, fontWeight: 700, fontSize: '1rem',
              cursor: 'pointer', fontFamily: 'inherit',
            }}
          >
            📷 Join Session
          </button>

          <p style={{ fontSize: '.72rem', color: 'var(--hint)', marginTop: 16 }}>
            Your camera is only processed locally. Your teacher sees a load indicator, not a video.
          </p>
        </div>
      )}

      {/* ── Joined: Student Dashboard ────────────────────────────────────── */}
      {joined && (
        <div style={{ width: '100%', maxWidth: 480 }}>

          {/* Header */}
          <div style={{
            display: 'flex', alignItems: 'center', justifyContent: 'space-between',
            marginBottom: 20,
          }}>
            <div>
              <div style={{ fontWeight: 700, fontSize: '1.1rem' }}>
                👋 {studentName}
              </div>
              <div style={{ fontSize: '.75rem', color: 'var(--muted)', marginTop: 2 }}>
                {sessionInfo ? `${sessionInfo.name}` : 'Connected to session'}
                {' · '}
                <span style={{ color: wsStatus === 'connected' ? '#22c55e' : '#ef4444' }}>
                  {wsStatus === 'connected' ? '● Live' : '○ Reconnecting'}
                </span>
              </div>
            </div>
            <button onClick={leave} style={{
              padding: '6px 14px', background: 'transparent', color: 'var(--muted)',
              border: '1px solid var(--border)', borderRadius: 8,
              cursor: 'pointer', fontSize: '.8rem', fontFamily: 'inherit',
            }}>
              Leave
            </button>
          </div>

          {/* Main load card */}
          <div style={{
            background: cfg.bg, border: `2px solid ${cfg.border}`,
            borderRadius: 20, padding: '28px 24px', textAlign: 'center',
            marginBottom: 16, transition: 'all 0.5s ease',
          }}>
            <div style={{ position: 'relative', display: 'inline-block', marginBottom: 16 }}>
              <RingGauge value={highPct} color={cfg.ring} size={160} />
              <div style={{
                position: 'absolute', top: '50%', left: '50%',
                transform: 'translate(-50%, -50%)',
                textAlign: 'center',
              }}>
                <div style={{ fontSize: '2.8rem', lineHeight: 1 }}>{cfg.emoji}</div>
                <div style={{
                  fontSize: '1.5rem', fontWeight: 700,
                  color: cfg.color, fontFamily: 'monospace', marginTop: 2,
                }}>
                  {myResult ? `${highPct}%` : '—'}
                </div>
              </div>
            </div>

            <div style={{ fontSize: '1.2rem', fontWeight: 700, marginBottom: 6 }}>
              {cfg.title}
            </div>
            <div style={{
              fontSize: '.88rem', color: 'var(--muted)',
              background: 'var(--bg2)', borderRadius: 8, padding: '10px 14px',
            }}>
              💡 {cfg.tip}
            </div>

            {/* Probability bars */}
            {myResult && (
              <div style={{
                display: 'flex', justifyContent: 'space-around',
                marginTop: 20, paddingTop: 16, borderTop: '1px solid var(--border)',
              }}>
                {[
                  { label: 'Low',    val: Math.round(myResult.proba[0]*100), color: '#22c55e' },
                  { label: 'Medium', val: Math.round(myResult.proba[1]*100), color: '#f59e0b' },
                  { label: 'High',   val: Math.round(myResult.proba[2]*100), color: '#ef4444' },
                ].map(({ label, val, color }) => (
                  <div key={label} style={{ textAlign: 'center', flex: 1 }}>
                    <div style={{
                      height: 4, background: '#1e293b', borderRadius: 2,
                      margin: '0 8px 6px', overflow: 'hidden',
                    }}>
                      <div style={{
                        height: '100%', width: `${val}%`, background: color,
                        borderRadius: 2, transition: 'width 0.5s ease',
                      }} />
                    </div>
                    <div style={{ fontSize: '.7rem', color: 'var(--muted)' }}>{label}</div>
                    <div style={{ fontSize: '.82rem', fontWeight: 600, color }}>
                      {val}%
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>

          {/* Signal stats row */}
          {mySignals && (
            <div style={{
              background: 'var(--card)', border: '1px solid var(--border)',
              borderRadius: 12, padding: '16px 20px', marginBottom: 16,
            }}>
              <div style={{ fontSize: '.75rem', color: 'var(--muted)', marginBottom: 12,
                textTransform: 'uppercase', letterSpacing: '.05em' }}>
                Your signals
              </div>
              <div style={{ display: 'flex', justifyContent: 'space-around' }}>
                <SignalBars
                  value={mySignals.raw?.ear || 0}
                  max={0.45} color="#22d3ee" label="Eye open"
                />
                <SignalBars
                  value={mySignals.window?.blink_rate_per_min || 0}
                  max={30} color="#a855f7" label="Blinks/min"
                />
                <SignalBars
                  value={(mySignals.window?.gaze_variance || 0) * 100}
                  max={40} color="#f59e0b" label="Gaze move"
                />
                <SignalBars
                  value={mySignals.window?.head_movement || 0}
                  max={60} color="#fb923c" label="Head move"
                />
              </div>
            </div>
          )}

          {/* Mini history strip */}
          {history.length > 0 && (
            <div style={{
              background: 'var(--card)', border: '1px solid var(--border)',
              borderRadius: 12, padding: '12px 16px', marginBottom: 16,
            }}>
              <div style={{ fontSize: '.75rem', color: 'var(--muted)', marginBottom: 8,
                textTransform: 'uppercase', letterSpacing: '.05em' }}>
                Your last {history.length} readings
              </div>
              <div style={{ display: 'flex', gap: 4, alignItems: 'flex-end', height: 32 }}>
                {history.map((label, i) => {
                  const c = label === 2 ? '#ef4444' : label === 1 ? '#f59e0b' : '#22c55e'
                  return (
                    <div key={i} style={{
                      flex: 1, background: c, borderRadius: 2,
                      height: label === 2 ? '100%' : label === 1 ? '65%' : '33%',
                      opacity: 0.4 + (i / history.length) * 0.6,
                      transition: 'height 0.3s',
                    }} />
                  )
                })}
              </div>
              <div style={{ display: 'flex', justifyContent: 'space-between',
                marginTop: 4, fontSize: '.7rem', color: 'var(--hint)' }}>
                <span>Oldest</span><span>Now</span>
              </div>
            </div>
          )}

          {/* Hidden camera */}
          <video ref={videoRef} autoPlay muted playsInline
            style={{ display: 'none' }} />
          <canvas ref={canvasRef} style={{ display: 'none' }} />

          <div style={{ textAlign: 'center', fontSize: '.72rem', color: 'var(--hint)' }}>
            Camera processes locally · {fps} fps · Teacher sees load level only
          </div>
        </div>
      )}
    </div>
  )
}
