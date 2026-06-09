import requests
import json
import os

url = "http://localhost:5000/api/kasir/detect-v2"
image_path = os.path.join("dataset", "products", "indomie_goreng", "mock_001.jpg")

print(f"Uploading {image_path} to Express proxy {url}...")
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
