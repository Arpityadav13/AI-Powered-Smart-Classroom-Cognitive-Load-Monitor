"""
vision.py — Multi-student real-time face + eye + head tracking.
Fixed: ear variable defined before use in exception handler.
"""

import sys, os
sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))

import cv2
import numpy as np
import mediapipe as mp
from collections import deque, OrderedDict
import math
import time

# ── MediaPipe setup ───────────────────────────────────────────────────────────
try:
    mp_face_mesh = mp.solutions.face_mesh
    mp_drawing   = mp.solutions.drawing_utils
except AttributeError:
    from mediapipe.python.solutions import face_mesh as mp_face_mesh
    from mediapipe.python.solutions import drawing_utils as mp_drawing

# ── Landmark indices ──────────────────────────────────────────────────────────
LEFT_EYE      = [362,382,381,380,374,373,390,249,263,466,388,387,386,385,384,398]
RIGHT_EYE     = [33,7,163,144,145,153,154,155,133,173,157,158,159,160,161,246]
LEFT_EAR_PTS  = [362,385,387,263,373,380]
RIGHT_EAR_PTS = [33,160,158,133,153,144]
LEFT_IRIS     = [474,475,476,477]
RIGHT_IRIS    = [469,470,471,472]
HEAD_POSE_PTS = [1,9,57,130,287,359]

FACE_COLORS = [
    (0,255,180),(255,100,0),(0,180,255),(255,0,180),
    (180,255,0),(100,0,255),(0,255,100),(255,180,0),
    (0,100,255),(255,0,100),(100,255,0),(0,255,255),
]

MODEL_POINTS = np.array([
    (0.0,0.0,0.0),(0.0,-330.0,-65.0),(-225.0,170.0,-135.0),
    (225.0,170.0,-135.0),(-150.0,-150.0,-125.0),(150.0,-150.0,-125.0)
], dtype=np.float64)


# ── Centroid tracker ──────────────────────────────────────────────────────────
class CentroidTracker:
    def __init__(self, max_disappeared=15):
        self.next_id     = 0
        self.objects     = OrderedDict()
        self.disappeared = OrderedDict()
        self.max_disappeared = max_disappeared

    def register(self, centroid):
        self.objects[self.next_id]     = centroid
        self.disappeared[self.next_id] = 0
        self.next_id += 1

    def deregister(self, fid):
        del self.objects[fid]
        del self.disappeared[fid]

    def update(self, centroids):
        if len(centroids) == 0:
            for fid in list(self.disappeared):
                self.disappeared[fid] += 1
                if self.disappeared[fid] > self.max_disappeared:
                    self.deregister(fid)
            return {}

        if len(self.objects) == 0:
            for c in centroids:
                self.register(c)
        else:
            ids  = list(self.objects.keys())
            prev = list(self.objects.values())
            D    = np.linalg.norm(
                np.array(prev)[:,None,:] - np.array(centroids)[None,:,:], axis=2
            )
            rows = D.min(axis=1).argsort()
            cols = D.argmin(axis=1)[rows]
            used_rows, used_cols = set(), set()
            for r, c in zip(rows, cols):
                if r in used_rows or c in used_cols:
                    continue
                fid = ids[r]
                self.objects[fid]     = centroids[c]
                self.disappeared[fid] = 0
                used_rows.add(r); used_cols.add(c)
            for r in set(range(len(ids))) - used_rows:
                fid = ids[r]
                self.disappeared[fid] += 1
                if self.disappeared[fid] > self.max_disappeared:
                    self.deregister(fid)
            for c in set(range(len(centroids))) - used_cols:
                self.register(centroids[c])

        return dict(self.objects)


# ── Per-face signal buffers ───────────────────────────────────────────────────
class FaceBuffer:
    def __init__(self, window_seconds=5, fps=20):
        n = window_seconds * fps
        self.ear_buf     = deque(maxlen=n)
        self.gaze_x_buf  = deque(maxlen=n)
        self.gaze_y_buf  = deque(maxlen=n)
        self.yaw_buf     = deque(maxlen=n)
        self.pitch_buf   = deque(maxlen=n)
        self.blink_times = deque(maxlen=60)
        self._consec     = 0
        self.EAR_THRESH  = 0.20
        self.BLINK_FRAMES= 2

    def push(self, ear, gaze_x, gaze_y, yaw, pitch):
        self.ear_buf.append(ear)
        self.gaze_x_buf.append(gaze_x)
        self.gaze_y_buf.append(gaze_y)
        self.yaw_buf.append(yaw)
        self.pitch_buf.append(pitch)

    def check_blink(self, ear):
        blink_now = False
        if ear < self.EAR_THRESH:
            self._consec += 1
        else:
            if self._consec >= self.BLINK_FRAMES:
                self.blink_times.append(time.time())
                blink_now = True
            self._consec = 0
        return blink_now

    def window_features(self):
        now = time.time()
        bpm = sum(1 for t in self.blink_times if now - t <= 60)
        def smean(b): return float(np.mean(b)) if b else 0.0
        def sstd(b):  return float(np.std(b))  if len(b) > 1 else 0.0
        def srng(b):  return float(np.max(b) - np.min(b)) if len(b) > 1 else 0.0
        return {
            "blink_rate_per_min": bpm,
            "ear_mean":      smean(self.ear_buf),
            "ear_std":       sstd(self.ear_buf),
            "gaze_x_mean":   smean(self.gaze_x_buf),
            "gaze_x_std":    sstd(self.gaze_x_buf),
            "gaze_y_mean":   smean(self.gaze_y_buf),
            "gaze_y_std":    sstd(self.gaze_y_buf),
            "gaze_variance": sstd(self.gaze_x_buf) + sstd(self.gaze_y_buf),
            "yaw_mean":      smean(self.yaw_buf),
            "yaw_range":     srng(self.yaw_buf),
            "pitch_mean":    smean(self.pitch_buf),
            "pitch_range":   srng(self.pitch_buf),
            "head_movement": srng(self.yaw_buf) + srng(self.pitch_buf),
        }


# ── Geometry helpers ──────────────────────────────────────────────────────────
def _ear(lms, pts, shape):
    h, w = shape[:2]
    p = [np.array([lms[i].x*w, lms[i].y*h]) for i in pts]
    A = np.linalg.norm(p[1]-p[5])
    B = np.linalg.norm(p[2]-p[4])
    C = np.linalg.norm(p[0]-p[3])
    return (A+B) / (2.0*C+1e-6)

def _iris_gaze(lms, iris_pts, eye_pts, shape):
    h, w = shape[:2]
    lm  = lambda i: np.array([lms[i].x*w, lms[i].y*h])
    ic  = np.mean([lm(i) for i in iris_pts], axis=0)
    ep  = np.array([lm(i) for i in eye_pts])
    rng = ep.max(axis=0) - ep.min(axis=0) + 1e-6
    g   = (ic - ep.min(axis=0)) / rng
    return float(g[0]), float(g[1])

def _head_pose(lms, shape):
    h, w = shape[:2]
    img_pts = np.array([[lms[i].x*w, lms[i].y*h] for i in HEAD_POSE_PTS], dtype=np.float64)
    f   = w
    cam = np.array([[f,0,w/2],[0,f,h/2],[0,0,1]], dtype=np.float64)
    ok, rvec, _ = cv2.solvePnP(MODEL_POINTS, img_pts, cam, np.zeros((4,1)),
                                flags=cv2.SOLVEPNP_ITERATIVE)
    if not ok: return 0.0, 0.0, 0.0
    R, _ = cv2.Rodrigues(rvec)
    sy    = math.sqrt(R[0,0]**2+R[1,0]**2)
    pitch = math.degrees(math.atan2(R[2,1], R[2,2]))
    yaw   = math.degrees(math.atan2(-R[2,0], sy))
    roll  = math.degrees(math.atan2(R[1,0], R[0,0]))
    return pitch, yaw, roll

def _face_centroid(lms, shape):
    h, w = shape[:2]
    xs = [lms[i].x*w for i in [33,263,1,61,291]]
    ys = [lms[i].y*h for i in [33,263,1,61,291]]
    return (int(np.mean(xs)), int(np.mean(ys)))

def _face_bbox(lms, shape):
    h, w = shape[:2]
    xs = [lm.x*w for lm in lms]
    ys = [lm.y*h for lm in lms]
    x1,y1 = max(0,int(min(xs))-10), max(0,int(min(ys))-10)
    x2,y2 = min(w,int(max(xs))+10), min(h,int(max(ys))+10)
    return x1, y1, x2, y2


# ── Main multi-face tracker ───────────────────────────────────────────────────
class MultiStudentTracker:
    def __init__(self, max_faces=10, window_seconds=5, fps=20):
        self.face_mesh = mp_face_mesh.FaceMesh(
            max_num_faces=max_faces,
            refine_landmarks=True,
            min_detection_confidence=0.5,
            min_tracking_confidence=0.5,
        )
        self.tracker = CentroidTracker(max_disappeared=20)
        self.buffers = {}
        self.ws      = window_seconds
        self.fps     = fps
        self.privacy = False

    def process_frame(self, frame):
        rgb     = cv2.cvtColor(frame, cv2.COLOR_BGR2RGB)
        results = self.face_mesh.process(rgb)
        h, w    = frame.shape[:2]

        face_data      = {}
        centroids      = []
        face_lms_list  = []

        if results.multi_face_landmarks:
            for fl in results.multi_face_landmarks:
                lms = fl.landmark
                c   = _face_centroid(lms, frame.shape)
                centroids.append(c)
                face_lms_list.append(lms)

        id_map = self.tracker.update(centroids)

        for fid, centroid in id_map.items():
            best_idx  = None
            best_dist = float('inf')
            for i, c in enumerate(centroids):
                d = math.hypot(c[0]-centroid[0], c[1]-centroid[1])
                if d < best_dist:
                    best_dist = d
                    best_idx  = i

            if best_idx is None or best_dist > 80:
                continue

            lms = face_lms_list[best_idx]

            if fid not in self.buffers:
                self.buffers[fid] = FaceBuffer(self.ws, self.fps)
            buf = self.buffers[fid]

            # ── Extract signals — always define defaults first ────────────────
            ear   = 0.30
            gx    = 0.50
            gy    = 0.50
            pitch = 0.0
            yaw   = 0.0
            roll  = 0.0

            try:
                ear   = (_ear(lms, LEFT_EAR_PTS, frame.shape) +
                         _ear(lms, RIGHT_EAR_PTS, frame.shape)) / 2
                gx_l, gy_l = _iris_gaze(lms, LEFT_IRIS,  LEFT_EYE,  frame.shape)
                gx_r, gy_r = _iris_gaze(lms, RIGHT_IRIS, RIGHT_EYE, frame.shape)
                gx, gy     = (gx_l+gx_r)/2, (gy_l+gy_r)/2
                pitch, yaw, roll = _head_pose(lms, frame.shape)
            except Exception as e:
                pass  # use defaults defined above

            blink_now = buf.check_blink(ear)
            buf.push(ear, gx, gy, yaw, pitch)

            raw = {
                "ear": ear, "gaze_x": gx, "gaze_y": gy,
                "pitch": pitch, "yaw": yaw, "roll": roll,
                "blink_now": blink_now,
            }

            bbox = _face_bbox(lms, frame.shape)
            face_data[fid] = {
                "raw":      raw,
                "window":   buf.window_features(),
                "bbox":     bbox,
                "centroid": centroid,
            }

            # Draw overlay
            color = FACE_COLORS[fid % len(FACE_COLORS)]

            if self.privacy:
                x1,y1,x2,y2 = bbox
                roi = frame[y1:y2, x1:x2]
                if roi.size > 0:
                    frame[y1:y2, x1:x2] = cv2.GaussianBlur(roi, (51,51), 0)
            else:
                for idx in LEFT_EYE + RIGHT_EYE:
                    cv2.circle(frame,
                        (int(lms[idx].x*w), int(lms[idx].y*h)), 1, color, -1)
                for idx in LEFT_IRIS + RIGHT_IRIS:
                    cv2.circle(frame,
                        (int(lms[idx].x*w), int(lms[idx].y*h)), 2, color, -1)

            x1,y1,x2,y2 = bbox
            cv2.rectangle(frame, (x1,y1), (x2,y2), color, 1)
            cv2.rectangle(frame, (x1,y1-22), (x1+70,y1), color, -1)
            cv2.putText(frame, f"S{fid+1:02d} EAR:{ear:.2f}",
                        (x1+3,y1-6), cv2.FONT_HERSHEY_SIMPLEX, 0.42, (0,0,0), 1)

        return frame, face_data

    def release(self):
        self.face_mesh.close()
