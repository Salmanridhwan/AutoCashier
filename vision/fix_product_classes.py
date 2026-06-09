"""
Fix ai_class_name + ocr_keywords for the 5 real products so they map cleanly
to dataset folder names (Stage 1 baseline). Run from the `vision/` folder:

    .venv/Scripts/python.exe fix_product_classes.py
"""
import os
import dotenv
from supabase import create_client

dotenv.load_dotenv()
url = os.environ.get("SUPABASE_URL")
key = os.environ.get("SUPABASE_SERVICE_ROLE_KEY")
if not url or not key:
    raise SystemExit("Missing SUPABASE_URL / SUPABASE_SERVICE_ROLE_KEY")

client = create_client(url, key)

# product_id -> (ai_class_name, ocr_keywords)
MAPPING = {
    "88dbf8df-3583-453a-a745-9653b761add8": ("keju_cake", ["keju", "cake"]),
    "34b6fa3d-99b9-4787-9a9b-f455cf2aa80b": ("momogi_cheese", ["momogi", "cheese"]),
    "45a9589b-e5c4-4875-a983-1b7ed4542473": ("pop_mie_ayam", ["pop", "mie", "ayam"]),
    "2de0d4f3-8581-4f6c-a6b4-1e9e6c2a23bf": ("chiki_balls", ["chiki", "balls"]),
    "dba4e91c-bcda-442f-b88d-06f15ddd9782": ("krice", ["krice"]),
}

for pid, (cls, keywords) in MAPPING.items():
    before = (
        client.table("products")
        .select("name, ai_class_name, ocr_keywords")
        .eq("id", pid)
        .single()
        .execute()
        .data
    )
    client.table("products").update(
        {"ai_class_name": cls, "ocr_keywords": keywords, "ai_enabled": True}
    ).eq("id", pid).execute()
    print(f"{before['name']}: '{before.get('ai_class_name')}' -> '{cls}'  keywords={keywords}")

print("Done. Run download_dataset.py next.")
