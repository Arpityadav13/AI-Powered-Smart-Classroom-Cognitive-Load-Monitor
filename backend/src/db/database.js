const Database = require('better-sqlite3');
const path = require('path');
const fs = require('fs');

const dbDir = path.resolve(__dirname, '../../data');
if (!fs.existsSync(dbDir)) fs.mkdirSync(dbDir, { recursive: true });

const DB_PATH = process.env.DB_PATH || path.join(dbDir, 'cognisense.db');
const db = new Database(DB_PATH);

db.pragma('journal_mode = WAL');
db.pragma('foreign_keys = ON');

// ── Schema ────────────────────────────────────────────────────────────────────
db.exec(`
  CREATE TABLE IF NOT EXISTS students (
    id         INTEGER PRIMARY KEY AUTOINCREMENT,
    face_id    INTEGER UNIQUE NOT NULL,
    name       TEXT NOT NULL DEFAULT 'Student',
    seat       TEXT DEFAULT '',
    created_at TEXT DEFAULT (datetime('now'))
  );

  CREATE TABLE IF NOT EXISTS sessions (
    id         INTEGER PRIMARY KEY AUTOINCREMENT,
    name       TEXT NOT NULL,
    topic      TEXT DEFAULT '',
    teacher    TEXT DEFAULT '',
    started_at TEXT NOT NULL,
    ended_at   TEXT,
    notes      TEXT DEFAULT ''
  );

  CREATE TABLE IF NOT EXISTS load_readings (
    id           INTEGER PRIMARY KEY AUTOINCREMENT,
    session_id   INTEGER NOT NULL REFERENCES sessions(id) ON DELETE CASCADE,
    face_id      INTEGER NOT NULL,
    student_name TEXT DEFAULT 'Unknown',
    timestamp    TEXT NOT NULL,
    label        INTEGER NOT NULL,
    label_name   TEXT NOT NULL,
    p_low        REAL NOT NULL,
    p_medium     REAL NOT NULL,
    p_high       REAL NOT NULL,
    confidence   REAL NOT NULL,
    ear          REAL DEFAULT 0,
    blink_rate   REAL DEFAULT 0,
    gaze_var     REAL DEFAULT 0,
    head_move    REAL DEFAULT 0
  );

  CREATE TABLE IF NOT EXISTS alerts (
    id           INTEGER PRIMARY KEY AUTOINCREMENT,
    session_id   INTEGER REFERENCES sessions(id) ON DELETE CASCADE,
    face_id      INTEGER DEFAULT -1,
    student_name TEXT DEFAULT '',
    timestamp    TEXT NOT NULL,
    alert_type   TEXT NOT NULL,
    message      TEXT NOT NULL
  );

  CREATE INDEX IF NOT EXISTS idx_readings_session ON load_readings(session_id);
  CREATE INDEX IF NOT EXISTS idx_readings_face    ON load_readings(face_id);
  CREATE INDEX IF NOT EXISTS idx_alerts_session   ON alerts(session_id);
`);

// ── Sessions ──────────────────────────────────────────────────────────────────
const createSession = db.prepare(
  `INSERT INTO sessions(name,topic,teacher,started_at) VALUES(?,?,?,datetime('now'))`
);
const endSession = db.prepare(
  `UPDATE sessions SET ended_at=datetime('now'), notes=? WHERE id=?`
);
const getAllSessions = db.prepare(
  `SELECT * FROM sessions ORDER BY started_at DESC`
);
const getSession = db.prepare(`SELECT * FROM sessions WHERE id=?`);

// ── Readings ──────────────────────────────────────────────────────────────────
const saveReading = db.prepare(`
  INSERT INTO load_readings
  (session_id,face_id,student_name,timestamp,label,label_name,
   p_low,p_medium,p_high,confidence,ear,blink_rate,gaze_var,head_move)
  VALUES(@session_id,@face_id,@student_name,datetime('now'),@label,@label_name,
         @p_low,@p_medium,@p_high,@confidence,@ear,@blink_rate,@gaze_var,@head_move)
`);

const getSessionReadings = db.prepare(
  `SELECT * FROM load_readings WHERE session_id=? ORDER BY timestamp`
);

// ── Analytics ─────────────────────────────────────────────────────────────────
const sessionSummary = db.prepare(`
  SELECT
    COUNT(*) as total_readings,
    COUNT(DISTINCT face_id) as unique_students,
    ROUND(AVG(CASE WHEN label=0 THEN 100.0 ELSE 0 END),1) as pct_low,
    ROUND(AVG(CASE WHEN label=1 THEN 100.0 ELSE 0 END),1) as pct_medium,
    ROUND(AVG(CASE WHEN label=2 THEN 100.0 ELSE 0 END),1) as pct_high,
    ROUND(AVG(confidence)*100,1) as avg_confidence,
    ROUND(AVG(blink_rate),1) as avg_blink_rate,
    ROUND(AVG(gaze_var),4) as avg_gaze_var
  FROM load_readings WHERE session_id=?
`);

const perStudentSummary = db.prepare(`
  SELECT
    face_id, student_name,
    COUNT(*) as readings,
    ROUND(AVG(CASE WHEN label=0 THEN 100.0 ELSE 0 END),1) as pct_low,
    ROUND(AVG(CASE WHEN label=1 THEN 100.0 ELSE 0 END),1) as pct_medium,
    ROUND(AVG(CASE WHEN label=2 THEN 100.0 ELSE 0 END),1) as pct_high,
    ROUND(AVG(p_high)*100,1) as avg_high_prob,
    ROUND(MAX(p_high)*100,1) as peak_high_prob
  FROM load_readings WHERE session_id=?
  GROUP BY face_id ORDER BY avg_high_prob DESC
`);

const loadOverTime = db.prepare(`
  SELECT
    strftime('%H:%M', timestamp) as time_bin,
    ROUND(AVG(p_low)*100,1)    as avg_low,
    ROUND(AVG(p_medium)*100,1) as avg_medium,
    ROUND(AVG(p_high)*100,1)   as avg_high,
    COUNT(*) as count
  FROM load_readings WHERE session_id=?
  GROUP BY strftime('%H:%M', timestamp)
  ORDER BY time_bin
`);

const multiSessionTrend = db.prepare(`
  SELECT s.id, s.name, s.topic, s.started_at,
    ROUND(AVG(r.p_high)*100,1) as avg_high,
    ROUND(AVG(r.p_low)*100,1)  as avg_low,
    COUNT(DISTINCT r.face_id)  as students
  FROM sessions s
  JOIN load_readings r ON r.session_id = s.id
  GROUP BY s.id ORDER BY s.started_at DESC LIMIT 10
`);

// ── Alerts ────────────────────────────────────────────────────────────────────
const saveAlert = db.prepare(`
  INSERT INTO alerts(session_id,face_id,student_name,timestamp,alert_type,message)
  VALUES(?,?,?,datetime('now'),?,?)
`);
const getSessionAlerts = db.prepare(
  `SELECT * FROM alerts WHERE session_id=? ORDER BY timestamp DESC`
);

// ── Students ──────────────────────────────────────────────────────────────────
const upsertStudent = db.prepare(`
  INSERT INTO students(face_id,name,seat) VALUES(?,?,?)
  ON CONFLICT(face_id) DO UPDATE SET name=excluded.name, seat=excluded.seat
`);
const getAllStudents = db.prepare(`SELECT * FROM students ORDER BY face_id`);
const getStudentName = db.prepare(
  `SELECT name FROM students WHERE face_id=?`
);

module.exports = {
  db,
  sessions: {
    create: (name, topic, teacher) => createSession.run(name, topic, teacher).lastInsertRowid,
    end:    (id, notes = '') => endSession.run(notes, id),
    getAll: () => getAllSessions.all(),
    get:    (id) => getSession.get(id),
  },
  readings: {
    save:       (data) => saveReading.run(data),
    getSession: (sid)  => getSessionReadings.all(sid),
  },
  analytics: {
    summary:        (sid) => sessionSummary.get(sid),
    perStudent:     (sid) => perStudentSummary.all(sid),
    overTime:       (sid) => loadOverTime.all(sid),
    multiTrend:     ()    => multiSessionTrend.all(),
  },
  alerts: {
    save:       (sid, fid, name, type, msg) => saveAlert.run(sid, fid, name, type, msg),
    getSession: (sid) => getSessionAlerts.all(sid),
  },
  students: {
    upsert:  (fid, name, seat = '') => upsertStudent.run(fid, name, seat),
    getAll:  () => getAllStudents.all(),
    getName: (fid) => { const r = getStudentName.get(fid); return r ? r.name : `Student ${fid + 1}`; },
  },
};
