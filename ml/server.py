"""
server.py — CogniSense Python ML Server (FastAPI + WebSocket)
Receives base64 JPEG frames from Node.js, returns cognitive load predictions.

Run:
    uvicorn server:app --host 0.0.0.0 --port 8000 --reload
"""

import sys, os, base64, json, cv2, numpy as np
sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))

from fastapi import FastAPI, WebSocket, WebSocketDisconnect
from fastapi.middleware.cors import CORSMiddleware

from vision   import MultiStudentTracker
from features import FeatureAssembler
from model    import CognitiveLoadPredictor

app = FastAPI(title="CogniSense ML Server", version="2.0")

app.add_middleware(CORSMiddleware,
    allow_origins=["*"], allow_methods=["*"], allow_headers=["*"])

# ── Shared state (one tracker per active WebSocket connection) ────────────────

class MLSession:
    def __init__(self):
        self.tracker   = MultiStudentTracker(max_faces=15, window_seconds=5, fps=20)
        self.assembler = FeatureAssembler()
        self.predictor = CognitiveLoadPredictor()
        self.frame_count = 0

    def process(self, frame_bytes: bytes, include_annotated=True):
        """
        Process raw JPEG bytes.
        Returns dict with faces list and optional annotated frame.
        """
        arr    = np.frombuffer(frame_bytes, dtype=np.uint8)
        frame  = cv2.imdecode(arr, cv2.IMREAD_COLOR)
        if frame is None:
            return {"faces": [], "annotated_frame": None}

        self.frame_count += 1
        annotated, face_data = self.tracker.process_frame(frame)

        faces = []
        for fid, fd in face_data.items():
            fv     = self.assembler.assemble(fd["window"])
            arr_f  = fv.to_array()
            result = self.predictor.predict(arr_f)
            faces.append({
                "face_id": fid,
                "result":  result,
                "raw":     {k: round(v, 4) if isinstance(v, float) else v
                            for k, v in fd["raw"].items()},
                "window":  {k: round(v, 4) if isinstance(v, float) else v
                            for k, v in fd["window"].items()},
                "bbox":    list(fd["bbox"]),
            })

        # Encode annotated frame as base64 JPEG for browser display
        annotated_b64 = None
        if include_annotated:
            _, enc = cv2.imencode('.jpg', annotated, [cv2.IMWRITE_JPEG_QUALITY, 75])
            annotated_b64 = base64.b64encode(enc).decode()

        return {"faces": faces, "annotated_frame": annotated_b64}

    def release(self):
        self.tracker.release()


# ── HTTP health endpoint ──────────────────────────────────────────────────────

@app.get("/health")
async def health():
    return {"status": "ok", "version": "2.0"}


# ── WebSocket endpoint ────────────────────────────────────────────────────────

@app.websocket("/ws/process")
async def ws_process(ws: WebSocket):
    await ws.accept()
    session = MLSession()
    print(f"[ML] WebSocket connection opened")

    try:
        while True:
            raw = await ws.receive_text()
            payload = json.loads(raw)

            client_id   = payload.get("clientId", "")
            frame_b64   = payload.get("frame", "")
            annotated   = payload.get("annotated", True)

            if not frame_b64:
                continue

            # Decode base64 frame
            try:
                frame_bytes = base64.b64decode(
                    frame_b64.split(",")[1] if "," in frame_b64 else frame_b64
                )
            except Exception as e:
                await ws.send_text(json.dumps({"error": str(e), "clientId": client_id}))
                continue

            result = session.process(frame_bytes, include_annotated=annotated)
            result["clientId"] = client_id

            await ws.send_text(json.dumps(result))

    except WebSocketDisconnect:
        print("[ML] WebSocket disconnected")
    except Exception as e:
        print(f"[ML] Error: {e}")
    finally:
        session.release()


# ── Single-frame REST endpoint (fallback for testing) ────────────────────────

@app.post("/predict")
async def predict_frame(body: dict):
    """Accepts { frame: base64_jpeg } — returns predictions."""
    session = MLSession()
    try:
        frame_b64   = body.get("frame", "")
        frame_bytes = base64.b64decode(
            frame_b64.split(",")[1] if "," in frame_b64 else frame_b64
        )
        result = session.process(frame_bytes, include_annotated=False)
        return result
    finally:
        session.release()
