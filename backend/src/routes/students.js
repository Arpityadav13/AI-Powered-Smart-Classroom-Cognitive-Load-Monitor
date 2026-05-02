const express = require('express');
const router  = express.Router();
const db      = require('../db/database');

router.get('/', (req, res) => res.json(db.students.getAll()));

router.put('/:faceId', (req, res) => {
  const { name, seat = '' } = req.body;
  if (!name) return res.status(400).json({ error: 'name required' });
  db.students.upsert(Number(req.params.faceId), name, seat);
  res.json({ success: true });
});

module.exports = router;
