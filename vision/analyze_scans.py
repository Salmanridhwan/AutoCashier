import os
import json
import dotenv
from supabase import create_client

def main():
    # Load env from local directory or parent
    dotenv.load_dotenv()
    url = os.environ.get("SUPABASE_URL")
    key = os.environ.get("SUPABASE_SERVICE_ROLE_KEY")
    
    if not url or not key:
        print("Error: SUPABASE_URL or SUPABASE_SERVICE_ROLE_KEY missing in environment variables.")
        return
        
    try:
        client = create_client(url, key)
    except Exception as e:
        print(f"Error connecting to Supabase: {e}")
        return
        
    print("[ANALYSIS] Fetching scan logs from Supabase...")
    try:
        response = client.table("product_scan_logs").select("*").execute()
        logs = response.data
    except Exception as e:
        print(f"Error executing select query: {e}")
        return
    
    if not logs:
        print("[ANALYSIS] No scan logs found in the product_scan_logs table.")
        return
        
    print(f"[ANALYSIS] Total scans recorded: {len(logs)}\n")
    
    # Class statistics aggregation
    stats = {}
    for log in logs:
        cls = log.get("predicted_class", "unknown")
        dec = log.get("decision", "REJECT")
        conf = float(log.get("confidence") or 0.0)
        gap = float(log.get("gap") or 0.0)
        
        if cls not in stats:
            stats[cls] = {
                "total": 0,
                "ACCEPT": 0,
                "NEED_CONFIRMATION": 0,
                "REJECT": 0,
                "confidences": [],
                "gaps": []
            }
            
        stats[cls]["total"] += 1
        stats[cls][dec] += 1
        stats[cls]["confidences"].append(conf)
        stats[cls]["gaps"].append(gap)
        
    # Print formatted table
    print(f"{'CLASS NAME':<25} | {'TOTAL':<6} | {'ACCEPT':<6} | {'CONFIRM':<7} | {'REJECT':<6} | {'AVG CONF':<8} | {'AVG GAP':<8}")
    print("-" * 85)
    
    for cls, data in stats.items():
        avg_conf = sum(data["confidences"]) / len(data["confidences"]) if data["confidences"] else 0.0
        avg_gap = sum(data["gaps"]) / len(data["gaps"]) if data["gaps"] else 0.0
        
        print(f"{cls:<25} | {data['total']:<6} | {data['ACCEPT']:<6} | {data['NEED_CONFIRMATION']:<7} | {data['REJECT']:<6} | {avg_conf:.3f}    | {avg_gap:.3f}")
        
    print("\n" + "=" * 45)
    print("  Threshold Optimization Recommendations")
    print("=" * 45)
    
    has_recommendations = False
    for cls, data in stats.items():
        if data["total"] < 2:
            continue
        confirm_rate = data["NEED_CONFIRMATION"] / data["total"]
        reject_rate = data["REJECT"] / data["total"]
        
        if confirm_rate > 0.4:
            has_recommendations = True
            print(f"[WARN] Class '{cls}': High manual review rate ({confirm_rate*100:.1f}%).")
            print(f"    -> Action: Ensure product OCR keywords in Supabase are simple/distinct, or slightly decrease target ACCEPT confidence threshold.")
        if reject_rate > 0.5:
            has_recommendations = True
            print(f"[REJECT] Class '{cls}': High scan rejection rate ({reject_rate*100:.1f}%).")
            print(f"    -> Action: Verify lighting/placement, or retrain the ResNet-50 model with more diverse packaging views.")

    if not has_recommendations:
        print("[OK] Scanner metrics look stable. Decision rates are within acceptable margins.")

if __name__ == "__main__":
    main()
