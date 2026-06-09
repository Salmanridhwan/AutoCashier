"""Preview or apply normalized OCR keyword variants for active AI products.

Run from the vision folder:

    .venv/Scripts/python.exe refresh_ocr_keywords.py
    .venv/Scripts/python.exe refresh_ocr_keywords.py --apply
"""

import argparse
import os

import dotenv
from supabase import create_client

from ocr_verifier import build_product_keyword_variants


def main():
    parser = argparse.ArgumentParser()
    parser.add_argument("--apply", action="store_true", help="Write keyword changes to Supabase")
    args = parser.parse_args()

    dotenv.load_dotenv()
    url = os.environ.get("SUPABASE_URL")
    key = os.environ.get("SUPABASE_SERVICE_ROLE_KEY")
    if not url or not key:
        raise SystemExit("Missing SUPABASE_URL / SUPABASE_SERVICE_ROLE_KEY")

    client = create_client(url, key)
    products = (
        client.table("products")
        .select("id, name, ai_class_name, ocr_keywords")
        .eq("ai_enabled", True)
        .execute()
        .data
    )

    changed = 0
    for product in products:
        current = sorted({str(keyword).strip() for keyword in product.get("ocr_keywords") or [] if str(keyword).strip()})
        generated = sorted(build_product_keyword_variants(product))
        if current == generated:
            continue

        changed += 1
        added = sorted(set(generated) - set(current))
        print(f"{product['name']}: +{added}")
        if args.apply:
            client.table("products").update({"ocr_keywords": generated}).eq("id", product["id"]).execute()

    action = "Updated" if args.apply else "Would update"
    print(f"{action} {changed} of {len(products)} active AI products.")


if __name__ == "__main__":
    main()
