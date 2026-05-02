"""
features.py — Feature engineering for cognitive load detection.
"""

import sys, os
sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))

import numpy as np
from dataclasses import dataclass
from typing import Optional, Dict

FEATURE_NAMES = [
    "blink_rate_per_min","ear_mean","ear_std",
    "gaze_x_mean","gaze_x_std","gaze_y_mean","gaze_y_std","gaze_variance",
    "yaw_mean","yaw_range","pitch_mean","pitch_range","head_movement",
    "emotion_neutral","emotion_focused","emotion_confused","emotion_stressed","emotion_bored",
]
N_FEATURES = len(FEATURE_NAMES)

DEEPFACE_MAP = {
    "neutral":"emotion_neutral","happy":"emotion_focused","sad":"emotion_bored",
    "fear":"emotion_stressed","disgust":"emotion_stressed","angry":"emotion_stressed",
    "surprise":"emotion_confused",
}

@dataclass
class FeatureVector:
    blink_rate_per_min: float = 15.0
    ear_mean: float = 0.30; ear_std: float = 0.01
    gaze_x_mean: float = 0.50; gaze_x_std: float = 0.05
    gaze_y_mean: float = 0.50; gaze_y_std: float = 0.05
    gaze_variance: float = 0.10
    yaw_mean: float = 0.0;   yaw_range: float = 5.0
    pitch_mean: float = 0.0; pitch_range: float = 5.0
    head_movement: float = 10.0
    emotion_neutral: float = 0.4; emotion_focused: float = 0.3
    emotion_confused: float = 0.1; emotion_stressed: float = 0.1
    emotion_bored: float = 0.1

    def to_array(self):
        return np.array([getattr(self,n) for n in FEATURE_NAMES], dtype=np.float32)

def parse_deepface(emo_dict):
    r = dict(emotion_neutral=0.4,emotion_focused=0.3,emotion_confused=0.1,
             emotion_stressed=0.1,emotion_bored=0.1)
    if not emo_dict: return r
    for k in r: r[k] = 0.0
    for k,v in DEEPFACE_MAP.items():
        r[v] = r.get(v,0) + emo_dict.get(k,0)/100
    t = sum(r.values())+1e-9
    return {k:v/t for k,v in r.items()}

class FeatureAssembler:
    def assemble(self, wf: dict, emo: Optional[dict] = None) -> FeatureVector:
        e = parse_deepface(emo)
        return FeatureVector(
            blink_rate_per_min=wf.get("blink_rate_per_min",15),
            ear_mean=wf.get("ear_mean",0.30), ear_std=wf.get("ear_std",0.01),
            gaze_x_mean=wf.get("gaze_x_mean",0.50), gaze_x_std=wf.get("gaze_x_std",0.05),
            gaze_y_mean=wf.get("gaze_y_mean",0.50), gaze_y_std=wf.get("gaze_y_std",0.05),
            gaze_variance=wf.get("gaze_variance",0.10),
            yaw_mean=wf.get("yaw_mean",0.0),   yaw_range=wf.get("yaw_range",5.0),
            pitch_mean=wf.get("pitch_mean",0.0),pitch_range=wf.get("pitch_range",5.0),
            head_movement=wf.get("head_movement",10.0), **e,
        )

def heuristic_load(fv: FeatureVector) -> int:
    s = 0
    if fv.blink_rate_per_min < 8 or fv.blink_rate_per_min > 25: s += 1
    if fv.gaze_variance > 0.15: s += 1
    if fv.head_movement > 20:   s += 1
    if fv.emotion_confused > 0.25: s += 2
    if fv.emotion_stressed > 0.25: s += 2
    if fv.emotion_bored > 0.30:    s += 1
    return 2 if s >= 4 else (1 if s >= 2 else 0)

def generate_synthetic_dataset(n_samples=3000, seed=42):
    rng = np.random.default_rng(seed)
    X, y = [], []
    emo_keys = ["emotion_neutral","emotion_focused","emotion_confused","emotion_stressed","emotion_bored"]

    profiles = [
        # Low load
        dict(blink_rate_per_min=(15,3,8,25), ear_mean=(0.32,0.02,0.25,0.40),
             ear_std=(0.01,0.003,0,0.05), gaze_x_mean=(0.50,0.05,0.30,0.70),
             gaze_x_std=(0.04,0.01,0,0.12), gaze_y_mean=(0.50,0.04,0.35,0.65),
             gaze_y_std=(0.03,0.01,0,0.10), gaze_variance=(0.07,0.02,0,0.15),
             yaw_mean=(0,5,-20,20), yaw_range=(8,3,2,20), pitch_mean=(-5,5,-20,10),
             pitch_range=(6,2,2,18), head_movement=(14,4,4,30),
             emo=[0.50,0.30,0.07,0.07,0.06]),
        # Medium
        dict(blink_rate_per_min=(12,4,6,28), ear_mean=(0.29,0.025,0.20,0.38),
             ear_std=(0.015,0.005,0,0.05), gaze_x_mean=(0.50,0.08,0.25,0.75),
             gaze_x_std=(0.07,0.02,0,0.18), gaze_y_mean=(0.48,0.07,0.30,0.68),
             gaze_y_std=(0.06,0.02,0,0.15), gaze_variance=(0.13,0.03,0.04,0.25),
             yaw_mean=(0,10,-30,30), yaw_range=(18,5,5,35), pitch_mean=(-8,7,-25,15),
             pitch_range=(12,4,3,28), head_movement=(30,7,10,55),
             emo=[0.35,0.25,0.18,0.12,0.10]),
        # High
        dict(blink_rate_per_min=(7,4,0,20), ear_mean=(0.25,0.03,0.15,0.35),
             ear_std=(0.025,0.008,0,0.07), gaze_x_mean=(0.50,0.12,0.20,0.80),
             gaze_x_std=(0.13,0.04,0.03,0.28), gaze_y_mean=(0.45,0.10,0.20,0.75),
             gaze_y_std=(0.12,0.04,0.03,0.28), gaze_variance=(0.25,0.06,0.08,0.45),
             yaw_mean=(0,15,-40,40), yaw_range=(32,8,12,60), pitch_mean=(-10,10,-30,20),
             pitch_range=(22,6,8,45), head_movement=(54,10,25,90),
             emo=[0.20,0.10,0.35,0.28,0.07]),
    ]

    for label, prof in enumerate(profiles):
        n = n_samples // 3
        rows = {}
        for key in FEATURE_NAMES[:13]:
            mu,sig,lo,hi = prof[key]
            rows[key] = rng.normal(mu,sig,n).clip(lo,hi)
        # emotion
        emu = np.array(prof["emo"])
        noise = rng.dirichlet(emu*5, n)
        for i,k in enumerate(emo_keys):
            rows[k] = noise[:,i]
        X.append(np.stack([rows[k] for k in FEATURE_NAMES], axis=1))
        y.extend([label]*n)

    return np.vstack(X).astype(np.float32), np.array(y,dtype=int)
