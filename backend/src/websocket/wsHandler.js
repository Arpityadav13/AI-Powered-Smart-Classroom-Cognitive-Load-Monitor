/**
 * wsHandler.js
 * Socket.io room/event management for real-time communication.
 */

module.exports = function setupWebSocket(io, mlBridge, db) {

  io.on('connection', (socket) => {
    console.log(`[WS] Client connected: ${socket.id}`);

    // ── Room joining ───────────────────────────────────────────────────────────
    socket.on('join:teacher', () => {
      socket.join('teacher');
      console.log(`[WS] ${socket.id} joined teacher room`);
    });

    // ── Student join (from /student page) ─────────────────────────────────────
    socket.on('student:join', ({ sessionId, name }) => {
      socket.join('students')
      if (sessionId) socket.join(`session:${sessionId}`)
      // Store student name so readings are labelled correctly
      const faceId = Math.abs(socket.id.split('').reduce((a,c) => a + c.charCodeAt(0), 0)) % 1000
      db.students.upsert(faceId, name || `Student`)
      socket.data.studentName = name
      socket.data.faceId      = faceId
      // Send back session info if available
      if (sessionId) {
        const sess = db.sessions.get(Number(sessionId))
        if (sess) socket.emit('session:info', sess)
      }
      // Notify teacher
      io.to('teacher').emit('student:connected', { socketId: socket.id, name, faceId })
      console.log(`[WS] Student "${name}" joined (faceId=${faceId})`)
    })
    socket.on('session:start', ({ sessionId }) => {
      mlBridge.setSession(sessionId);
      socket.join(`session:${sessionId}`);
      io.to('teacher').emit('session:started', { sessionId });
      console.log(`[WS] Session ${sessionId} started`);
    });

    socket.on('session:end', ({ sessionId }) => {
      mlBridge.setSession(null);
      io.to('teacher').emit('session:ended', { sessionId });
      console.log(`[WS] Session ${sessionId} ended`);
    });

    // ── Video frames from browser ──────────────────────────────────────────────
    socket.on('frame', ({ frame }) => {
      // Forward to Python ML server; results come back via mlBridge callback
      mlBridge.sendFrame(frame, socket.id);
    });

    // ── Student name update ────────────────────────────────────────────────────
    socket.on('student:rename', ({ faceId, name, seat }) => {
      db.students.upsert(faceId, name, seat || '');
      io.emit('student:updated', { faceId, name, seat });
    });

    // ── ML bridge status ───────────────────────────────────────────────────────
    socket.on('ml:status', (cb) => {
      if (typeof cb === 'function') cb(mlBridge.status);
    });

    socket.on('disconnect', () => {
      console.log(`[WS] Client disconnected: ${socket.id}`);
    });
  });
};
