"""
app.py — Streamlit dashboard for real-time cognitive load detection.

Run with:
    streamlit run src/app.py
"""

import time
import threading
import numpy as np
import pandas as pd
import streamlit as st
import cv2

# ── page config (must be first Streamlit call) ──────────────────────────────
st.set_page_config(
    page_title="CogniSense — Student Load Monitor",
    page_icon="🧠",
    layout="wide",
    initial_sidebar_state="expanded",
)

# ── local imports ─────────────────────────────────────────────────────────────
from vision   import CognitiveFaceTracker
from features import FeatureAssembler, FEATURE_NAMES
from model    import CognitiveLoadPredictor

# ── optional: DeepFace for emotion ────────────────────────────────────────────
try:
    from deepface import DeepFace
    DEEPFACE_OK = True
except ImportError:
    DEEPFACE_OK = False

# ─────────────────────────────────────────────────────────────────────────────
# Styling
# ─────────────────────────────────────────────────────────────────────────────
st.markdown("""
<style>
  @import url('https://fonts.googleapis.com/css2?family=Space+Grotesk:wght@400;600;700&family=JetBrains+Mono&display=swap');

  html, body, [class*="css"] { font-family: 'Space Grotesk', sans-serif; }

  .metric-card {
    background: #0f172a;
    border: 1px solid #1e293b;
    border-radius: 12px;
    padding: 1rem 1.4rem;
    text-align: center;
  }
  .metric-value { font-size: 2rem; font-weight: 700; line-height: 1; }
  .metric-label { font-size: 0.75rem; color: #94a3b8; margin-top: 4px; }

  .load-badge {
    display: inline-block;
    padding: 4px 14px;
    border-radius: 999px;
    font-weight: 700;
    font-size: 1.1rem;
  }
  .alert-box {
    background: #450a0a;
    border-left: 4px solid #ef4444;
    border-radius: 8px;
    padding: 10px 16px;
    margin: 8px 0;
    animation: pulse 1.5s infinite;
  }
  @keyframes pulse { 0%,100%{opacity:1} 50%{opacity:.7} }

  .stButton>button {
    background: #6366f1;
    color: white;
    border: none;
    border-radius: 8px;
    font-weight: 600;
  }
</style>
""", unsafe_allow_html=True)


# ─────────────────────────────────────────────────────────────────────────────
# Session-state initialisation
# ─────────────────────────────────────────────────────────────────────────────
if "history" not in st.session_state:
    st.session_state.history = []       # list of dicts for the chart

if "alert_log" not in st.session_state:
    st.session_state.alert_log = []

if "tracker" not in st.session_state:
    st.session_state.tracker   = CognitiveFaceTracker(window_seconds=5, fps=20)
    st.session_state.assembler = FeatureAssembler()
    st.session_state.predictor = CognitiveLoadPredictor()

if "running" not in st.session_state:
    st.session_state.running = False

if "current_result" not in st.session_state:
    st.session_state.current_result = {"name": "—", "color": "#64748b",
                                       "proba": [0.33, 0.33, 0.33],
                                       "confidence": 0.0}

tracker   = st.session_state.tracker
assembler = st.session_state.assembler
predictor = st.session_state.predictor

HIGH_LOAD_THRESHOLD = 0.60   # P(High) > 60% → alert

# ─────────────────────────────────────────────────────────────────────────────
# Sidebar
# ─────────────────────────────────────────────────────────────────────────────
with st.sidebar:
    st.title("🧠 CogniSense")
    st.caption("Real-time student cognitive load monitor")
    st.divider()

    cam_index = st.number_input("Camera index", min_value=0, max_value=5, value=0)
    use_emotion = st.toggle("Enable emotion detection (DeepFace)", value=DEEPFACE_OK,
                            disabled=not DEEPFACE_OK)
    emotion_freq = st.slider("Emotion analysis every N frames", 5, 30, 15)
    st.divider()

    alert_thresh = st.slider("High-load alert threshold (%)", 40, 90, 60)
    window_sec   = st.slider("Prediction window (s)", 2, 15, 5)
    st.divider()

    model_status = "✅ Trained model loaded" if predictor.ready else "⚠️ Using heuristic fallback"
    st.info(model_status)

    if not predictor.ready:
        st.code("python src/model.py", language="bash")
        st.caption("Run the above to train & save the model.")

    st.divider()
    st.markdown("**Legend**")
    st.markdown("🟢 **Low** — relaxed / bored")
    st.markdown("🟡 **Medium** — engaged")
    st.markdown("🔴 **High** — overloaded / confused")


# ─────────────────────────────────────────────────────────────────────────────
# Main layout
# ─────────────────────────────────────────────────────────────────────────────
st.markdown("## 📡 Live Monitoring Dashboard")

col_video, col_right = st.columns([3, 2], gap="large")

with col_video:
    st.markdown("#### 📷 Camera Feed")
    video_placeholder = st.empty()
    st.caption("Landmarks + EAR overlaid in real-time")

with col_right:
    st.markdown("#### 🎯 Current Load State")
    load_placeholder    = st.empty()
    proba_placeholder   = st.empty()
    metrics_placeholder = st.empty()

st.divider()

col_chart, col_alerts = st.columns([3, 2], gap="large")

with col_chart:
    st.markdown("#### 📈 Cognitive Load Over Time")
    chart_placeholder = st.empty()

with col_alerts:
    st.markdown("#### ⚠️ Alert Log")
    alert_placeholder = st.empty()

# ─────────────────────────────────────────────────────────────────────────────
# Controls
# ─────────────────────────────────────────────────────────────────────────────
ctrl_col1, ctrl_col2, ctrl_col3 = st.columns(3)
with ctrl_col1:
    start = st.button("▶ Start", use_container_width=True)
with ctrl_col2:
    stop  = st.button("⏹ Stop",  use_container_width=True)
with ctrl_col3:
    reset = st.button("🗑 Clear History", use_container_width=True)

if start:
    st.session_state.running = True
if stop:
    st.session_state.running = False
if reset:
    st.session_state.history   = []
    st.session_state.alert_log = []
    tracker.reset()


# ─────────────────────────────────────────────────────────────────────────────
# Rendering helpers
# ─────────────────────────────────────────────────────────────────────────────

def render_load_card(result):
    color = result["color"]
    name  = result["name"]
    conf  = result["confidence"]
    load_placeholder.markdown(f"""
    <div class="metric-card">
      <div class="metric-value" style="color:{color}">{name}</div>
      <div class="metric-label">Confidence: {conf*100:.0f}%</div>
    </div>
    """, unsafe_allow_html=True)

    proba = result["proba"]
    proba_placeholder.markdown(f"""
    <div style="margin-top:12px">
      <div style="margin:6px 0">
        🟢 Low &nbsp;&nbsp;
        <progress value="{proba[0]:.2f}" max="1" style="width:120px"></progress>
        &nbsp; {proba[0]*100:.0f}%
      </div>
      <div style="margin:6px 0">
        🟡 Medium
        <progress value="{proba[1]:.2f}" max="1" style="width:120px"></progress>
        &nbsp; {proba[1]*100:.0f}%
      </div>
      <div style="margin:6px 0">
        🔴 High &nbsp;
        <progress value="{proba[2]:.2f}" max="1" style="width:120px"></progress>
        &nbsp; {proba[2]*100:.0f}%
      </div>
    </div>
    """, unsafe_allow_html=True)


def render_chart():
    if not st.session_state.history:
        chart_placeholder.info("Start the camera to begin recording.")
        return
    df = pd.DataFrame(st.session_state.history[-120:])   # last 2 min @ 1Hz
    df["time_s"] = range(len(df))
    chart_placeholder.area_chart(
        df.set_index("time_s")[["p_low", "p_medium", "p_high"]],
        color=["#22c55e", "#f59e0b", "#ef4444"],
        use_container_width=True,
        height=220,
    )


def render_alerts():
    if not st.session_state.alert_log:
        alert_placeholder.caption("No alerts yet.")
        return
    html = ""
    for a in reversed(st.session_state.alert_log[-8:]):
        html += f'<div class="alert-box">⚠️ {a}</div>'
    alert_placeholder.markdown(html, unsafe_allow_html=True)


def render_metrics(raw, wf):
    ear   = raw.get("ear") or 0.0
    blink = wf.get("blink_rate_per_min", 0)
    gvar  = wf.get("gaze_variance", 0.0)
    hm    = wf.get("head_movement", 0.0)

    metrics_placeholder.markdown(f"""
    <div style="display:grid;grid-template-columns:1fr 1fr;gap:10px;margin-top:12px">
      <div class="metric-card">
        <div class="metric-value" style="color:#67e8f9">{ear:.2f}</div>
        <div class="metric-label">EAR (eye openness)</div>
      </div>
      <div class="metric-card">
        <div class="metric-value" style="color:#a78bfa">{blink:.0f}</div>
        <div class="metric-label">Blinks / min</div>
      </div>
      <div class="metric-card">
        <div class="metric-value" style="color:#f0abfc">{gvar:.3f}</div>
        <div class="metric-label">Gaze variance</div>
      </div>
      <div class="metric-card">
        <div class="metric-value" style="color:#fb923c">{hm:.1f}°</div>
        <div class="metric-label">Head movement</div>
      </div>
    </div>
    """, unsafe_allow_html=True)


# ─────────────────────────────────────────────────────────────────────────────
# Main loop
# ─────────────────────────────────────────────────────────────────────────────

if st.session_state.running:
    cap = cv2.VideoCapture(cam_index)
    cap.set(cv2.CAP_PROP_FRAME_WIDTH,  640)
    cap.set(cv2.CAP_PROP_FRAME_HEIGHT, 480)

    if not cap.isOpened():
        st.error(f"Cannot open camera {cam_index}. Check the camera index in the sidebar.")
        st.session_state.running = False
    else:
        frame_count = 0
        emotion_dict = None
        last_predict_time = time.time()

        while st.session_state.running:
            ret, frame = cap.read()
            if not ret:
                st.warning("Frame capture failed.")
                break

            frame_count += 1
            annotated, raw, wf, face_found = tracker.process_frame(frame)

            # Emotion analysis (every N frames, in background thread would be better)
            if use_emotion and face_found and (frame_count % emotion_freq == 0):
                try:
                    res = DeepFace.analyze(frame, actions=["emotion"],
                                          enforce_detection=False, silent=True)
                    emotion_dict = res[0]["emotion"] if res else None
                except Exception:
                    emotion_dict = None

            # Feature vector & prediction (max 2 Hz to avoid UI lag)
            now = time.time()
            if face_found and (now - last_predict_time) >= 0.5:
                fv  = assembler.assemble(wf, emotion_dict)
                arr = fv.to_array()
                result = predictor.predict(arr)
                st.session_state.current_result = result
                last_predict_time = now

                # Append to history
                st.session_state.history.append({
                    "p_low":    result["proba"][0],
                    "p_medium": result["proba"][1],
                    "p_high":   result["proba"][2],
                })

                # Alert logic
                if result["proba"][2] >= (alert_thresh / 100):
                    ts = time.strftime("%H:%M:%S")
                    msg = f"{ts} — High cognitive load ({result['proba'][2]*100:.0f}%)"
                    if (not st.session_state.alert_log or
                            st.session_state.alert_log[-1] != msg):
                        st.session_state.alert_log.append(msg)

            # Show video
            rgb_frame = cv2.cvtColor(annotated, cv2.COLOR_BGR2RGB)
            video_placeholder.image(rgb_frame, channels="RGB", use_column_width=True)

            # Render panels
            render_load_card(st.session_state.current_result)
            render_metrics(raw, wf)
            render_chart()
            render_alerts()

            time.sleep(0.03)   # ~30 fps cap

        cap.release()
else:
    # Static display when not running
    video_placeholder.info("▶ Press **Start** to begin live monitoring.")
    render_load_card(st.session_state.current_result)
    render_chart()
    render_alerts()
