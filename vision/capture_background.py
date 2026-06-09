"""
Capture background frames (NO product in view) to create a 'background' class.
This teaches the model to say "not a product" instead of force-picking one,
fixing the "detected something on an empty frame" problem.

Run from the `vision/` folder with the SAME camera used by the cashier:

    .venv/Scripts/python.exe capture_background.py

Point the camera at empty/neutral scenes (table, hand, person, surroundings)
and slowly move it around for variety. Press 'q' to stop early.

Optional: set how many frames via env var, e.g. (PowerShell):
    $env:N=40; .venv/Scripts/python.exe capture_background.py
"""
import os
import time
import cv2

OUT_DIR = os.path.join("dataset", "products", "background")
os.makedirs(OUT_DIR, exist_ok=True)

N = int(os.environ.get("N", "30"))
CAM_INDEX = int(os.environ.get("CAM", "0"))

cap = cv2.VideoCapture(CAM_INDEX)
if not cap.isOpened():
    raise SystemExit(f"Cannot open camera index {CAM_INDEX}. Try CAM=1.")

print(f"Capturing {N} background frames. Aim at EMPTY scenes (no product). Press 'q' to stop.")
saved = 0
while saved < N:
    ok, frame = cap.read()
    if not ok:
        break
    cv2.imshow("background capture - press q to quit", frame)
    cv2.imwrite(os.path.join(OUT_DIR, f"bg_{int(time.time() * 1000)}.jpg"), frame)
    saved += 1
    # ~0.3s between captures so frames differ a bit
    if cv2.waitKey(300) & 0xFF == ord("q"):
        break

cap.release()
cv2.destroyAllWindows()
print(f"Saved {saved} background frames to {OUT_DIR}")
