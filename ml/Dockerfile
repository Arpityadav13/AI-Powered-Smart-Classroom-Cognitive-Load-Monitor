FROM python:3.11-slim

WORKDIR /app

# ✅ Install system dependencies for OpenCV
RUN apt-get update && apt-get install -y \
    libgl1 \
    libglib2.0-0 \
    && rm -rf /var/lib/apt/lists/*

COPY . /app

RUN pip install --upgrade pip
RUN pip install mediapipe opencv-python fastapi uvicorn numpy
