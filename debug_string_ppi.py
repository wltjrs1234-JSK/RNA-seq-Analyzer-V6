import requests

BASE = "http://127.0.0.1:8500"

print("==================================================")
print("Testing /api/ppi_network for all 3 species")

# Upload mock files for each species
for sp, fname in [("sce", "mock_yeast_rnaseq.xlsx"), ("cgl", "mock_coryne_rnaseq.xlsx"), ("eco", "mock_ecoli_rnaseq.xlsx")]:
    print(f"\n--- Testing Species: {sp} ---")
    with open(fname, "rb") as f:
        up = requests.post(f"{BASE}/api/upload", files={"file": (fname, f, "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet")}, data={"species": sp})
        session_id = up.json().get("session_id")
        
    ppi_res = requests.get(f"{BASE}/api/ppi_network?species={sp}&session_id={session_id}&top_n=50&score_threshold=0.4").json()
    print("PPI Nodes Count:", len(ppi_res.get("nodes", [])))
    print("PPI Edges Count:", len(ppi_res.get("edges", [])))
    if ppi_res.get("error"):
        print("Error detail:", ppi_res.get("error"))
