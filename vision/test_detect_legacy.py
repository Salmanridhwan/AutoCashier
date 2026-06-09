import requests
import json
import os
import base64

url = "http://127.0.0.1:5002/detect"
image_path = os.path.join("dataset", "products", "indomie_goreng", "mock_001.jpg")

print(f"Testing legacy base64 endpoint {url} with {image_path}...")
if not os.path.exists(image_path):
    print(f"Error: {image_path} does not exist!")
    exit(1)

with open(image_path, "rb") as f:
    encoded_string = base64.b64encode(f.read()).decode('utf-8')

payload = {
    "image": f"data:image/jpeg;base64,{encoded_string}"
}

headers = {
    "Content-Type": "application/json"
}

response = requests.post(url, json=payload, headers=headers)
    
print("Status code:", response.status_code)
try:
    print(json.dumps(response.json(), indent=2))
except Exception as e:
    print("Failed to parse JSON:", e)
    print("Response text:", response.text)
