"""
model.py — Cognitive load ML model.

Trains a Random Forest (default) or LSTM on the feature vectors
produced by features.py.  Saves/loads model artefacts to models/.
"""

import os
import json
import pickle
import numpy as np
from pathlib import Path

from sklearn.ensemble import RandomForestClassifier, GradientBoostingClassifier
from sklearn.model_selection import train_test_split, cross_val_score
from sklearn.metrics import (classification_report, confusion_matrix,
                             accuracy_score)
from sklearn.preprocessing import StandardScaler
from sklearn.pipeline import Pipeline

# Optional: LSTM support
try:
    import torch
    import torch.nn as nn
    TORCH_AVAILABLE = True
except ImportError:
    TORCH_AVAILABLE = False

from features import FEATURE_NAMES, N_FEATURES, generate_synthetic_dataset

MODELS_DIR = Path(__file__).parent.parent / "models"
MODELS_DIR.mkdir(exist_ok=True)

LABEL_NAMES = {0: "Low", 1: "Medium", 2: "High"}
LABEL_COLORS = {0: "#22c55e", 1: "#f59e0b", 2: "#ef4444"}   # green / amber / red


# ─── Random Forest (primary model) ──────────────────────────────────────────

class CognitiveLoadRF:
    """
    Scikit-learn pipeline: StandardScaler → Gradient Boosted RF.
    Provides predict(), predict_proba(), and confidence().
    """

    MODEL_FILE = MODELS_DIR / "rf_model.pkl"
    META_FILE  = MODELS_DIR / "rf_meta.json"

    def __init__(self):
        self.pipeline: Optional[Pipeline] = None
        self.meta: dict = {}

    # ── training ────────────────────────────────────────────────────────────

    def train(self, X: np.ndarray, y: np.ndarray, verbose=True):
        X_tr, X_te, y_tr, y_te = train_test_split(
            X, y, test_size=0.20, stratify=y, random_state=42
        )

        self.pipeline = Pipeline([
            ("scaler", StandardScaler()),
            ("clf", GradientBoostingClassifier(
                n_estimators=200,
                max_depth=4,
                learning_rate=0.08,
                subsample=0.85,
                random_state=42,
            )),
        ])
        self.pipeline.fit(X_tr, y_tr)

        # Evaluate
        y_pred = self.pipeline.predict(X_te)
        acc = accuracy_score(y_te, y_pred)
        report = classification_report(y_te, y_pred,
                                       target_names=["Low","Medium","High"],
                                       output_dict=True)
        cv_scores = cross_val_score(self.pipeline, X, y, cv=5, scoring="accuracy")

        self.meta = {
            "accuracy":   acc,
            "cv_mean":    float(cv_scores.mean()),
            "cv_std":     float(cv_scores.std()),
            "report":     report,
            "feature_names": FEATURE_NAMES,
            "n_classes":  3,
        }

        if verbose:
            print(f"\n{'='*50}")
            print(f"  Model trained on {len(X_tr)} samples")
            print(f"  Test accuracy:  {acc:.3f}")
            print(f"  CV accuracy:    {cv_scores.mean():.3f} ± {cv_scores.std():.3f}")
            print(classification_report(y_te, y_pred,
                                        target_names=["Low","Medium","High"]))
            print(f"{'='*50}\n")

        return self.meta

    def save(self):
        with open(self.MODEL_FILE, "wb") as f:
            pickle.dump(self.pipeline, f)
        with open(self.META_FILE, "w") as f:
            json.dump(self.meta, f, indent=2)
        print(f"  Model saved → {self.MODEL_FILE}")

    def load(self):
        if not self.MODEL_FILE.exists():
            return False
        with open(self.MODEL_FILE, "rb") as f:
            self.pipeline = pickle.load(f)
        if self.META_FILE.exists():
            with open(self.META_FILE) as f:
                self.meta = json.load(f)
        return True

    # ── inference ────────────────────────────────────────────────────────────

    def predict(self, x: np.ndarray) -> int:
        """x: shape (N_FEATURES,) or (1, N_FEATURES)"""
        if self.pipeline is None:
            raise RuntimeError("Model not trained/loaded.")
        x2d = x.reshape(1, -1)
        return int(self.pipeline.predict(x2d)[0])

    def predict_proba(self, x: np.ndarray) -> np.ndarray:
        """Returns array of shape (3,): [P(Low), P(Medium), P(High)]"""
        if self.pipeline is None:
            raise RuntimeError("Model not trained/loaded.")
        return self.pipeline.predict_proba(x.reshape(1, -1))[0]

    def confidence(self, x: np.ndarray) -> float:
        """Max probability across classes."""
        return float(self.predict_proba(x).max())

    def feature_importances(self) -> dict:
        if self.pipeline is None:
            return {}
        clf = self.pipeline.named_steps["clf"]
        return dict(zip(FEATURE_NAMES, clf.feature_importances_))


# ─── LSTM model (optional, for time-series sequences) ────────────────────────

if TORCH_AVAILABLE:

    class LSTMCognitiveLoad(nn.Module):
        """
        Sequence-to-label LSTM.
        Input:  (batch, seq_len, N_FEATURES)
        Output: (batch, 3)  — logits
        """

        def __init__(self, input_size=N_FEATURES, hidden=64, layers=2, dropout=0.3):
            super().__init__()
            self.lstm = nn.LSTM(
                input_size=input_size,
                hidden_size=hidden,
                num_layers=layers,
                batch_first=True,
                dropout=dropout if layers > 1 else 0.0,
            )
            self.head = nn.Sequential(
                nn.LayerNorm(hidden),
                nn.Dropout(dropout),
                nn.Linear(hidden, 32),
                nn.GELU(),
                nn.Linear(32, 3),
            )

        def forward(self, x):
            out, _ = self.lstm(x)
            return self.head(out[:, -1, :])   # last time-step


# ─── Unified predictor (chooses best available) ──────────────────────────────

class CognitiveLoadPredictor:
    """
    High-level predictor used by app.py.
    Tries to load a trained RF model; falls back to heuristic.
    """

    def __init__(self):
        self.model = CognitiveLoadRF()
        self._ready = self.model.load()
        if not self._ready:
            print("  No trained model found — will use heuristic fallback.")
            print("  Run: python src/model.py  to train the model first.")

    @property
    def ready(self):
        return self._ready

    def predict(self, feature_array: np.ndarray):
        """
        Returns dict:
          label  : int  (0/1/2)
          name   : str  ("Low"/"Medium"/"High")
          color  : str  (hex)
          proba  : list[float]  len=3
          confidence: float
        """
        if self._ready:
            label = self.model.predict(feature_array)
            proba = self.model.predict_proba(feature_array).tolist()
            conf  = max(proba)
        else:
            from features import heuristic_load, FeatureVector
            # Quick reconstruct — if array passed just label heuristically
            # We import here to avoid circular deps
            fv = FeatureVector()
            for i, name in enumerate(FEATURE_NAMES):
                setattr(fv, name, float(feature_array[i]))
            label = heuristic_load(fv)
            proba = [0.0, 0.0, 0.0]
            proba[label] = 1.0
            conf = 1.0

        return {
            "label":      label,
            "name":       LABEL_NAMES[label],
            "color":      LABEL_COLORS[label],
            "proba":      proba,
            "confidence": conf,
        }


# ─── CLI trainer ─────────────────────────────────────────────────────────────

if __name__ == "__main__":
    print("\n🧠 Training cognitive load model on synthetic data...\n")
    print("  NOTE: Replace with real labelled data (e.g. DAiSEE) for best results.\n")

    X, y = generate_synthetic_dataset(n_samples=3000)
    print(f"  Dataset: {X.shape[0]} samples × {X.shape[1]} features")
    print(f"  Class distribution: {dict(zip(*np.unique(y, return_counts=True)))}\n")

    model = CognitiveLoadRF()
    meta  = model.train(X, y, verbose=True)
    model.save()

    # Feature importance report
    fi = model.feature_importances()
    top5 = sorted(fi.items(), key=lambda x: x[1], reverse=True)[:5]
    print("  Top-5 most important features:")
    for name, imp in top5:
        print(f"    {name:<30} {imp:.3f}")
    print()
