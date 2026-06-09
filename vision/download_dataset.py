"""
Download product photos from Supabase `product_images` into the training
dataset folder, grouped by ai_class_name. Run from the `vision/` folder
AFTER fix_product_classes.py:

    .venv/Scripts/python.exe download_dataset.py

Output: dataset/products/<ai_class_name>/<angle>_<i>.jpg
"""
import os
import urllib.request
import dotenv
from supabase import create_client

dotenv.load_dotenv()
url = os.environ.get("SUPABASE_URL")
key = os.environ.get("SUPABASE_SERVICE_ROLE_KEY")
if not url or not key:
    raise SystemExit("Missing SUPABASE_URL / SUPABASE_SERVICE_ROLE_KEY")

client = create_client(url, key)
OUT_DIR = os.path.join("dataset", "products")

products = (
    client.table("products")
    .select("id, name, ai_class_name")
    .eq("ai_enabled", True)
    .execute()
    .data
)
products = [p for p in products if p.get("ai_class_name")]

total = 0
for p in products:
    cls = p["ai_class_name"].strip()
    class_dir = os.path.join(OUT_DIR, cls)
    os.makedirs(class_dir, exist_ok=True)

    images = (
        client.table("product_images")
        .select("image_url, angle")
        .eq("product_id", p["id"])
        .execute()
        .data
    )

    saved = 0
    for i, img in enumerate(images):
        u = img.get("image_url")
        if not u:
            continue
        ext = os.path.splitext(u.split("?")[0])[1] or ".jpg"
        angle = (img.get("angle") or "img").replace("/", "-")
        dest = os.path.join(class_dir, f"{angle}_{i}{ext}")
        try:
            urllib.request.urlretrieve(u, dest)
            saved += 1
            total += 1
        except Exception as e:
            print(f"  [WARN] failed {u}: {e}")
    print(f"{p['name']} -> {cls}: {saved}/{len(images)} images")

print(f"\nTotal downloaded: {total}")
print("Next: record ~30 background frames into dataset/products/background/ (capture_background.py), then train.")
