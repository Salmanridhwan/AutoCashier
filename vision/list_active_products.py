import os
import dotenv
from supabase import create_client

dotenv.load_dotenv()
url = os.environ.get("SUPABASE_URL")
key = os.environ.get("SUPABASE_SERVICE_ROLE_KEY")

if not url or not key:
    print("Missing env variables")
    exit(1)

client = create_client(url, key)
response = client.table("products").select("id, name, price, ai_class_name, ocr_keywords, ai_enabled").eq("ai_enabled", True).execute()

print("Active AI Products in Supabase:")
print("-" * 80)
for p in response.data:
    print(f"Name: {p['name']}")
    print(f"  ID: {p['id']}")
    print(f"  Price: Rp {p['price']}")
    print(f"  AI Class Name: {p['ai_class_name']}")
    print(f"  OCR Keywords: {p['ocr_keywords']}")
    print()
