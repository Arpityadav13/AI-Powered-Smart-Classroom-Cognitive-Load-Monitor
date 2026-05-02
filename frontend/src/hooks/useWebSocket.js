import { useEffect, useRef, useState } from 'react'
import { io } from 'socket.io-client'

const BACKEND = import.meta.env.VITE_BACKEND_URL || 'http://localhost:3001'

let _socket = null  // singleton across re-renders

export function useWebSocket() {
  const [, forceRender] = useState(0)

  useEffect(() => {
    if (_socket) return

    _socket = io(BACKEND, {
      transports: ['websocket'],
      reconnection: true,
      reconnectionDelay: 1000,
    })

    _socket.on('connect',    () => { console.log('[WS] connected'); forceRender(n => n + 1) })
    _socket.on('disconnect', () => { console.log('[WS] disconnected');  })

    // Join teacher room to receive all broadcast events
    _socket.emit('join:teacher')
  }, [])

  return _socket
}
