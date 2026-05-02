# 🧠 CogniSense Web — Full-Stack Cognitive Load Monitor

React + Node.js + Python FastAPI · Real-time multi-student detection

---

## 🏗️ Architecture

```
Browser (React)         Node.js Backend         Python ML Server
   port 5173      ←→       port 3001       ←→       port 8000
                       (Express + Socket.io)    (FastAPI + MediaPipe)
                             │
                         SQLite DB
                      (data/cognisense.db)
```

**Data flow:**
1. Browser captures webcam → sends JPEG frame via Socket.io
2. Node.js forwards frame to Python ML server via WebSocket
3. Python runs MediaPipe face tracking + GBT prediction
4. Results returned → Node.js saves to SQLite + broadcasts to browser
5. React UI updates live dashboard, heatmap, alerts

---

## 📁 Folder Structure

```
cognisense-web/
├── frontend/                   ← React 18 + Vite
│   ├── src/
│   │   ├── App.jsx             ← Router + sidebar navigation
│   │   ├── main.jsx
│   │   ├── index.css           ← Design tokens + global styles
│   │   ├── context/
│   │   │   └── SessionContext.jsx
│   │   ├── hooks/
│   │   │   └── useWebSocket.js ← Persistent Socket.io connection
│   │   ├── api/
│   │   │   └── client.js       ← Axios REST helpers
│   │   └── pages/
│   │       ├── LiveMonitor.jsx    ← Webcam + live detection
│   │       ├── ClassroomView.jsx  ← Seat heatmap
│   │       ├── Analytics.jsx      ← Charts + session data
│   │       ├── SessionHistory.jsx ← Past sessions + export
│   │       └── Settings.jsx       ← Configuration
│   ├── index.html
│   ├── vite.config.js
│   └── package.json
│
├── backend/                    ← Node.js + Express + Socket.io
│   ├── src/
│   │   ├── index.js            ← Express + Socket.io server entry
│   │   ├── db/
│   │   │   └── database.js     ← SQLite schema + queries
│   │   ├── routes/
│   │   │   ├── sessions.js     ← Session CRUD + CSV export
│   │   │   ├── analytics.js    ← Chart data endpoints
│   │   │   └── students.js     ← Student roster CRUD
│   │   ├── services/
│   │   │   └── mlBridge.js     ← Python ML WebSocket bridge
│   │   └── websocket/
│   │       └── wsHandler.js    ← Socket.io event handlers
│   ├── .env
│   └── package.json
│
└── ml/                         ← Python FastAPI + MediaPipe
    ├── server.py               ← FastAPI WebSocket endpoint
    ├── vision.py               ← Multi-face tracker (MediaPipe)
    ├── features.py             ← Feature engineering
    ├── model.py                ← GBT prediction pipeline
    ├── models/
    │   ├── rf_model.pkl        ← Pre-trained classifier
    │   └── rf_meta.json
    └── requirements.txt
```

---

## 🚀 Setup & Run

### Step 1 — Python ML Server

```bash
cd ml
pip install mediapipe==0.10.9 protobuf==3.20.3
pip install -r requirements.txt
# Train model (already pre-trained in models/ — skip if pkl exists)
python model.py
# Start server
uvicorn server:app --host 0.0.0.0 --port 8000 --reload
```

### Step 2 — Node.js Backend

```bash
cd backend
npm install
npm run dev
# Server starts on http://localhost:3001
```

### Step 3 — React Frontend

```bash
cd frontend
npm install
npm run dev
# Open http://localhost:5173
```

---

## 🎯 How to Use (Presentation Flow)

1. Open **http://localhost:5173**
2. Go to **Live Monitor** → fill session name/topic/teacher
3. Click **▶ Start Session** → allow camera access
4. Point camera at students (or yourself for demo)
5. Watch real-time load detection with per-face coloured boxes
6. Switch to **Classroom View** for the seat heatmap
7. Check **Analytics** for charts after ending the session
8. Click **End Session** → data saved to SQLite
9. Go to **Session History** → export CSV

---

## 🔌 API Endpoints

| Method | Endpoint | Description |
|--------|----------|-------------|
| GET    | /api/health | Server + ML bridge status |
| GET    | /api/sessions | All sessions |
| POST   | /api/sessions | Create session |
| PATCH  | /api/sessions/:id/end | End session |
| GET    | /api/sessions/:id/readings | All readings |
| GET    | /api/sessions/:id/export | Download CSV |
| GET    | /api/analytics/:id/summary | Full analytics |
| GET    | /api/analytics/:id/timeline | Load over time |
| GET    | /api/students | Student roster |
| PUT    | /api/students/:faceId | Rename student |

## 🔌 WebSocket Events

| Event (client→server) | Payload | Description |
|-----------------------|---------|-------------|
| frame | { frame: base64 } | Send webcam frame |
| session:start | { sessionId } | Activate ML logging |
| session:end | { sessionId } | Stop ML logging |
| student:rename | { faceId, name } | Rename detected face |

| Event (server→client) | Payload | Description |
|-----------------------|---------|-------------|
| ml:result | { faces, annotated_frame } | Predictions per frame |
| ml:alert | { type, message, faceId } | Threshold alert fired |

---

## ⚠️ Troubleshooting

**mediapipe error** → `pip install mediapipe==0.10.9 protobuf==3.20.3`

**Camera not opening** → Allow camera in browser permissions (localhost needs HTTPS in prod)

**ML server not connecting** → Start Python server first, check port 8000 is free

**CORS errors** → Ensure FRONTEND_URL in backend/.env matches your dev URL
