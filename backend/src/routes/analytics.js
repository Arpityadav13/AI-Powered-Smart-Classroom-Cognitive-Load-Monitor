const express = require('express');
const router  = express.Router();
const db      = require('../db/database');

// GET /api/analytics/:sessionId/summary
router.get('/:sessionId/summary', (req, res) => {
  const sid = Number(req.params.sessionId);
  const summary  = db.analytics.summary(sid);
  const students = db.analytics.perStudent(sid);
  const timeLine = db.analytics.overTime(sid);
  const alerts   = db.alerts.getSession(sid);
  res.json({ summary, students, timeLine, alertCount: alerts.length });
});

// GET /api/analytics/:sessionId/timeline
router.get('/:sessionId/timeline', (req, res) => {
  res.json(db.analytics.overTime(Number(req.params.sessionId)));
});

// GET /api/analytics/:sessionId/students
router.get('/:sessionId/students', (req, res) => {
  res.json(db.analytics.perStudent(Number(req.params.sessionId)));
});

// GET /api/analytics/trend/multi
router.get('/trend/multi', (req, res) => {
  res.json(db.analytics.multiTrend());
});

module.exports = router;
