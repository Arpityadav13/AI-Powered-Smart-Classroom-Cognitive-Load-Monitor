"""
model.py — Cognitive load ML model (Gradient Boosted Trees).
"""

import sys, os
sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))

import json, pickle
import numpy as np
from pathlib import Path
from sklearn.ensemble import GradientBoostingClassifier
from sklearn.model_selection import train_test_split, cross_val_score
from sklearn.metrics import classification_report, accuracy_score
from sklearn.preprocessing import StandardScaler
from sklearn.pipeline import Pipeline

from features import FEATURE_NAMES, N_FEATURES, generate_synthetic_dataset

MODELS_DIR = Path(__file__).resolve().parent.parent / "models"
MODELS_DIR.mkdir(exist_ok=True)

LABEL_NAMES  = {0:"Low", 1:"Medium", 2:"High"}
LABEL_COLORS = {0:"#22c55e", 1:"#f59e0b", 2:"#ef4444"}
LABEL_EMOJI  = {0:"🟢", 1:"🟡", 2:"🔴"}


class CognitiveLoadRF:
    MODEL_FILE = MODELS_DIR / "rf_model.pkl"
    META_FILE  = MODELS_DIR / "rf_meta.json"

    def __init__(self):
        self.pipeline = None
        self.meta     = {}

    def train(self, X, y, verbose=True):
        Xtr,Xte,ytr,yte = train_test_split(X,y,test_size=0.2,stratify=y,random_state=42)
        self.pipeline = Pipeline([
            ("scaler", StandardScaler()),
            ("clf", GradientBoostingClassifier(n_estimators=200,max_depth=4,
                                               learning_rate=0.08,subsample=0.85,random_state=42)),
        ])
        self.pipeline.fit(Xtr,ytr)
        ypred = self.pipeline.predict(Xte)
        cv    = cross_val_score(self.pipeline,X,y,cv=5,scoring="accuracy")
        self.meta = dict(accuracy=accuracy_score(yte,ypred),cv_mean=float(cv.mean()),
                         cv_std=float(cv.std()),
                         report=classification_report(yte,ypred,output_dict=True,
                                                      target_names=["Low","Medium","High"]))
        if verbose:
            print(f"\n{'='*50}\n  Accuracy: {self.meta['accuracy']:.3f}  CV: {cv.mean():.3f}±{cv.std():.3f}")
            print(classification_report(yte,ypred,target_names=["Low","Medium","High"]))
        return self.meta

    def save(self):
        pickle.dump(self.pipeline, open(self.MODEL_FILE,"wb"))
        json.dump(self.meta, open(self.META_FILE,"w"), indent=2)

    def load(self):
        if not self.MODEL_FILE.exists(): return False
        self.pipeline = pickle.load(open(self.MODEL_FILE,"rb"))
        if self.META_FILE.exists():
            self.meta = json.load(open(self.META_FILE))
        return True

    def predict(self, x):
        return int(self.pipeline.predict(x.reshape(1,-1))[0])

    def predict_proba(self, x):
        return self.pipeline.predict_proba(x.reshape(1,-1))[0]

    def feature_importances(self):
        clf = self.pipeline.named_steps["clf"]
        return dict(zip(FEATURE_NAMES, clf.feature_importances_))


class CognitiveLoadPredictor:
    def __init__(self):
        self.model  = CognitiveLoadRF()
        self._ready = self.model.load()

    @property
    def ready(self): return self._ready

    def predict(self, arr: np.ndarray) -> dict:
        if self._ready:
            label = self.model.predict(arr)
            proba = self.model.predict_proba(arr).tolist()
        else:
            from features import heuristic_load, FeatureVector
            fv = FeatureVector()
            for i,n in enumerate(FEATURE_NAMES): setattr(fv,n,float(arr[i]))
            label = heuristic_load(fv)
            proba = [0.0,0.0,0.0]; proba[label]=1.0
        return dict(label=label, name=LABEL_NAMES[label],
                    color=LABEL_COLORS[label], emoji=LABEL_EMOJI[label],
                    proba=proba, confidence=max(proba))


if __name__ == "__main__":
    print("\n🧠 Training cognitive load model...\n")
    X,y = generate_synthetic_dataset(3000)
    m   = CognitiveLoadRF()
    m.train(X,y)
    m.save()
    fi  = m.feature_importances()
    print("Top features:")
    for n,v in sorted(fi.items(),key=lambda x:-x[1])[:5]:
        print(f"  {n:<30} {v:.3f}")
