require('dotenv').config();
const express    = require('express');
const http       = require('http');
const { Server } = require('socket.io');
const cors       = require('cors');
const morgan     = require('morgan');
const path       = require('path');

const db         = require('./db/database');
const MLBridge   = require('./services/mlBridge');
const setupWS    = require('./websocket/wsHandler');

const sessionsRouter  = require('./routes/sessions');
const analyticsRouter = require('./routes/analytics');
const studentsRouter  = require('./routes/students');

const app    = express();
const server = http.createServer(app);
const io     = new Server(server, {
  cors: { origin: process.env.FRONTEND_URL || 'http://localhost:5173', methods: ['GET','POST'] },
  maxHttpBufferSize: 5e6,   // 5 MB — enough for a JPEG frame
});

// ── Middleware ─────────────────────────────────────────────────────────────────
app.use(cors({ origin: process.env.FRONTEND_URL || 'http://localhost:5173' }));
app.use(express.json({ limit: '10mb' }));
app.use(morgan('dev'));

// ── REST Routes ────────────────────────────────────────────────────────────────
app.use('/api/sessions',  sessionsRouter);
app.use('/api/analytics', analyticsRouter);
app.use('/api/students',  studentsRouter);

// GET /api/health
app.get('/api/health', (req, res) => {
  res.json({ status: 'ok', mlBridge: mlBridge.status, timestamp: new Date().toISOString() });
});

// ── CSV export endpoint ────────────────────────────────────────────────────────
app.get('/api/sessions/:id/export', (req, res) => {
  const readings = db.readings.getSession(Number(req.params.id));
  if (!readings.length) return res.status(404).json({ error: 'No data' });
  const cols  = Object.keys(readings[0]);
  const lines = [cols.join(',')];
  readings.forEach(r => lines.push(cols.map(c => JSON.stringify(r[c] ?? '')).join(',')));
  res.setHeader('Content-Type', 'text/csv');
  res.setHeader('Content-Disposition', `attachment; filename="session_${req.params.id}.csv"`);
  res.send(lines.join('\n'));
});

// ── ML Bridge + WebSocket ──────────────────────────────────────────────────────
const mlBridge = new MLBridge(io);
setupWS(io, mlBridge, db);

// ── Start ──────────────────────────────────────────────────────────────────────
const PORT = process.env.PORT || 3001;
server.listen(PORT, () => {
  console.log(`\n🧠 CogniSense backend running on http://localhost:${PORT}`);
  console.log(`   ML bridge target: ${process.env.ML_WS_URL || 'ws://localhost:8000/ws/process'}`);
  console.log(`   Database: ${path.resolve(process.env.DB_PATH || './data/cognisense.db')}\n`);
});
