/**
 * mlBridge.js
 * Maintains a single WebSocket connection to the Python ML server.
 * Frames from browser clients are forwarded; results are broadcast back.
 */

const WebSocket = require('ws');
const db        = require('../db/database');

const ML_WS_URL = process.env.ML_WS_URL || 'ws://localhost:8000/ws/process';

class MLBridge {
  constructor(io) {
    this.io          = io;       // Socket.io server
    this.mlSocket    = null;
    this.connected   = false;
    this.pendingQueue = [];       // frames waiting while reconnecting
    this.sessionId   = null;
    this.alertState  = {};        // {faceId: {lastHighAt, lastAlertAt}}
    this.HIGH_THRESH  = 0.60;
    this.COOLDOWN_MS  = 60_000;
    this.SUSTAINED_MS = 30_000;
    this._connect();
  }

  _connect() {
    try {
      this.mlSocket = new WebSocket(ML_WS_URL);
    } catch {
      setTimeout(() => this._connect(), 3000);
      return;
    }

    this.mlSocket.on('open', () => {
      this.connected = true;
      console.log('[MLBridge] Connected to Python ML server');
      // Flush queued frames
      while (this.pendingQueue.length) {
        this.mlSocket.send(this.pendingQueue.shift());
      }
    });

    this.mlSocket.on('message', (raw) => {
      try {
        const data = JSON.parse(raw);
        this._handleMLResult(data);
      } catch (e) {
        console.error('[MLBridge] Parse error:', e.message);
      }
    });

    this.mlSocket.on('close', () => {
      this.connected = false;
      console.log('[MLBridge] Disconnected — reconnecting in 3s...');
      setTimeout(() => this._connect(), 3000);
    });

    this.mlSocket.on('error', () => {
      this.connected = false;
    });
  }

  /**
   * Send a base64 JPEG frame from a browser client to the Python server.
   * @param {string} frameB64 - base64 image data
   * @param {string} clientId - socket.io client id (for routing results back)
   */
  sendFrame(frameB64, clientId) {
    const payload = JSON.stringify({ frame: frameB64, clientId });
    if (this.connected && this.mlSocket.readyState === WebSocket.OPEN) {
      this.mlSocket.send(payload);
    } else {
      // Queue up to 5 frames max (avoid memory leak)
      if (this.pendingQueue.length < 5) this.pendingQueue.push(payload);
    }
  }

  setSession(sessionId) {
    this.sessionId  = sessionId;
    this.alertState = {};
  }

  _handleMLResult(data) {
    // data: { clientId, faces: [{face_id, result, raw, window}], annotated_frame }
    const { clientId, faces = [], annotated_frame } = data;

    if (!faces.length) {
      this.io.to(clientId).emit('ml:result', { faces: [], annotated_frame });
      return;
    }

    const enrichedFaces = faces.map(f => {
      const studentName = db.students.getName(f.face_id);
      const enriched    = { ...f, student_name: studentName };

      // Save to DB
      if (this.sessionId) {
        try {
          db.readings.save({
            session_id:   this.sessionId,
            face_id:      f.face_id,
            student_name: studentName,
            label:        f.result.label,
            label_name:   f.result.name,
            p_low:        f.result.proba[0],
            p_medium:     f.result.proba[1],
            p_high:       f.result.proba[2],
            confidence:   f.result.confidence,
            ear:          f.raw?.ear     || 0,
            blink_rate:   f.window?.blink_rate_per_min || 0,
            gaze_var:     f.window?.gaze_variance || 0,
            head_move:    f.window?.head_movement || 0,
          });
        } catch {}
      }

      // Check alerts
      const alerts = this._checkAlerts(f.face_id, studentName, f.result);
      enriched.alerts = alerts;
      return enriched;
    });

    // Class-wide alert
    const nHigh  = faces.filter(f => f.result.proba[2] >= this.HIGH_THRESH).length;
    const classAlert = this._checkClassAlert(nHigh, faces.length);

    // Broadcast to the client's room AND the teacher overview room
    const payload = { faces: enrichedFaces, annotated_frame, classAlert };
    this.io.to(clientId).emit('ml:result', payload);
    this.io.to('teacher').emit('ml:result', payload);
  }

  _checkAlerts(faceId, name, result) {
    const now   = Date.now();
    const p_high = result.proba[2];
    const state  = this.alertState[faceId] || { lastHighAt: null, lastAlertAt: 0 };
    const alerts  = [];

    if (p_high >= this.HIGH_THRESH) {
      if (!state.lastHighAt) state.lastHighAt = now;
      const duration = now - state.lastHighAt;
      if (now - state.lastAlertAt > this.COOLDOWN_MS) {
        const msg  = duration >= this.SUSTAINED_MS
          ? `${name} — sustained overload (${Math.round(duration/1000)}s)`
          : `${name} — high cognitive load (${Math.round(p_high*100)}%)`;
        const type = duration >= this.SUSTAINED_MS ? 'SUSTAINED' : 'HIGH_LOAD';
        alerts.push({ type, message: msg, faceId, studentName: name });
        state.lastAlertAt = now;
        if (this.sessionId) {
          try { db.alerts.save(this.sessionId, faceId, name, type, msg); } catch {}
        }
        this.io.to('teacher').emit('ml:alert', { type, message: msg, faceId });
      }
    } else {
      state.lastHighAt = null;
    }
    this.alertState[faceId] = state;
    return alerts;
  }

  _checkClassAlert(nHigh, total) {
    if (total < 2) return null;
    if (nHigh / total >= 0.6) {
      const msg = `Class-wide overload — ${nHigh}/${total} students at high load`;
      this.io.to('teacher').emit('ml:alert', { type: 'CLASS_WIDE', message: msg });
      return { type: 'CLASS_WIDE', message: msg };
    }
    return null;
  }

  get status() {
    return { connected: this.connected, pendingFrames: this.pendingQueue.length };
  }
}

module.exports = MLBridge;
