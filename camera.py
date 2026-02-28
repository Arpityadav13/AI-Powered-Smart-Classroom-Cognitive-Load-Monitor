import cv2

def get_camera():
    cap = cv2.VideoCapture(0)
    return cap
cap = get_camera()
ret, frame = cap.read()
print(ret)
