import os
from supabase import create_client, Client

class ProductRepository:
    def __init__(self):
        url = os.environ.get("SUPABASE_URL")
        key = os.environ.get("SUPABASE_SERVICE_ROLE_KEY")
        
        if not url or not key:
            print("[REPOSITORY] ⚠️ WARNING: SUPABASE_URL or SUPABASE_SERVICE_ROLE_KEY missing in environment variables.")
            self.client = None
        else:
            try:
                print(f"[REPOSITORY] Connecting to Supabase Client ({url})...")
                self.client = create_client(url, key)
            except Exception as e:
                print(f"[REPOSITORY] ❌ Failed to initialize Supabase client: {e}")
                self.client = None
                
        self.products_cache = {}
        self.refresh_cache()

    def refresh_cache(self):
        """
        Fetch all products with ai_enabled=True from Supabase and cache them by ai_class_name.
        """
        if not self.client:
            print("[REPOSITORY] Cannot refresh cache: Supabase client not initialized.")
            return
            
        try:
            print("[REPOSITORY] Refreshing cache from Supabase products table...")
            # Query all active products
            response = self.client.table("products").select("*").eq("ai_enabled", True).execute()
            products_list = response.data
            
            # Map products by ai_class_name
            new_cache = {}
            for product in products_list:
                class_name = product.get("ai_class_name")
                if class_name:
                    new_cache[class_name.strip()] = product
                    
            self.products_cache = new_cache
            print(f"[REPOSITORY] Successfully cached {len(self.products_cache)} active AI products.")
        except Exception as e:
            print(f"[REPOSITORY] ❌ Error refreshing products cache: {e}")

    def get_product_by_class(self, ai_class_name: str) -> dict:
        """
        Find a product in the local cache by its ai_class_name.
        """
        if not ai_class_name:
            return None
        return self.products_cache.get(ai_class_name.strip())
