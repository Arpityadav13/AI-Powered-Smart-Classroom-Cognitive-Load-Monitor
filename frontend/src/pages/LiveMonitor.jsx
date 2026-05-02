import React, { useRef, useState, useEffect, useCallback } from 'react'
import { AreaChart, Area, XAxis, YAxis, Tooltip, ResponsiveContainer } from 'recharts'
import { useSession } from '../context/SessionContext.jsx'
import { sessions as sessApi } from '../api/client.js'
import StudentShareModal from '../components/StudentShareModal.jsx'

const LABEL_COLOR = { Low: '#22c55e', Medium: '#f59e0b', High: '#ef4444' }
const LABEL_EMOJI = { Low: '🟢', Medium: '🟡', High: '🔴' }

function MetricCard({ val, label, color }) {
  return (
    <div style={{
      background: '#1e293b', border: '1px solid #334155',
      borderRadius: 10, padding: '14px 16px', textAlign: 'center',
    }}>
      <div style={{ fontSize: '1.8rem', fontWeight: 700, fontFamily: 'monospace', color, lineHeight: 1.1 }}>{val}</div>
      <div style={{ fontSize: '0.7rem', color: '#94a3b8', marginTop: 4, textTransform: 'uppercase', letterSpacing: '0.06em' }}>{label}</div>
    </div>
  )
}

function StudentCard({ fid, data }) {
  const name  = data.student_name || `Student ${String(fid + 1).padStart(2,'0')}`
  const res   = data.result || {}
  const color = LABEL_COLOR[res.name] || '#64748b'
  const emoji = LABEL_EMOJI[res.name] || '⚪'
  const conf  = ((res.confidence || 0) * 100).toFixed(0)
  const ear   = (data.raw?.ear || 0).toFixed(2)
  const bpm   = (data.window?.blink_rate_per_min || 0).toFixed(0)

  return (
    <div style={{
      background: '#0f172a', border: `1px solid ${color}44`,
      borderLeft: `3px solid ${color}`, borderRadius: 10,
      padding: '10px 14px', display: 'flex', alignItems: 'center', gap: 12,
    }}>
      <div style={{
        width: 38, height: 38, borderRadius: '50%',
        background: `${color}22`, border: `2px solid ${color}`,
        display: 'flex', alignItems: 'center', justifyContent: 'center',
        fontWeight: 700, fontSize: '.82rem', color, flexShrink: 0,
      }}>S{String(fid + 1).padStart(2,'0')}</div>
      <div style={{ flex: 1 }}>
        <div style={{ fontWeight: 600, fontSize: '.88rem', marginBottom: 2 }}>{name}</div>
        <div style={{ fontSize: '.72rem', color: '#94a3b8' }}>
          EAR: {ear} · Blinks: {bpm}/min · Conf: {conf}%
        </div>
        <div style={{ display: 'flex', gap: 3, marginTop: 5 }}>
          {[0,1,2].map(i => {
            const colors = ['#22c55e','#f59e0b','#ef4444']
            const val = (res.proba?.[i] || 0) * 100
            return (
              <div key={i} style={{ flex: 1 }}>
                <div style={{ height: 4, background: '#1e293b', borderRadius: 2, overflow: 'hidden' }}>
                  <div style={{
                    height: '100%', width: `${val}%`, background: colors[i],
                    borderRadius: 2, transition: 'width 0.4s ease',
                  }} />
                </div>
              </div>
            )
          })}
        </div>
      </div>
      <div style={{
        padding: '4px 12px', borderRadius: 20,
        background: `${color}22`, border: `1px solid ${color}55`,
        fontWeight: 700, fontSize: '.82rem', color, flexShrink: 0,
      }}>{emoji} {res.name || '—'}</div>
    </div>
  )
}

export default function LiveMonitor() {
  const { session, setSession, faceResults, classHistory, alertLog, ws } = useSession()
  const videoRef    = useRef(null)
  const canvasRef   = useRef(null)
  const overlayRef  = useRef(null)
  const intervalRef = useRef(null)
  const streamRef   = useRef(null)
  const animRef     = useRef(null)
  const fpsRef      = useRef(0)

  const [streaming,  setStreaming]  = useState(false)
  const [sessName,   setSessName]   = useState('Class Session')
  const [sessTopic,  setSessTopic]  = useState('')
  const [teacher,    setTeacher]    = useState('')
  const [fps,        setFps]        = useState(0)
  const [showShare,  setShowShare]  = useState(false)
  const [wsStatus,   setWsStatus]   = useState('disconnected')

  useEffect(() => {
    if (!ws) return
    const onConnect    = () => setWsStatus('connected')
    const onDisconnect = () => setWsStatus('disconnected')
    ws.on('connect', onConnect)
    ws.on('disconnect', onDisconnect)
    if (ws.connected) setWsStatus('connected')
    return () => { ws.off('connect', onConnect); ws.off('disconnect', onDisconnect) }
  }, [ws])

  // FPS counter
  useEffect(() => {
    const t = setInterval(() => { setFps(fpsRef.current); fpsRef.current = 0 }, 1000)
    return () => clearInterval(t)
  }, [])

  // Draw overlay boxes on canvas over live video
  const drawOverlay = useCallback(() => {
    const video   = videoRef.current
    const canvas  = overlayRef.current
    if (!canvas || !video || video.readyState < 2) {
      animRef.current = requestAnimationFrame(drawOverlay)
      return
    }

    canvas.width  = video.videoWidth  || 640
    canvas.height = video.videoHeight || 480
    const ctx = canvas.getContext('2d')
    ctx.clearRect(0, 0, canvas.width, canvas.height)

    // Draw face boxes from ML results
    Object.entries(faceResults).forEach(([fid, data]) => {
      const bbox  = data.bbox
      const res   = data.result || {}
      const color = LABEL_COLOR[res.name] || '#64748b'
      const name  = data.student_name || `S${Number(fid)+1}`

      if (bbox && bbox.length === 4) {
        const [x1, y1, x2, y2] = bbox
        // Scale bbox to canvas size (ML runs on 320x240, video is 640x480)
        const scaleX = canvas.width / 320
        const scaleY = canvas.height / 240
        const sx1 = x1 * scaleX, sy1 = y1 * scaleY
        const sx2 = x2 * scaleX, sy2 = y2 * scaleY

        // Box
        ctx.strokeStyle = color
        ctx.lineWidth   = 2
        ctx.strokeRect(sx1, sy1, sx2-sx1, sy2-sy1)

        // Label background
        ctx.fillStyle = color
        ctx.fillRect(sx1, sy1 - 24, 140, 24)

        // Label text
        ctx.fillStyle   = '#000'
        ctx.font        = 'bold 12px monospace'
        ctx.fillText(
          `${name} · ${res.name || '?'} ${((res.confidence||0)*100).toFixed(0)}%`,
          sx1 + 4, sy1 - 6
        )

        // EAR indicator dot
        const ear = data.raw?.ear || 0
        ctx.beginPath()
        ctx.arc(sx2 - 8, sy1 + 8, 6, 0, Math.PI * 2)
        ctx.fillStyle = ear < 0.20 ? '#ef4444' : '#22c55e'
        ctx.fill()
      }
    })

    fpsRef.current++
    animRef.current = requestAnimationFrame(drawOverlay)
  }, [faceResults])

  useEffect(() => {
    if (streaming) {
      animRef.current = requestAnimationFrame(drawOverlay)
    }
    return () => cancelAnimationFrame(animRef.current)
  }, [streaming, drawOverlay])

  const startSession = async () => {
    try {
      const sess = await sessApi.create({ name: sessName || 'Session', topic: sessTopic, teacher })
      setSession(sess)
      ws?.emit('session:start', { sessionId: sess.id })

      const stream = await navigator.mediaDevices.getUserMedia({
        video: { width: { ideal: 640 }, height: { ideal: 480 }, facingMode: 'user' }
      })
      videoRef.current.srcObject = stream
      streamRef.current = stream
      setStreaming(true)

      // Send frames to ML server at 5fps
      intervalRef.current = setInterval(() => {
        const v = videoRef.current, c = canvasRef.current
        if (!v || !c || v.readyState < 2) return
        c.width = 320; c.height = 240
        c.getContext('2d').drawImage(v, 0, 0, 320, 240)
        ws?.emit('frame', { frame: c.toDataURL('image/jpeg', 0.7), annotated: false })
      }, 200)

    } catch (e) {
      alert('Camera error: ' + e.message)
    }
  }

  const endSession = async () => {
    clearInterval(intervalRef.current)
    cancelAnimationFrame(animRef.current)
    streamRef.current?.getTracks().forEach(t => t.stop())
    ws?.emit('session:end', { sessionId: session?.id })
    if (session?.id) await sessApi.end(session.id)
    setSession(null)
    setStreaming(false)
  }

  const faces     = Object.entries(faceResults)
  const nStudents = faces.length
  const nHigh     = faces.filter(([,f]) => f.result?.label === 2).length
  const nLow      = faces.filter(([,f]) => f.result?.label === 0).length
  const avgConf   = nStudents
    ? (faces.reduce((s,[,f]) => s + (f.result?.confidence||0), 0) / nStudents * 100).toFixed(0)
    : 0

  return (
    <div style={{ padding: 24, minHeight: '100vh' }}>

      {/* Header */}
      <div style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', marginBottom: 20, flexWrap: 'wrap', gap: 12 }}>
        <div>
          <h1 style={{ fontSize: '1.5rem', fontWeight: 700, marginBottom: 4 }}>🎥 Live Monitor</h1>
          <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
            <div style={{
              width: 8, height: 8, borderRadius: '50%',
              background: wsStatus === 'connected' ? '#22c55e' : '#ef4444',
            }} />
            <span style={{ fontSize: '.82rem', color: '#94a3b8' }}>
              {wsStatus === 'connected' ? 'Connected' : 'Disconnected'}
              {streaming && ` · ${fps} fps`}
            </span>
            {session && (
              <span style={{
                fontSize: '.75rem', padding: '2px 8px', borderRadius: 20,
                background: '#6366f122', color: '#818cf8', border: '1px solid #6366f133',
              }}>Session #{session.id}: {session.name}</span>
            )}
          </div>
        </div>
        <div style={{ display: 'flex', gap: 8 }}>
          {session && (
            <button onClick={() => setShowShare(true)} style={{
              padding: '8px 16px', background: 'transparent', color: '#94a3b8',
              border: '1px solid #334155', borderRadius: 8, cursor: 'pointer',
              fontFamily: 'inherit', fontSize: '.85rem', fontWeight: 600,
            }}>📱 Share with Students</button>
          )}
          {!streaming ? (
            <button onClick={startSession} style={{
              padding: '8px 20px', background: '#6366f1', color: 'white',
              border: 'none', borderRadius: 8, cursor: 'pointer',
              fontFamily: 'inherit', fontSize: '.88rem', fontWeight: 700,
            }}>▶ Start Session</button>
          ) : (
            <button onClick={endSession} style={{
              padding: '8px 20px', background: '#ef4444', color: 'white',
              border: 'none', borderRadius: 8, cursor: 'pointer',
              fontFamily: 'inherit', fontSize: '.88rem', fontWeight: 700,
            }}>⏹ End Session</button>
          )}
        </div>
      </div>

      {/* Session setup */}
      {!streaming && (
        <div style={{
          background: '#1e293b', border: '1px solid #334155',
          borderRadius: 10, padding: 16, marginBottom: 20,
        }}>
          <div style={{ fontWeight: 600, marginBottom: 12 }}>Session Setup</div>
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: 12 }}>
            {[
              ['Session name',   sessName,   setSessName,   'Math Lecture'],
              ['Topic',          sessTopic,  setSessTopic,  'Algebra'],
              ['Teacher',        teacher,    setTeacher,    'Mr. Singh'],
            ].map(([label, val, setter, ph]) => (
              <div key={label}>
                <div style={{ fontSize: '.75rem', color: '#94a3b8', marginBottom: 4 }}>{label}</div>
                <input value={val} onChange={e => setter(e.target.value)} placeholder={ph}
                  style={{
                    width: '100%', padding: '8px 12px', background: '#0f172a',
                    border: '1px solid #334155', borderRadius: 8, color: '#f1f5f9',
                    fontSize: '.88rem', fontFamily: 'inherit', outline: 'none',
                  }} />
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Metrics */}
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4,1fr)', gap: 12, marginBottom: 20 }}>
        <MetricCard val={nStudents}     label="Students"       color="#22d3ee" />
        <MetricCard val={nHigh}         label="High Load"      color="#ef4444" />
        <MetricCard val={nLow}          label="Low Load"       color="#22c55e" />
        <MetricCard val={`${avgConf}%`} label="Avg Confidence" color="#a855f7" />
      </div>

      {/* Main grid */}
      <div style={{ display: 'grid', gridTemplateColumns: '1.6fr 1fr', gap: 20 }}>

        {/* Left */}
        <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>

          {/* Live video with overlay */}
          <div style={{
            background: '#1e293b', border: '1px solid #334155',
            borderRadius: 10, overflow: 'hidden',
          }}>
            <div style={{
              display: 'flex', alignItems: 'center', justifyContent: 'space-between',
              padding: '10px 16px', borderBottom: '1px solid #334155',
            }}>
              <span style={{ fontWeight: 600, fontSize: '.88rem' }}>📷 Live Camera Feed</span>
              {streaming && (
                <span style={{ fontSize: '.75rem', color: '#22c55e', display: 'flex', alignItems: 'center', gap: 4 }}>
                  <span style={{ width: 6, height: 6, borderRadius: '50%', background: '#22c55e', display: 'inline-block' }} />
                  Live · {fps} fps
                </span>
              )}
            </div>
            <div style={{ background: '#000', position: 'relative', minHeight: 300 }}>
              {/* Actual live video */}
              <video
                ref={videoRef}
                autoPlay muted playsInline
                style={{
                  width: '100%', display: 'block',
                  visibility: streaming ? 'visible' : 'hidden',
                }}
              />
              {/* Canvas overlay for face boxes — sits on top of video */}
              <canvas
                ref={overlayRef}
                style={{
                  position: 'absolute', top: 0, left: 0,
                  width: '100%', height: '100%',
                  pointerEvents: 'none',
                  display: streaming ? 'block' : 'none',
                }}
              />
              {!streaming && (
                <div style={{
                  position: 'absolute', inset: 0,
                  display: 'flex', alignItems: 'center', justifyContent: 'center',
                  color: '#475569', fontSize: '.9rem', textAlign: 'center',
                }}>
                  Fill session details above<br/>then press ▶ Start Session
                </div>
              )}
            </div>
          </div>

          {/* Hidden canvas for frame capture */}
          <canvas ref={canvasRef} style={{ display: 'none' }} />

          {/* Trend chart */}
          <div style={{
            background: '#1e293b', border: '1px solid #334155',
            borderRadius: 10, padding: 16,
          }}>
            <div style={{ fontWeight: 600, fontSize: '.88rem', marginBottom: 12 }}>
              📈 Class Cognitive Load Trend
            </div>
            {classHistory.length > 2 ? (
              <ResponsiveContainer width="100%" height={150}>
                <AreaChart data={classHistory.slice(-60)}>
                  <XAxis hide />
                  <YAxis domain={[0,1]} hide />
                  <Tooltip
                    formatter={v => `${(v*100).toFixed(0)}%`}
                    contentStyle={{ background:'#1e293b', border:'1px solid #334155', borderRadius:8, fontSize:12 }}
                  />
                  <Area type="monotone" dataKey="p_low"    stackId="1" stroke="#22c55e" fill="#22c55e33" name="Low" />
                  <Area type="monotone" dataKey="p_medium" stackId="1" stroke="#f59e0b" fill="#f59e0b33" name="Medium" />
                  <Area type="monotone" dataKey="p_high"   stackId="1" stroke="#ef4444" fill="#ef444433" name="High" />
                </AreaChart>
              </ResponsiveContainer>
            ) : (
              <div style={{ color: '#475569', fontSize: '.85rem', textAlign: 'center', padding: '24px 0' }}>
                {streaming ? 'Collecting data...' : 'Start a session to see the trend'}
              </div>
            )}
          </div>
        </div>

        {/* Right */}
        <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>

          {/* Students */}
          <div style={{
            background: '#1e293b', border: '1px solid #334155',
            borderRadius: 10, padding: 16, flex: 1,
          }}>
            <div style={{ fontWeight: 600, fontSize: '.88rem', marginBottom: 12, display: 'flex', justifyContent: 'space-between' }}>
              <span>👥 Detected Students</span>
              {nStudents > 0 && <span style={{ fontSize: '.75rem', color: '#94a3b8', fontWeight: 400 }}>{nStudents} detected</span>}
            </div>
            <div style={{ display: 'flex', flexDirection: 'column', gap: 8, maxHeight: 360, overflowY: 'auto' }}>
              {faces.length === 0 ? (
                <div style={{ color: '#475569', fontSize: '.85rem', textAlign: 'center', padding: '30px 0' }}>
                  {streaming ? '👀 Looking for faces...' : 'Start a session'}
                </div>
              ) : (
                faces.map(([fid, data]) => (
                  <StudentCard key={fid} fid={Number(fid)} data={data} />
                ))
              )}
            </div>
          </div>

          {/* Alerts */}
          <div style={{
            background: '#1e293b', border: '1px solid #334155',
            borderRadius: 10, padding: 16,
          }}>
            <div style={{ fontWeight: 600, fontSize: '.88rem', marginBottom: 10 }}>
              ⚠️ Alert Log
              {alertLog.length > 0 && (
                <span style={{ marginLeft: 8, fontSize: '.72rem', padding: '2px 6px', borderRadius: 20, background: '#7f1d1d33', color: '#fca5a5' }}>
                  {alertLog.length}
                </span>
              )}
            </div>
            <div style={{ display: 'flex', flexDirection: 'column', gap: 5, maxHeight: 160, overflowY: 'auto' }}>
              {alertLog.length === 0 ? (
                <div style={{ color: '#475569', fontSize: '.82rem' }}>No alerts yet</div>
              ) : (
                [...alertLog].reverse().slice(0, 6).map((a, i) => (
                  <div key={i} style={{
                    background: '#7f1d1d22',
                    borderLeft: '3px solid #ef4444',
                    borderRadius: '0 6px 6px 0',
                    padding: '6px 10px', fontSize: '.78rem', color: '#fca5a5',
                  }}>
                    {a.ts} — {a.message}
                  </div>
                ))
              )}
            </div>
          </div>
        </div>
      </div>

      {showShare && <StudentShareModal session={session} onClose={() => setShowShare(false)} />}
    </div>
  )
}
