import streamlit as st
import cv2

from src.camera import get_camera
from src.face_detection import detect_face
from src.eye_tracking import eye_focus
from src.engagement import calculate_engagement
from src.cognitive_load import classify_cognitive_load

st.set_page_config(page_title="Smart Classroom AI", layout="centered")
st.title("🎓 AI-Powered Smart Classroom Cognitive Load Monitor")

cap = get_camera()

frame_placeholder = st.empty()
score_placeholder = st.empty()
load_placeholder = st.empty()

while True:
    ret, frame = cap.read()
    if not ret:
        st.error("Camera not accessible")
        break

    face_present = detect_face(frame)
    eye_focused = eye_focus(frame)

    engagement = calculate_engagement(face_present, eye_focused)
    cognitive_load = classify_cognitive_load(engagement)

    frame_placeholder.image(frame, channels="BGR")
    score_placeholder.metric("Engagement Score", engagement)
    load_placeholder.metric("Cognitive Load", cognitive_load)
