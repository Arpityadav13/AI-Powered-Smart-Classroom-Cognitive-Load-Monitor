FROM python:3.11

WORKDIR /app

COPY . .

RUN pip install --upgrade pip
RUN pip install mediapipe opencv-python fastapi uvicorn numpy

CMD ["uvicorn", "server:app", "--host", "0.0.0.0", "--port", "8000"]
