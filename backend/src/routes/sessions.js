const express = require('express');
const router  = express.Router();
const db      = require('../db/database');

// GET /api/sessions
router.get('/', (req, res) => {
  try {
    res.json(db.sessions.getAll());
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

// GET /api/sessions/:id
router.get('/:id', (req, res) => {
  const sess = db.sessions.get(Number(req.params.id));
  if (!sess) return res.status(404).json({ error: 'Session not found' });
  res.json(sess);
});

// POST /api/sessions
router.post('/', (req, res) => {
  const { name = 'Session', topic = '', teacher = '' } = req.body;
  const id = db.sessions.create(name, topic, teacher);
  res.status(201).json({ id, name, topic, teacher });
});

// PATCH /api/sessions/:id/end
router.patch('/:id/end', (req, res) => {
  const { notes = '' } = req.body;
  db.sessions.end(Number(req.params.id), notes);
  res.json({ success: true });
});

// GET /api/sessions/:id/readings
router.get('/:id/readings', (req, res) => {
  res.json(db.readings.getSession(Number(req.params.id)));
});

// GET /api/sessions/:id/alerts
router.get('/:id/alerts', (req, res) => {
  res.json(db.alerts.getSession(Number(req.params.id)));
});

// POST /api/sessions/:id/readings  (batch save from ML results)
router.post('/:id/readings', (req, res) => {
  const sid = Number(req.params.id);
  const { readings } = req.body;   // array of reading objects
  if (!Array.isArray(readings)) return res.status(400).json({ error: 'readings must be array' });
  for (const r of readings) {
    db.readings.save({ session_id: sid, ...r });
  }
  res.status(201).json({ saved: readings.length });
});

module.exports = router;
