import React, { useState, useEffect } from 'react'

export default function StudentShareModal({ session, onClose }) {
  const studentUrl = `${window.location.origin}/student`
  const [copied, setCopied]   = useState(false)
  const [qrSrc,  setQrSrc]    = useState('')

  useEffect(() => {
    // Use a free QR API (no key needed)
    const encoded = encodeURIComponent(studentUrl)
    setQrSrc(`https://api.qrserver.com/v1/create-qr-code/?size=180x180&data=${encoded}`)
  }, [studentUrl])

  const copy = () => {
    navigator.clipboard.writeText(studentUrl)
    setCopied(true)
    setTimeout(() => setCopied(false), 2000)
  }

  return (
    <div style={{
      position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.7)',
      display: 'flex', alignItems: 'center', justifyContent: 'center',
      zIndex: 9999,
    }} onClick={onClose}>
      <div style={{
        background: 'var(--card)', border: '1px solid var(--border)',
        borderRadius: 20, padding: 32, width: 380, textAlign: 'center',
      }} onClick={e => e.stopPropagation()}>

        <div style={{ fontSize: '1.3rem', fontWeight: 700, marginBottom: 6 }}>
          📱 Share with Students
        </div>
        <p style={{ color: 'var(--muted)', fontSize: '.85rem', marginBottom: 20 }}>
          Students open this URL on their own device.
          They see their own load level — you see the full dashboard.
        </p>

        {/* QR code */}
        <div style={{
          background: 'white', borderRadius: 12, padding: 12,
          display: 'inline-block', marginBottom: 16,
        }}>
          {qrSrc ? (
            <img src={qrSrc} alt="QR code" width={180} height={180}
              style={{ display: 'block', borderRadius: 4 }} />
          ) : (
            <div style={{ width: 180, height: 180, background: '#f1f5f9',
              display: 'flex', alignItems: 'center', justifyContent: 'center',
              color: '#94a3b8', fontSize: '.8rem' }}>
              Generating…
            </div>
          )}
        </div>

        {/* URL box */}
        <div style={{
          background: 'var(--bg2)', border: '1px solid var(--border)',
          borderRadius: 8, padding: '10px 14px',
          fontFamily: 'monospace', fontSize: '.82rem', color: '#818cf8',
          marginBottom: 14, wordBreak: 'break-all',
        }}>
          {studentUrl}
        </div>

        <div style={{ display: 'flex', gap: 10 }}>
          <button onClick={copy} style={{
            flex: 1, padding: '10px', background: copied ? '#14532d' : '#6366f1',
            color: 'white', border: 'none', borderRadius: 8,
            fontWeight: 600, cursor: 'pointer', fontFamily: 'inherit', transition: 'background .2s',
          }}>
            {copied ? '✓ Copied!' : '📋 Copy Link'}
          </button>
          <button onClick={onClose} style={{
            padding: '10px 16px', background: 'transparent',
            color: 'var(--muted)', border: '1px solid var(--border)',
            borderRadius: 8, cursor: 'pointer', fontFamily: 'inherit',
          }}>
            Close
          </button>
        </div>

        {session && (
          <p style={{ fontSize: '.72rem', color: 'var(--hint)', marginTop: 12 }}>
            Session: {session.name} #{session.id}
          </p>
        )}
      </div>
    </div>
  )
}
