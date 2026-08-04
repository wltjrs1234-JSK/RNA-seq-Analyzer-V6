import requests
import json
import os
import re

DATA_DIR = "data"
os.makedirs(DATA_DIR, exist_ok=True)

def fetch_uniprot_mapping(organism_id, total_expected=4500):
    print(f"\n==================================================")
    print(f"Fetching UniProt Gene Annotations for Organism ID: {organism_id}")
    
    mapping = {}
    url = f"https://rest.uniprot.org/uniprotkb/search?query=organism_id:{organism_id}&fields=accession,gene_names,protein_name,id&size=500"
    
    while url:
        try:
            r = requests.get(url, timeout=15)
            if r.status_code != 200:
                print(f"Error status {r.status_code}")
                break
            data = r.json()
            results = data.get("results", [])
            print(f"Fetched page with {len(results)} entries... Total collected so far: {len(mapping)}")
            
            for item in results:
                genes = item.get("genes", [])
                primary_gene = None
                loci = []
                
                if genes:
                    g0 = genes[0]
                    primary_gene = g0.get("geneName", {}).get("value")
                    for loc_item in g0.get("orderedLocusNames", []):
                        val = loc_item.get("value")
                        if val:
                            loci.append(val)
                            
                protein_desc = None
                p_desc = item.get("proteinDescription", {})
                rec = p_desc.get("recommendedName", {})
                if rec and rec.get("fullName"):
                    protein_desc = rec.get("fullName", {}).get("value")
                elif p_desc.get("submissionNames"):
                    protein_desc = p_desc["submissionNames"][0].get("fullName", {}).get("value")
                elif p_desc.get("alternativeNames"):
                    protein_desc = p_desc["alternativeNames"][0].get("fullName", {}).get("value")
                    
                for locus in loci:
                    loc_clean = locus.strip()
                    loc_upper = loc_clean.upper()
                    
                    # Normalize CGL locus format (NCgl0001, Cgl0001, cg0001 -> NCgl0001)
                    if loc_upper.startswith("NCGL") or loc_upper.startswith("CGL") or loc_upper.startswith("CG"):
                        m = re.search(r'\d+', loc_upper)
                        if m:
                            num = int(m.group(0))
                            norm_tag = f"NCgl{num:04d}"
                            alt_tag = f"CGL{num:04d}"
                            alt_tag2 = f"cg{num:04d}"
                            entry = {
                                "gene_symbol": primary_gene or f"cg{num:04d}",
                                "description": protein_desc or f"Corynebacterium glutamicum protein NCgl{num:04d}"
                            }
                            mapping[norm_tag] = entry
                            mapping[alt_tag] = entry
                            mapping[alt_tag2] = entry
                    elif loc_clean.startswith("b") and loc_clean[1:].isdigit():
                        entry = {
                            "gene_symbol": primary_gene or loc_clean,
                            "description": protein_desc or f"Escherichia coli protein {loc_clean}"
                        }
                        mapping[loc_clean] = entry
                        mapping[loc_clean.upper()] = entry
                        
            # Check next page link
            link_header = r.headers.get("Link")
            url = None
            if link_header and 'rel="next"' in link_header:
                m_link = re.search(r'<(https://[^>]+)>; rel="next"', link_header)
                if m_link:
                    url = m_link.group(1)
        except Exception as e:
            print("Fetch error:", e)
            break
            
    print(f"Done fetching. Total mapped entries: {len(mapping)}")
    return mapping

# Fetch C. glutamicum (196627)
cgl_map = fetch_uniprot_mapping(196627)
with open(os.path.join(DATA_DIR, "cgl_gene_map.json"), "w", encoding="utf-8") as f:
    json.dump(cgl_map, f, ensure_ascii=False, indent=2)

# Fetch E. coli (83333)
eco_map = fetch_uniprot_mapping(83333)
with open(os.path.join(DATA_DIR, "eco_gene_map.json"), "w", encoding="utf-8") as f:
    json.dump(eco_map, f, ensure_ascii=False, indent=2)

print("\nAll gene mapping JSON files created successfully in data/")
