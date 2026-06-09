import requests
import json
import os

url = "http://127.0.0.1:5002/detect-v2"
image_path = os.path.join("dataset", "products", "indomie_goreng", "mock_001.jpg")

print(f"Uploading {image_path} to {url}...")
if not os.path.exists(image_path):
    print(f"Error: {image_path} does not exist!")
    exit(1)

with open(image_path, "rb") as f:
    files = {"file": ("mock_001.jpg", f, "image/jpeg")}
    data = {"debug": "True"}
    response = requests.post(url, files=files, data=data)
    
print("Status code:", response.status_code)
try:
    print(json.dumps(response.json(), indent=2))
except Exception as e:
    print("Failed to parse JSON:", e)
    print("Response text:", response.text)
