"""
Probe available camera indices so you know which one is the UGREEN camera.
Run from the `vision/` folder:

    .venv/Scripts/python.exe list_cameras.py

For each working index it opens a preview window titled with the index.
Look at the windows, note which index shows the UGREEN feed, then press
any key to close. Use that index as CAM in capture_background.py:

    $env:CAM=1; .venv/Scripts/python.exe capture_background.py
"""
import cv2

found = []
windows = []
for idx in range(5):
    cap = cv2.VideoCapture(idx)
    if not cap.isOpened():
        cap.release()
        continue
    ok, frame = cap.read()
    if ok and frame is not None:
        h, w = frame.shape[:2]
        print(f"Camera index {idx}: OPEN  ({w}x{h})")
        found.append(idx)
        title = f"index {idx} ({w}x{h}) - identify UGREEN, then press any key"
        cv2.imshow(title, frame)
        windows.append(title)
    else:
        print(f"Camera index {idx}: opened but no frame")
    cap.release()

if not found:
    print("No cameras found. Make sure the UGREEN camera is plugged in and not used by another app (close the cashier tab).")
else:
    print(f"\nWorking indices: {found}")
    print("Press any key in a preview window to close all.")
    cv2.waitKey(0)
    cv2.destroyAllWindows()
