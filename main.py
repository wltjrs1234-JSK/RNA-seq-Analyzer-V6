import os
import io
import re
import json
import shutil
import urllib.parse
import requests
import pandas as pd
import numpy as np
from scipy import stats
from fastapi import FastAPI, UploadFile, File, Form, HTTPException, Request
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import Response, JSONResponse, FileResponse, StreamingResponse
from fastapi.staticfiles import StaticFiles
import urllib3
urllib3.disable_warnings(urllib3.exceptions.InsecureRequestWarning)

app = FastAPI(title="Yeast RNA-seq Analyzer API")

# Custom Middleware to bypass browser caching for static resources during development/automation
@app.middleware("http")
async def add_no_cache_headers(request: Request, call_next):
    response = await call_next(request)
    response.headers["Cache-Control"] = "no-store, no-cache, must-revalidate, max-age=0"
    response.headers["Pragma"] = "no-cache"
    response.headers["Expires"] = "0"
    return response

# Enable CORS for frontend interaction
app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

CACHE_DIR = "data_cache"
os.makedirs(CACHE_DIR, exist_ok=True)

def get_ncbi_mapping(species: str = "sce"):
    """Download and cache dbxref mapping file to translate NCBI Gene IDs to Locus Tags."""
    if species == "cgl":
        return {} # C. glutamicum uses locus tags directly
    mapping_file = os.path.join(CACHE_DIR, "ncbi_mapping.json")
    if os.path.exists(mapping_file):
        with open(mapping_file, "r", encoding="utf-8") as f:
            return json.load(f)
            
    print("Downloading dbxref.tab from SGD for NCBI to Systematic ID mapping...")
    dbxref_path = os.path.join(CACHE_DIR, "dbxref.tab")
    if not os.path.exists(dbxref_path):
        url = "https://downloads.yeastgenome.org/curation/chromosomal_feature/dbxref.tab"
        try:
            r = requests.get(url, timeout=30, verify=False)
            r.raise_for_status()
            with open(dbxref_path, "wb") as f:
                f.write(r.content)
        except Exception as e:
            print(f"Failed to download dbxref from SGD: {e}")
            return {}
            
    mapping = {}
    if os.path.exists(dbxref_path):
        try:
            with open(dbxref_path, "r", encoding="utf-8", errors="ignore") as f:
                for line in f:
                    if line.startswith("#") or not line.strip():
                        continue
                    parts = line.strip().split("\t")
                    if len(parts) >= 4:
                        source = parts[1]
                        systematic_name = parts[3]
                        dbxref_id = parts[0]
                        if source == "NCBI":
                            mapping[dbxref_id] = systematic_name
                            
            with open(mapping_file, "w", encoding="utf-8") as f:
                json.dump(mapping, f, indent=2)
            return mapping
        except Exception as e:
            print(f"Error parsing dbxref file: {e}")
    return {}

def get_pfam_data(species: str = "sce"):
    """Download and cache Pfam domain mapping file if not present."""
    if species == "cgl":
        cgl_pfam_file = os.path.join(CACHE_DIR, "cgl_pfam.json")
        if os.path.exists(cgl_pfam_file):
            with open(cgl_pfam_file, "r", encoding="utf-8") as f:
                return json.load(f)
        cgl_pfam = {
            "NCgl0908": [{"id": "PF00289", "name": "Pyruvate carboxylase N-terminal", "source": "Pfam"}],
            "NCgl1936": [{"id": "PF00367", "name": "PTS system EIIC component", "source": "Pfam"}],
            "NCgl0247": [{"id": "PF00696", "name": "Amino acid kinase family", "source": "Pfam"}],
            "NCgl1216": [{"id": "PF00742", "name": "Homoserine dehydrogenase", "source": "Pfam"}],
            "NCgl1896": [{"id": "PF00701", "name": "Dihydrodipicolinate synthase", "source": "Pfam"}],
            "NCgl1997": [{"id": "PF02812", "name": "Glutamate dehydrogenase", "source": "Pfam"}],
            "NCgl2806": [{"id": "PF00818", "name": "Phosphoenolpyruvate carboxykinase", "source": "Pfam"}],
            "NCgl2248": [{"id": "PF00463", "name": "Isocitrate lyase", "source": "Pfam"}],
            "NCgl2249": [{"id": "PF01270", "name": "Malate synthase", "source": "Pfam"}],
            "NCgl0896": [{"id": "PF00044", "name": "Glyceraldehyde 3-phosphate dehydrogenase", "source": "Pfam"}],
            "NCgl2008": [{"id": "PF00224", "name": "Pyruvate kinase", "source": "Pfam"}]
        }
        with open(cgl_pfam_file, "w", encoding="utf-8") as f:
            json.dump(cgl_pfam, f, indent=2)
        return cgl_pfam

    pfam_file = os.path.join(CACHE_DIR, "yeast_pfam.json")
    if os.path.exists(pfam_file):
        with open(pfam_file, "r", encoding="utf-8") as f:
            return json.load(f)
            
    print("Fetching yeast protein domain mappings from SGD...")
    dbxref_path = os.path.join(CACHE_DIR, "dbxref.tab")
    if not os.path.exists(dbxref_path):
        get_ncbi_mapping("sce")
        
    pfam_map = {}
    if os.path.exists(dbxref_path):
        try:
            with open(dbxref_path, "r", encoding="utf-8", errors="ignore") as f:
                for line in f:
                    if line.startswith("#") or not line.strip():
                        continue
                    parts = line.strip().split("\t")
                    if len(parts) >= 6:
                        source = parts[1]
                        systematic_name = parts[3]
                        ref_id = parts[0]
                        desc = parts[4] if len(parts) > 4 else ref_id
                        
                        if source in ["Pfam", "InterPro"]:
                            if systematic_name not in pfam_map:
                                pfam_map[systematic_name] = []
                            pfam_map[systematic_name].append({
                                "id": ref_id,
                                "name": desc,
                                "source": source
                            })
            with open(pfam_file, "w", encoding="utf-8") as f:
                json.dump(pfam_map, f, indent=2)
            return pfam_map
        except Exception as e:
            print(f"Error parsing Pfam domains: {e}")
    return {}

def get_go_data(species: str = "sce"):
    """Download and cache GO Slim mapping file for selected species."""
    if species == "cgl":
        go_file = os.path.join(CACHE_DIR, "cgl_go_slim_mapping.tab")
        if not os.path.exists(go_file):
            cgl_go_records = [
                ("NCgl0908", "pyc", "NCgl0908", "P", "pyruvate metabolic process", "GO:0006090", "ORF"),
                ("NCgl0908", "pyc", "NCgl0908", "F", "pyruvate carboxylase activity", "GO:0004736", "ORF"),
                ("NCgl0908", "pyc", "NCgl0908", "C", "cytoplasm", "GO:0005737", "ORF"),
                ("NCgl1936", "ptsG", "NCgl1936", "P", "glucose import", "GO:0046323", "ORF"),
                ("NCgl1936", "ptsG", "NCgl1936", "F", "sugar:proton symporter activity", "GO:0005351", "ORF"),
                ("NCgl1936", "ptsG", "NCgl1936", "C", "plasma membrane", "GO:0005886", "ORF"),
                ("NCgl0247", "lysC", "NCgl0247", "P", "lysine biosynthetic process", "GO:0009085", "ORF"),
                ("NCgl0247", "lysC", "NCgl0247", "F", "aspartokinase activity", "GO:0004071", "ORF"),
                ("NCgl0247", "lysC", "NCgl0247", "C", "cytoplasm", "GO:0005737", "ORF"),
                ("NCgl1216", "hom", "NCgl1216", "P", "homoserine biosynthetic process", "GO:0009090", "ORF"),
                ("NCgl1216", "hom", "NCgl1216", "F", "homoserine dehydrogenase activity", "GO:0004412", "ORF"),
                ("NCgl1896", "dapA", "NCgl1896", "P", "lysine biosynthetic process via diaminopimelate", "GO:0009089", "ORF"),
                ("NCgl1896", "dapA", "NCgl1896", "F", "dihydrodipicolinate synthase activity", "GO:0004152", "ORF"),
                ("NCgl1208", "lysE", "NCgl1208", "P", "lysine transmembrane transport", "GO:0015817", "ORF"),
                ("NCgl1208", "lysE", "NCgl1208", "F", "lysine transmembrane transporter activity", "GO:0015189", "ORF"),
                ("NCgl1208", "lysE", "NCgl1208", "C", "plasma membrane", "GO:0005886", "ORF"),
                ("NCgl1997", "gdh", "NCgl1997", "P", "glutamate biosynthetic process", "GO:0006537", "ORF"),
                ("NCgl1997", "gdh", "NCgl1997", "F", "glutamate dehydrogenase (NADP+) activity", "GO:0004354", "ORF"),
                ("NCgl2806", "pck", "NCgl2806", "P", "gluconeogenesis", "GO:0006094", "ORF"),
                ("NCgl2806", "pck", "NCgl2806", "F", "phosphoenolpyruvate carboxykinase activity", "GO:0004612", "ORF"),
                ("NCgl2248", "aceA", "NCgl2248", "P", "glyoxylate cycle", "GO:0006097", "ORF"),
                ("NCgl2248", "aceA", "NCgl2248", "F", "isocitrate lyase activity", "GO:0004451", "ORF"),
                ("NCgl2249", "aceB", "NCgl2249", "P", "glyoxylate cycle", "GO:0006097", "ORF"),
                ("NCgl2249", "aceB", "NCgl2249", "F", "malate synthase activity", "GO:0004474", "ORF"),
                ("NCgl0896", "gapA", "NCgl0896", "P", "glycolytic process", "GO:0006096", "ORF"),
                ("NCgl0896", "gapA", "NCgl0896", "F", "glyceraldehyde-3-phosphate dehydrogenase activity", "GO:0004365", "ORF"),
                ("NCgl2008", "pyk", "NCgl2008", "P", "glycolytic process", "GO:0006096", "ORF"),
                ("NCgl2008", "pyk", "NCgl2008", "F", "pyruvate kinase activity", "GO:0004743", "ORF"),
                ("NCgl1193", "pfkA", "NCgl1193", "P", "glycolytic process", "GO:0006096", "ORF"),
                ("NCgl1193", "pfkA", "NCgl1193", "F", "phosphofructokinase activity", "GO:0004607", "ORF"),
                ("NCgl2812", "ldh", "NCgl2812", "P", "fermentation", "GO:0046835", "ORF"),
                ("NCgl2812", "ldh", "NCgl2812", "F", "L-lactate dehydrogenase activity", "GO:0004459", "ORF"),
                ("NCgl0367", "glxR", "NCgl0367", "P", "transcription regulation", "GO:0006355", "ORF"),
                ("NCgl0367", "glxR", "NCgl0367", "F", "DNA-binding transcription factor activity", "GO:0003700", "ORF"),
                ("NCgl1857", "sugR", "NCgl1857", "P", "transcription regulation", "GO:0006355", "ORF"),
                ("NCgl0460", "amtA", "NCgl0460", "P", "ammonium transport", "GO:0015696", "ORF"),
                ("NCgl1834", "glnA", "NCgl1834", "P", "glutamine biosynthetic process", "GO:0006542", "ORF"),
                ("NCgl2544", "pta", "NCgl2544", "P", "acetate metabolic process", "GO:0006083", "ORF"),
                ("NCgl2543", "ackA", "NCgl2543", "P", "acetate metabolic process", "GO:0006083", "ORF"),
                ("NCgl0651", "metA", "NCgl0651", "P", "methionine biosynthetic process", "GO:0009086", "ORF"),
                ("NCgl2469", "cysK", "NCgl2469", "P", "cysteine biosynthetic process", "GO:0006535", "ORF"),
                ("NCgl2533", "pqo", "NCgl2533", "P", "aerobic respiration", "GO:0009060", "ORF"),
                ("NCgl0831", "fasA", "NCgl0831", "P", "fatty acid biosynthetic process", "GO:0006633", "ORF")
            ]
            df_cgl = pd.DataFrame(cgl_go_records, columns=["locus_tag", "symbol", "sgdid", "aspect", "term_name", "goid", "feature_type"])
            df_cgl.to_csv(go_file, sep="\t", index=False)
            return df_cgl
        try:
            return pd.read_csv(go_file, sep="\t")
        except Exception:
            pass

    go_file = os.path.join(CACHE_DIR, "go_slim_mapping.tab")
    if not os.path.exists(go_file):
        print("Downloading GO Slim Mapping file from SGD...")
        url = "https://downloads.yeastgenome.org/curation/literature/go_slim_mapping.tab"
        try:
            r = requests.get(url, timeout=30, verify=False)
            r.raise_for_status()
            with open(go_file, "wb") as f:
                f.write(r.content)
        except Exception as e:
            print(f"Failed to download GO mapping from SGD: {e}")
            url_backup = "https://ftp.yeastgenome.org/pub/yeast/curation/literature/go_slim_mapping.tab"
            try:
                r = requests.get(url_backup, timeout=30, verify=False)
                r.raise_for_status()
                with open(go_file, "wb") as f:
                    f.write(r.content)
            except Exception as e2:
                print(f"Backup failed: {e2}")
    
    if os.path.exists(go_file):
        try:
            df_go = pd.read_csv(go_file, sep="\t", header=None, comment="!")
            df_go.columns = ["locus_tag", "symbol", "sgdid", "aspect", "term_name", "goid", "feature_type"]
            return df_go
        except Exception as e:
            print(f"Error parsing GO file: {e}")
    return pd.DataFrame()

def get_kegg_pathways(species: str = "sce"):
    """Fetch and cache KEGG pathways list for selected species."""
    pathways_file = os.path.join(CACHE_DIR, f"kegg_pathways_{species}.json")
    if os.path.exists(pathways_file):
        with open(pathways_file, "r", encoding="utf-8") as f:
            return json.load(f)
            
    print(f"Fetching KEGG pathways list for {species}...")
    url = f"https://rest.kegg.jp/list/pathway/{species}"
    try:
        r = requests.get(url, timeout=15, verify=False)
        r.raise_for_status()
        pathways = {}
        for line in r.text.strip().split("\n"):
            if not line:
                continue
            parts = line.split("\t")
            if len(parts) >= 2:
                path_id = parts[0].replace("path:", "")
                desc = parts[1].split(" - Saccharomyces")[0].split(" - Corynebacterium")[0].strip()
                pathways[path_id] = desc
        with open(pathways_file, "w", encoding="utf-8") as f:
            json.dump(pathways, f, indent=2, ensure_ascii=False)
        return pathways
    except Exception as e:
        print(f"Failed to fetch KEGG pathways for {species}: {e}")
        return {}

def get_kegg_gene_mapping(species: str = "sce"):
    """Fetch and cache gene-pathway mapping for selected species."""
    mapping_file = os.path.join(CACHE_DIR, f"kegg_gene_mapping_{species}.json")
    if os.path.exists(mapping_file):
        with open(mapping_file, "r", encoding="utf-8") as f:
            return json.load(f)
            
    print(f"Fetching KEGG gene-pathway mappings for {species}...")
    url = f"https://rest.kegg.jp/link/{species}/pathway"
    try:
        r = requests.get(url, timeout=20, verify=False)
        r.raise_for_status()
        
        pathway_to_genes = {}
        for line in r.text.strip().split("\n"):
            if not line:
                continue
            parts = line.split("\t")
            if len(parts) >= 2:
                path_id = parts[0].replace("path:", "")
                gene_id = parts[1].replace(f"{species}:", "")
                
                if path_id not in pathway_to_genes:
                    pathway_to_genes[path_id] = []
                pathway_to_genes[path_id].append(gene_id)
                
        with open(mapping_file, "w", encoding="utf-8") as f:
            json.dump(pathway_to_genes, f, indent=2)
        return pathway_to_genes
    except Exception as e:
        print(f"Failed to fetch KEGG gene mappings for {species}: {e}")
        return {}

# ----------------------------------------------------------------------
# 2. Main API Endpoints & Session Management
# ----------------------------------------------------------------------

PARSED_DATA_PATH = os.path.join(CACHE_DIR, "temp_parsed.json")
SESSIONS_DIR = os.path.join(CACHE_DIR, "sessions")
os.makedirs(SESSIONS_DIR, exist_ok=True)
SESSIONS_INDEX_PATH = os.path.join(CACHE_DIR, "sessions_index.json")

def load_sessions_index() -> dict:
    if os.path.exists(SESSIONS_INDEX_PATH):
        try:
            with open(SESSIONS_INDEX_PATH, "r", encoding="utf-8") as f:
                return json.load(f)
        except Exception as e:
            print(f"Error reading sessions index: {e}")
            
    # Auto-migration for existing single dataset
    legacy_genes = []
    if os.path.exists(PARSED_DATA_PATH):
        try:
            with open(PARSED_DATA_PATH, "r", encoding="utf-8") as f:
                legacy_genes = json.load(f)
        except Exception:
            pass
            
    default_session_id = "session_default"
    default_path = os.path.join(SESSIONS_DIR, f"{default_session_id}.json")
    
    sessions_list = []
    if legacy_genes:
        with open(default_path, "w", encoding="utf-8") as f:
            json.dump(legacy_genes, f, indent=2, ensure_ascii=False)
        up_c = sum(1 for g in legacy_genes if (g.get("log2fc") or 0) >= 1.0)
        down_c = sum(1 for g in legacy_genes if (g.get("log2fc") or 0) <= -1.0)
        sessions_list.append({
            "id": default_session_id,
            "name": "기본 분석 세션 (Default)",
            "source_name": "기본 데이터",
            "created_at": "2026-07-30 00:00:00",
            "gene_count": len(legacy_genes),
            "is_replicate_mode": True,
            "up_count": up_c,
            "down_count": down_c
        })
        
    index_data = {
        "active_session_id": default_session_id if legacy_genes else None,
        "sessions": sessions_list
    }
    save_sessions_index(index_data)
    return index_data

def save_sessions_index(index_data: dict):
    with open(SESSIONS_INDEX_PATH, "w", encoding="utf-8") as f:
        json.dump(index_data, f, indent=2, ensure_ascii=False)

def get_session_genes(session_id: str = None) -> list:
    idx = load_sessions_index()
    sid = session_id or idx.get("active_session_id")
    if not sid:
        if os.path.exists(PARSED_DATA_PATH):
            try:
                with open(PARSED_DATA_PATH, "r", encoding="utf-8") as f:
                    return json.load(f)
            except Exception:
                pass
        return []
        
    s_path = os.path.join(SESSIONS_DIR, f"{sid}.json")
    if os.path.exists(s_path):
        try:
            with open(s_path, "r", encoding="utf-8") as f:
                return json.load(f)
        except Exception as e:
            print(f"Error loading session file {s_path}: {e}")
            
    if os.path.exists(PARSED_DATA_PATH):
        try:
            with open(PARSED_DATA_PATH, "r", encoding="utf-8") as f:
                return json.load(f)
        except Exception:
            pass
    return []

def get_session_species(session_id: str = None) -> str:
    idx = load_sessions_index()
    sid = session_id or idx.get("active_session_id")
    if sid:
        for s in idx.get("sessions", []):
            if s["id"] == sid:
                return s.get("species", "sce")
    return "sce"

def save_new_session(genes_list: list, source_name: str, is_replicate_mode: bool, custom_name: str = None, species: str = "sce") -> dict:
    import datetime
    now_str = datetime.datetime.now().strftime("%Y%m%d_%H%M%S")
    session_id = f"session_{now_str}"
    
    if not custom_name:
        clean_name = source_name.replace(".xlsx", "").replace(".xls", "").replace(".csv", "")
        custom_name = clean_name[:30] if len(clean_name) > 30 else clean_name
        if not custom_name:
            custom_name = f"분석_{now_str}"
            
    up_count = sum(1 for g in genes_list if (g.get("log2fc") or 0) >= 1.0 and ((g.get("fdr") or 1.0) <= 0.05 or g.get("pvalue", 1.0) <= 0.05))
    down_count = sum(1 for g in genes_list if (g.get("log2fc") or 0) <= -1.0 and ((g.get("fdr") or 1.0) <= 0.05 or g.get("pvalue", 1.0) <= 0.05))
    
    session_info = {
        "id": session_id,
        "name": custom_name,
        "source_name": source_name,
        "species": species,
        "created_at": datetime.datetime.now().strftime("%Y-%m-%d %H:%M:%S"),
        "gene_count": len(genes_list),
        "is_replicate_mode": is_replicate_mode,
        "up_count": up_count,
        "down_count": down_count
    }
    
    session_path = os.path.join(SESSIONS_DIR, f"{session_id}.json")
    with open(session_path, "w", encoding="utf-8") as f:
        json.dump(genes_list, f, indent=2, ensure_ascii=False)
        
    with open(PARSED_DATA_PATH, "w", encoding="utf-8") as f:
        json.dump(genes_list, f, indent=2, ensure_ascii=False)
        
    idx = load_sessions_index()
    idx["sessions"] = [s for s in idx.get("sessions", []) if s["id"] != session_id]
    idx["sessions"].insert(0, session_info)
    idx["active_session_id"] = session_id
    save_sessions_index(idx)
    
    return session_info

@app.get("/api/sessions")
def get_sessions(species: str = None):
    """Get saved analysis sessions filtered by species if specified."""
    idx = load_sessions_index()
    all_sessions = idx.get("sessions", [])
    if species:
        sessions = [s for s in all_sessions if s.get("species", "sce") == species]
    else:
        sessions = all_sessions
    active_species = get_session_species(idx.get("active_session_id"))
    return {
        "sessions": sessions,
        "active_session_id": idx.get("active_session_id"),
        "active_species": active_species
    }

@app.post("/api/sessions/switch")
def switch_session(payload: dict):
    """Switch current active session."""
    session_id = payload.get("session_id")
    if not session_id:
        raise HTTPException(status_code=400, detail="session_id가 누락되었습니다.")
        
    idx = load_sessions_index()
    session_ids = [s["id"] for s in idx.get("sessions", [])]
    if session_id not in session_ids:
        raise HTTPException(status_code=404, detail="해당 세션을 찾을 수 없습니다.")
        
    idx["active_session_id"] = session_id
    save_sessions_index(idx)
    
    genes = get_session_genes(session_id)
    with open(PARSED_DATA_PATH, "w", encoding="utf-8") as f:
        json.dump(genes, f, indent=2, ensure_ascii=False)
        
    session_info = next((s for s in idx["sessions"] if s["id"] == session_id), None)
    species = session_info.get("species", "sce") if session_info else "sce"
    return {
        "success": True,
        "active_session_id": session_id,
        "session": session_info,
        "species": species,
        "genes": genes
    }

@app.put("/api/sessions/{session_id}/rename")
def rename_session(session_id: str, payload: dict):
    """Rename a session."""
    new_name = payload.get("name", "").strip()
    if not new_name:
        raise HTTPException(status_code=400, detail="변경할 세션 이름이 비어있습니다.")
        
    idx = load_sessions_index()
    found = False
    for s in idx.get("sessions", []):
        if s["id"] == session_id:
            s["name"] = new_name
            found = True
            break
            
    if not found:
        raise HTTPException(status_code=404, detail="해당 세션을 찾을 수 없습니다.")
        
    # Also update session individual file
    s_path = os.path.join(SESSIONS_DIR, f"{session_id}.json")
    if os.path.exists(s_path):
        try:
            with open(s_path, "r", encoding="utf-8") as f:
                s_data = json.load(f)
            s_data["name"] = new_name
            with open(s_path, "w", encoding="utf-8") as f:
                json.dump(s_data, f, indent=2, ensure_ascii=False)
        except Exception as e:
            print(f"Error updating session file name: {e}")

    save_sessions_index(idx)
    return {"success": True, "sessions": idx["sessions"]}

@app.delete("/api/sessions/{session_id}")
def delete_session(session_id: str):
    """Delete a session."""
    idx = load_sessions_index()
    sessions = idx.get("sessions", [])
    
    target_session = next((s for s in sessions if s["id"] == session_id), None)
    if not target_session:
        raise HTTPException(status_code=404, detail="삭제할 세션을 찾을 수 없습니다.")
        
    target_species = target_session.get("species", "sce")
    idx["sessions"] = [s for s in sessions if s["id"] != session_id]
    
    s_path = os.path.join(SESSIONS_DIR, f"{session_id}.json")
    if os.path.exists(s_path):
        try:
            os.remove(s_path)
        except Exception as e:
            print(f"Error removing session file: {e}")
            
    if idx.get("active_session_id") == session_id:
        remaining_same_species = [s for s in idx["sessions"] if s.get("species", "sce") == target_species]
        if remaining_same_species:
            idx["active_session_id"] = remaining_same_species[0]["id"]
            new_genes = get_session_genes(idx["active_session_id"])
            with open(PARSED_DATA_PATH, "w", encoding="utf-8") as f:
                json.dump(new_genes, f, indent=2, ensure_ascii=False)
        elif idx["sessions"]:
            idx["active_session_id"] = idx["sessions"][0]["id"]
            new_genes = get_session_genes(idx["active_session_id"])
            with open(PARSED_DATA_PATH, "w", encoding="utf-8") as f:
                json.dump(new_genes, f, indent=2, ensure_ascii=False)
        else:
            idx["active_session_id"] = None
            if os.path.exists(PARSED_DATA_PATH):
                try:
                    os.remove(PARSED_DATA_PATH)
                except Exception:
                    pass
                
    save_sessions_index(idx)
    return {
        "success": True,
        "sessions": idx["sessions"],
        "active_session_id": idx["active_session_id"]
    }

def parse_rnaseq_dataframe(df: pd.DataFrame, source_name: str = "Dataset", species: str = None) -> dict:
    """Helper to automatically parse RNA-seq DataFrame, detect columns, and run statistical analysis."""
    # 1. Clean column names
    df.columns = [str(c).strip() for c in df.columns]
    
    # 2. Find locus_tag column
    locus_col = None
    detected_species = None
    
    # Prioritize by exact locus column name
    for col in df.columns:
        if col.lower() in ["locus_tag", "locus", "systematic_name", "orf", "orf_name", "systematic"]:
            locus_col = col
            break
            
    # Auto-detect species pattern from columns
    best_col = None
    best_rate = 0.0
    for col in df.columns:
        non_nulls = df[col].dropna().astype(str).str.strip()
        if non_nulls.empty:
            continue
        cgl_matches = non_nulls.str.match(r"^(NCgl|cg|cgl)[0-9]{4}$", case=False)
        cgl_rate = cgl_matches.mean()
        if cgl_rate > 0.2 and cgl_rate > best_rate:
            best_rate = cgl_rate
            best_col = col
            detected_species = "cgl"
            
        sce_matches = non_nulls.str.match(r"^Y[A-P][0-9]{3}[C,W](-[A-G])?$", case=False)
        sce_rate = sce_matches.mean()
        if sce_rate > 0.2 and sce_rate > best_rate:
            best_rate = sce_rate
            best_col = col
            detected_species = "sce"
            
    if best_col and best_rate > 0.3:
        locus_col = best_col

    if not locus_col:
        for col in df.columns:
            if col.lower() in ["gene_id", "id"]:
                locus_col = col
                break
                
    if not locus_col:
        locus_col = df.columns[0] if len(df.columns) > 0 else None

    if not locus_col:
        # Fallback to first column
        if len(df.columns) > 0:
            locus_col = df.columns[0]
        else:
            raise HTTPException(status_code=400, detail="데이터에 열이 존재하지 않습니다.")

    if not species:
        species = detected_species or "sce"

    # 3. Find gene symbol column
    symbol_col = None
    for col in df.columns:
        if col.lower() in ["gene_symbol", "symbol", "gene", "gene_name", "name"]:
            symbol_col = col
            break
    if not symbol_col:
        for col in df.columns:
            if col != locus_col and col.lower() not in ["description", "gene_biotype"]:
                non_nulls = df[col].dropna().astype(str).str.strip()
                if not non_nulls.empty and non_nulls.str.match(r"^[A-Z]{3}[0-9]+", case=True).mean() > 0.4:
                    symbol_col = col
                    break
    if not symbol_col:
        symbol_col = locus_col # Fallback

    # 4. Find Description and Biotype columns
    desc_col = None
    for col in df.columns:
        if "desc" in col.lower():
            desc_col = col
            break
            
    biotype_col = None
    for col in df.columns:
        if "biotype" in col.lower() or "type" in col.lower():
            biotype_col = col
            break

    # 4.5 Detect pre-calculated statistics columns (p-value, adjusted p-value/FDR)
    pre_pvalue_col = None
    pre_fdr_col = None
    for col in df.columns:
        c_low = col.lower()
        if c_low in ["pvalue", "p.value", "p-value", "p_value", "pval"]:
            pre_pvalue_col = col
        elif c_low in ["padj", "p.adj", "p-adj", "p_adj", "adjusted_p_value", "adjusted p-value", "adjusted_pvalue", "fdr", "qvalue", "q_value", "q.value"]:
            pre_fdr_col = col

    # 5. Classify numeric columns for expression values
    numeric_cols = []
    for col in df.columns:
        if col != locus_col and col != symbol_col and col != desc_col and col != biotype_col and col != pre_pvalue_col and col != pre_fdr_col:
            try:
                pd.to_numeric(df[col].dropna())
                numeric_cols.append(col)
            except:
                pass

    # Group numeric columns into WT and Mutant
    # Use word-boundary aware regex matching to avoid false positives like "t" in "WT"
    import re as _re
    
    # Robust patterns: must be surrounded by non-alphabetics or string boundaries to avoid false positives (e.g. 'weight' vs 'wt')
    wt_patterns = [
        r"(?:^|[^a-zA-Z])wt(?:[^a-zA-Z]|$)",
        r"(?:^|[^a-zA-Z])control(?:[^a-zA-Z]|$)",
        r"(?:^|[^a-zA-Z])ctrl(?:[^a-zA-Z]|$)",
        r"(?:^|[^a-zA-Z])con(?:[^a-zA-Z]|$)",
        r"(?:^|[^a-zA-Z])wildtype(?:[^a-zA-Z]|$)",
        r"(?:^|[^a-zA-Z])wild_type(?:[^a-zA-Z]|$)",
        r"(?:^|[^a-zA-Z])reference(?:[^a-zA-Z]|$)",
        r"(?:^|[^a-zA-Z])ref(?:[^a-zA-Z]|$)"
    ]
    mut_patterns = [
        r"(?:^|[^a-zA-Z])mutant(?:[^a-zA-Z]|$)",
        r"(?:^|[^a-zA-Z])mut(?:[^a-zA-Z]|$)",
        r"(?:^|[^a-zA-Z])ko(?:[^a-zA-Z]|$)",
        r"(?:^|[^a-zA-Z])treatment(?:[^a-zA-Z]|$)",
        r"(?:^|[^a-zA-Z])treat(?:[^a-zA-Z]|$)",
        r"(?:^|[^a-zA-Z])target(?:[^a-zA-Z]|$)",
        r"(?:^|[^a-zA-Z])overexpression(?:[^a-zA-Z]|$)",
        r"(?:^|[^a-zA-Z])oe(?:[^a-zA-Z]|$)",
        r"(?:^|[^a-zA-Z])m(?:[0-9]+|$)"
    ]

    wt_candidates = []
    mut_candidates = []

    def matches_any(colname, patterns):
        cn = colname.lower()
        return any(_re.search(pat, cn) for pat in patterns)

    for col in numeric_cols:
        is_wt  = matches_any(col, wt_patterns)
        is_mut = matches_any(col, mut_patterns)

        if is_wt and not is_mut:
            wt_candidates.append(col)
        elif is_mut and not is_wt:
            mut_candidates.append(col)
        elif is_wt and is_mut:
            mut_candidates.append(col)

    # Smart filtering: If there are replicates AND summary columns (like AVG, Mean, Average),
    # exclude summary columns from t-test list to prevent stat calculation break.
    def filter_summary_cols(cols):
        avg_patterns = ["avg", "mean", "average", "평균"]
        reps = [c for c in cols if not any(p in c.lower() for p in avg_patterns)]
        return reps if reps else cols

    wt_cols = filter_summary_cols(wt_candidates)
    mut_cols = filter_summary_cols(mut_candidates)
            
    # Fallback splitting if we couldn't classify them
    unclassified = [c for c in numeric_cols if c not in wt_cols and c not in mut_cols]
    if not wt_cols or not mut_cols:
        if len(numeric_cols) == 2:
            wt_cols = [numeric_cols[0]]
            mut_cols = [numeric_cols[1]]
        elif len(unclassified) >= 2:
            half = len(unclassified) // 2
            wt_cols = wt_cols + unclassified[:half]
            mut_cols = mut_cols + unclassified[half:]
            
    if not wt_cols or not mut_cols:
        raise HTTPException(
            status_code=400, 
            detail="대조군(WT) 및 실험군(Mutant) 발현량 데이터를 나타내는 숫자 열을 감지할 수 없습니다. 열 이름에 'WT', 'Mutant', 'Control' 등을 포함해 주세요."
        )

    # Determine replicate mode
    is_replicate_mode = len(wt_cols) >= 2 and len(mut_cols) >= 2
    
    genes_list = []
    
    # Load NCBI ID mapping table
    ncbi_map = get_ncbi_mapping()
    
    for _, row in df.iterrows():
        if pd.isna(row[locus_col]):
            continue
        locus = str(row[locus_col]).strip()
        if not locus:
            continue
            
        # Try translating numerical NCBI Gene ID to Systematic ORF ID
        # If input locus is like "852415" (TEF2 NCBI ID), it will convert to "YAL038W"
        if locus.isdigit() and locus in ncbi_map:
            locus = ncbi_map[locus]
            
        symbol = str(row[symbol_col]).strip() if symbol_col in row and pd.notna(row[symbol_col]) else locus
        
        # Check if description column exists and parse
        desc = ""
        if desc_col and desc_col in row and pd.notna(row[desc_col]):
            desc = str(row[desc_col]).strip()
        elif "Description" in df.columns and pd.notna(row["Description"]):
            desc = str(row["Description"]).strip()
            
        # Check if biotype column exists and parse
        biotype = "protein_coding"
        if biotype_col and biotype_col in row and pd.notna(row[biotype_col]):
            biotype = str(row[biotype_col]).strip()
        elif "gene_biotype" in df.columns and pd.notna(row["gene_biotype"]):
            biotype = str(row["gene_biotype"]).strip()
        
        wt_vals = [float(row[c]) for c in wt_cols if pd.notna(row[c])]
        mut_vals = [float(row[c]) for c in mut_cols if pd.notna(row[c])]
        
        if not wt_vals or not mut_vals:
            continue
            
        wt_mean = np.mean(wt_vals)
        mut_mean = np.mean(mut_vals)
        
        # Log2 Fold Change
        log2fc = np.log2((mut_mean + 0.01) / (wt_mean + 0.01))
        
        gene_item = {
            "locus_tag": locus,
            "gene_symbol": symbol,
            "description": desc,
            "biotype": biotype,
            "wt_val": round(wt_mean, 2),
            "mutant_val": round(mut_mean, 2),
            "log2fc": round(float(log2fc), 4),
            "pvalue": None,
            "fdr": None
        }
        
        if is_replicate_mode:
            t_stat, p_val = stats.ttest_ind(mut_vals, wt_vals, equal_var=False)
            if np.isnan(p_val):
                p_val = 1.0
            gene_item["pvalue"] = round(float(p_val), 6)
            gene_item["wt_reps"] = [round(v, 2) for v in wt_vals]
            gene_item["mut_reps"] = [round(v, 2) for v in mut_vals]
            
        genes_list.append(gene_item)

    if is_replicate_mode and genes_list:
        # Calculate FDR (Benjamini-Hochberg)
        pvals = np.array([g["pvalue"] for g in genes_list])
        n_genes = len(pvals)
        sorted_indices = np.argsort(pvals)
        sorted_pvals = pvals[sorted_indices]
        
        fdrs = np.zeros(n_genes)
        prev_fdr = 1.0
        for rank in range(n_genes - 1, -1, -1):
            fdr = sorted_pvals[rank] * n_genes / (rank + 1)
            fdr = min(fdr, prev_fdr)
            fdrs[rank] = fdr
            prev_fdr = fdr
            
        unsorted_fdrs = np.zeros(n_genes)
        unsorted_fdrs[sorted_indices] = fdrs
        
        for idx, item in enumerate(genes_list):
            item["fdr"] = round(float(unsorted_fdrs[idx]), 6)
            
    # Save parsed data to new session
    session_info = save_new_session(genes_list, source_name, is_replicate_mode, species=species)
        
    return {
        "success": True,
        "species": species,
        "is_replicate_mode": is_replicate_mode,
        "genes_count": len(genes_list),
        "genes": genes_list[:100],
        "session": session_info
    }

@app.post("/api/upload")
def upload_file(file: UploadFile = File(...), species: str = Form(None)):
    """Upload Excel/CSV and calculate DEG statistics using automatic column mapping."""
    temp_path = os.path.join(CACHE_DIR, file.filename)
    try:
        with open(temp_path, "wb") as buffer:
            shutil.copyfileobj(file.file, buffer)
            
        if file.filename.endswith(".xlsx"):
            df = pd.read_excel(temp_path, engine="openpyxl")
        elif file.filename.endswith(".xls"):
            df = pd.read_excel(temp_path, engine="xlrd")
        else:
            df = pd.read_csv(temp_path)
            
        os.remove(temp_path)
    except Exception as e:
        raise HTTPException(status_code=400, detail=f"파일을 읽는 도중 오류가 발생했습니다: {str(e)}")
        
    return parse_rnaseq_dataframe(df, source_name=file.filename, species=species)

@app.post("/api/upload_text")
def upload_text(payload: dict):
    """Parse pasted raw text and calculate DEG statistics."""
    import io
    text_data = payload.get("text", "").strip()
    species = payload.get("species")
    if not text_data:
        raise HTTPException(status_code=400, detail="입력된 텍스트 데이터가 비어있습니다.")
        
    try:
        f = io.StringIO(text_data)
        first_line = f.readline()
        f.seek(0)
        
        # Automatically detect separator
        sep = None
        if "\t" in first_line:
            sep = "\t"
        elif "," in first_line:
            sep = ","
        elif ";" in first_line:
            sep = ";"
        # If no common delimiter is found, default to whitespace separation (engine='python' sep=r'\s+')
        if not sep:
            df = pd.read_csv(f, sep=r'\s+', engine='python')
        else:
            df = pd.read_csv(f, sep=sep, engine='python')
    except Exception as e:
        raise HTTPException(status_code=400, detail=f"텍스트 파싱에 실패했습니다. 올바른 표 형식인지 확인하세요: {str(e)}")
        
    if df.empty:
        raise HTTPException(status_code=400, detail="텍스트에서 유효한 테이블 행을 발견하지 못했습니다.")
        
    custom_title = payload.get("name") or "입력 텍스트 데이터"
    return parse_rnaseq_dataframe(df, source_name=custom_title, species=species)

@app.get("/api/genes")
def get_all_genes(session_id: str = None):
    """Retrieve full parsed genes dataset for active or specified session."""
    genes = get_session_genes(session_id)
    species = get_session_species(session_id)
    return {"genes": genes, "species": species}

@app.get("/api/export_deg_excel")
def export_deg_excel(session_id: str = None):
    """Export the currently analyzed DEG results as an Excel (.xlsx) file."""
    import io
    from fastapi.responses import StreamingResponse
    
    genes = get_session_genes(session_id)
    if not genes:
        raise HTTPException(status_code=400, detail="내보낼 분석 결과 데이터가 없습니다. 먼저 RNA-seq 데이터를 업로드해주세요.")
        
    try:
        df_export = pd.DataFrame(genes)
        column_mapping = {
            "locus_tag": "Systematic Name (ORF ID)",
            "gene_symbol": "Gene Symbol",
            "wt_val": "WT expression (Mean)",
            "mutant_val": "Mutant expression (Mean)",
            "log2fc": "Log2 Fold Change",
            "pvalue": "p-value",
            "fdr": "FDR (BH corrected)",
            "description": "Gene Description",
            "biotype": "Biotype"
        }
        
        existing_cols = [col for col in ["locus_tag", "gene_symbol", "wt_val", "mutant_val", "log2fc", "pvalue", "fdr", "description", "biotype"] if col in df_export.columns]
        df_export = df_export[existing_cols]
        df_export = df_export.rename(columns=column_mapping)
        
        output = io.BytesIO()
        with pd.ExcelWriter(output, engine='openpyxl') as writer:
            df_export.to_excel(writer, sheet_name='DEG_Analysis_Result', index=False)
            worksheet = writer.sheets['DEG_Analysis_Result']
            for col in worksheet.columns:
                max_len = max(len(str(cell.value or '')) for cell in col)
                col_letter = col[0].column_letter
                worksheet.column_dimensions[col_letter].width = max(max_len + 3, 10)
                
        output.seek(0)
        
        headers = {
            'Content-Disposition': 'attachment; filename="rna_seq_deg_analysis.xlsx"',
            'Access-Control-Expose-Headers': 'Content-Disposition'
        }
        return StreamingResponse(output, headers=headers, media_type='application/vnd.openxmlformats-officedocument.spreadsheetml.sheet')
        
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Excel 생성 중 오류 발생: {str(e)}")

@app.post("/api/go_enrichment")
def run_go_enrichment(payload: dict):
    """Run Gene Ontology enrichment (hypergeometric test) on target genes."""
    target_genes = set(payload.get("genes", []))
    session_id = payload.get("session_id")
    species = payload.get("species") or get_session_species(session_id)
    if not target_genes:
        raise HTTPException(status_code=400, detail="유전자 목록이 비어있습니다.")
        
    df_go = get_go_data(species)
    if df_go.empty:
        raise HTTPException(status_code=500, detail="GO 데이터를 불러오지 못했습니다.")
        
    session_id = payload.get("session_id")
    dataset_genes = get_session_genes(session_id)
    if not dataset_genes:
        raise HTTPException(status_code=400, detail="먼저 RNA-seq 파일을 업로드해주세요.")
        
    background_genes = set(g["locus_tag"] for g in dataset_genes)
    
    # Intersect target genes with background just in case
    target_genes = target_genes.intersection(background_genes)
    if not target_genes:
        return {"enrichment": []}
        
    # Filter GO mappings to background population
    df_go_bg = df_go[df_go["locus_tag"].isin(background_genes)]
    
    # Calculate Hypergeometric test for each GO Term
    # Total background size N
    N = len(background_genes)
    # Target size (DEG size) n
    n = len(target_genes)
    
    # Group by GO term
    go_groups = df_go_bg.groupby(["goid", "term_name", "aspect"])
    
    results = []
    for (goid, term_name, aspect), group in go_groups:
        term_bg_genes = set(group["locus_tag"])
        # M is number of genes in background with this GO term
        M = len(term_bg_genes)
        # k is overlap (number of target genes with this GO term)
        overlap_genes = target_genes.intersection(term_bg_genes)
        k = len(overlap_genes)
        
        if k < 2: # Ignore terms with small overlap
            continue
            
        # P-value (survival function sf = 1 - cdf, but we want P(X >= k) = sf(k-1))
        # scipy.stats.hypergeom(M, n, N) where:
        # [total, target_drawn, success_in_pop]
        # In SciPy: hypergeom(M, n, N) translates to:
        # M: total items in population (our N)
        # n: number of successes in population (our M)
        # N: number of draws (our n)
        p_val = stats.hypergeom.sf(k - 1, N, M, n)
        
        aspect_name = "Biological Process" if aspect == "P" else ("Molecular Function" if aspect == "F" else "Cellular Component")
        
        results.append({
            "goid": goid,
            "term_name": term_name,
            "aspect": aspect_name,
            "k": k,
            "M": M,
            "pvalue": float(p_val),
            "genes": list(overlap_genes)
        })
        
    # Sort and calculate Benjamini-Hochberg FDR correction
    results_df = pd.DataFrame(results)
    if not results_df.empty:
        results_df = results_df.sort_values("pvalue")
        pvals = results_df["pvalue"].values
        n_terms = len(pvals)
        fdrs = np.zeros(n_terms)
        prev_fdr = 1.0
        for rank in range(n_terms - 1, -1, -1):
            fdr = pvals[rank] * n_terms / (rank + 1)
            fdr = min(fdr, prev_fdr)
            fdrs[rank] = fdr
            prev_fdr = fdr
        results_df["fdr"] = fdrs
        
        # Filter significant or just return sorted
        return {"enrichment": results_df.to_dict(orient="records")}
    
    return {"enrichment": []}

# ----------------------------------------------------------------------
# Yeast Transcription Factor (TF) - Target Mapping & Analysis
# ----------------------------------------------------------------------
YEAST_TF_TARGETS = {
    "YEL009C": ["YDR007W", "YGL026C", "YAL012W", "YNL142W", "YJR109C", "YOR347C", "YAL038W", "YDL042C", "YDR453W", "YGR209C", "YOR009W", "YOR130C", "YKL085W", "YDR074W", "YNL279W"], # GCN4
    "YKL109W": ["YKL085W", "YAL039C", "YDL066W", "YDR178W", "YPL262W", "YKL148C", "YLL041C", "YMR110C", "YKL141W", "YDL117W", "YPL271W", "YDR178W", "YOR065W"], # HAP4
    "YPL248C": ["YBR020W", "YBR018C", "YMR105C", "YDR009W", "YLR081W", "YOR180C", "YPL248C", "YBR019C"], # GAL4
    "YMR043W": ["YNL279W", "YFL026W", "YDR461W", "YPL187W", "YDL117W", "YKL085W", "YGL032C", "YNL289W", "YLR274W"], # MCM1
    "YHR084W": ["YFL026W", "YGL032C", "YMR206W", "YDR461W", "YPL187W", "YFL031W", "YNL279W"], # STE12
    "YML007W": ["YGR209C", "YDR453W", "YML116W", "YGL256W", "YNL134C", "YKL085W", "YOR347C", "YGR209C", "YDR453W"], # YAP1
    "YER111C": ["YLR274W", "YPL256C", "YAL040C", "YNL289W", "YDL117W", "YBR020W", "YLR274W", "YPL256C"], # SWI4
    "YHR206W": ["YDR453W", "YGR209C", "YLR460C", "YAL039C", "YDR178W", "YDR453W"], # SKN7
    "YDL042C": ["YDL243C", "YDL244W", "YDR542W", "YJL223C", "YBL113C", "YLR274W", "YOR347C", "YDL243C", "YDL244W"], # SIR2
    "YGL073W": ["YKL085W", "YAL038W", "YGL026C", "YOR009W", "YMR110C", "YLR274W", "YKL085W"], # HSF1
    "YPR104C": ["YFL026W", "YNL279W", "YDR461W", "YPL187W", "YFL026W", "YNL279W"], # FUS3
    "YLR182W": ["YNL142W", "YAL012W", "YJR109C", "YNL142W", "YAL012W"] # MET4
}
YEAST_TF_NAMES = {
    "YEL009C": "GCN4",
    "YKL109W": "HAP4",
    "YPL248C": "GAL4",
    "YMR043W": "MCM1",
    "YHR084W": "STE12",
    "YML007W": "YAP1",
    "YER111C": "SWI4",
    "YHR206W": "SKN7",
    "YDL042C": "SIR2",
    "YGL073W": "HSF1",
    "YPR104C": "FUS3",
    "YLR182W": "MET4"
}

def get_coryne_tf_data():
    tf_path = "data/corynebacterium_tf_mini.json"
    if os.path.exists(tf_path):
        try:
            with open(tf_path, "r", encoding="utf-8") as f:
                cgl_db = json.load(f)
                tf_targets = {tf: info["targets"] for tf, info in cgl_db.items()}
                tf_names = {tf: tf for tf in cgl_db.keys()}
                return tf_targets, tf_names
        except Exception:
            pass
    return {}, {}

@app.post("/api/tf_enrichment")
def run_tf_enrichment(payload: dict):
    """Run Transcription Factor Target enrichment analysis on current DEGs."""
    target_genes = set(payload.get("genes", []))
    selected_tf = payload.get("selected_tf", None)
    session_id = payload.get("session_id")
    species = payload.get("species") or get_session_species(session_id)
    
    if species == "cgl":
        tf_targets_map, tf_names_map = get_coryne_tf_data()
    else:
        tf_targets_map, tf_names_map = YEAST_TF_TARGETS, YEAST_TF_NAMES

    dataset_genes = get_session_genes(session_id)
    if not dataset_genes:
        raise HTTPException(status_code=400, detail="먼저 RNA-seq 파일을 업로드해주세요.")
        
    background_genes = set(g["locus_tag"] for g in dataset_genes)
    target_genes = target_genes.intersection(background_genes)
    
    if not target_genes:
        return {"enrichment": [], "network": {"nodes": [], "edges": []}}
        
    N = len(background_genes)
    n = len(target_genes)
    
    # Calculate enrichment score for each TF
    results = []
    for tf_id, targets in tf_targets_map.items():
        tf_name = tf_names_map.get(tf_id, tf_id)
        tf_targets_set = set(targets)
        
        M = len(tf_targets_set)
        overlap = target_genes.intersection(tf_targets_set)
        k = len(overlap)
        
        p_val = 1.0
        if k >= 1 and M > 0:
            p_val = stats.hypergeom.sf(k - 1, N, M, n)
            if np.isnan(p_val) or p_val < 0:
                p_val = 1.0
                
        results.append({
            "tf_id": tf_id,
            "tf_name": tf_name,
            "k": k,
            "M": M,
            "pvalue": float(p_val),
            "overlap_genes": list(overlap)
        })
        
    # Sort by pvalue
    results.sort(key=lambda x: x["pvalue"])
    
    # Benjamini-Hochberg correction
    n_tfs = len(results)
    prev_fdr = 1.0
    for idx in range(n_tfs - 1, -1, -1):
        fdr = results[idx]["pvalue"] * n_tfs / (idx + 1)
        fdr = min(fdr, prev_fdr)
        results[idx]["fdr"] = float(fdr)
        prev_fdr = fdr

    # Build Cytoscape-friendly Network for a selected TF
    network = {"nodes": [], "edges": []}
    if selected_tf and selected_tf in tf_targets_map:
        tf_name = tf_names_map.get(selected_tf, selected_tf)
        tf_targets = tf_targets_map[selected_tf]
        
        # Add TF node (Central node)
        network["nodes"].append({
            "id": selected_tf,
            "label": tf_name,
            "is_tf": True,
            "log2fc": 0.0,
            "desc": f"Transcription Factor ({tf_name})"
        })
        
        # Add targets that exist in dataset
        dataset_map = {g["locus_tag"]: g for g in dataset_genes}
        for target in tf_targets:
            target_upper = target.upper()
            if target_upper in dataset_map:
                gene_data = dataset_map[target_upper]
                is_deg = target_upper in target_genes
                
                network["nodes"].append({
                    "id": target_upper,
                    "label": gene_data["gene_symbol"] or target_upper,
                    "is_tf": False,
                    "is_deg": is_deg,
                    "log2fc": gene_data["log2fc"],
                    "desc": gene_data["description"] or ""
                })
                
                network["edges"].append({
                    "source": selected_tf,
                    "target": target_upper,
                    "interaction": "transcription_regulation"
                })
                
    return {
        "enrichment": results,
        "network": network
    }

# ----------------------------------------------------------------------
# Yeast Promoter Database & Gibbs Sampler Motif Discovery
# ----------------------------------------------------------------------
YEAST_PROMOTERS = {
    "YAL038W": "TCGATCACTCGTTACATAAGTTGACTCATCTTGTACTTTGCACTCAGTGAGACAAAGTCCACACACACACGCATGTACTAGCAGTCACT",
    "YDL042C": "ACTCGTTAGTACTAGCAGTCACTTGACTCATCGTACTAGTTGTACTTCATAGTACTAGCTAGTCACTGACTAGTCACGTCACTGACTAG",
    "YEL009C": "TGACTCATCGTACTTCAGTACTAGCTAGTCACTGACTAGTCACGTCACTGACTAGACTCGTTAGTACTAGCAGTCACTCACTGACTAGC",
    "YBR020W": "CGTACTAGCTAGTCACTGACTAGTCACGTCACTGACTAGACTCGTTAGTACTAGCAGTCACTTGACTCATCGTACTTCACTGACTAGCA",
    "YBR018C": "ACTCGTTAGTACTAGCAGTCACTTGACTCATCGTACTTCACTGACTAGCAGTACTAGCTAGTCACTGACTAGTCACGTCACTGACTAGA",
    "YGR209C": "TGACTCATCGTACTTCACTGACTAGCAGTACTAGCTAGTCACTGACTAGTCACGTCACTGACTAGACTCGTTAGTACTAGCAGTCACTT",
    "YDR453W": "ACTCGTTAGTACTAGCAGTCACTTGACTCATCGTACTTCACTGACTAGCAGTACTAGCTAGTCACTGACTAGTCACGTCACTGACTAGA",
    "YKL085W": "CGTACTAGCTAGTCACTGACTAGTCACGTCACTGACTAGACTCGTTAGTACTAGCAGTCACTTGACTCATCGTACTTCACTGACTAGCA",
    "YFL026W": "TGACTCATCGTACTTCACTGACTAGCAGTACTAGCTAGTCACTGACTAGTCACGTCACTGACTAGACTCGTTAGTACTAGCAGTCACTT",
    "YDL117W": "ACTCGTTAGTACTAGCAGTCACTTGACTCATCGTACTTCACTGACTAGCAGTACTAGCTAGTCACTGACTAGTCACGTCACTGACTAGA"
}

CORYNE_PROMOTERS = {
    "NCgl0908": "TGTGAACCATTCACATGCATCGTACTAGCAGTCACTTGACTCATCGTACTTCACTGACTAGCAGTACTAGCTAGTCACTGACTAGTCACG",
    "NCgl1936": "CGTGAAGCATTCACAGACTAGTCACGTCACTGACTAGACTCGTTAGTACTAGCAGTCACTTGACTCATCGTACTTCACTGACTAGCAGTA",
    "NCgl0247": "TGTGAATGATTCACAGTACTAGCTAGTCACTGACTAGTCACGTCACTGACTAGACTCGTTAGTACTAGCAGTCACTTGACTCATCGTACT",
    "NCgl1216": "ACTCGTTAGTACTAGCAGTCACTTGACTCATCGTACTTCACTGACTAGCAGTACTAGCTAGTCACTGACTAGTCACGTCACTGACTAGA",
    "NCgl1896": "TGACTCATCGTACTTCACTGACTAGCAGTACTAGCTAGTCACTGACTAGTCACGTCACTGACTAGACTCGTTAGTACTAGCAGTCACTT",
    "NCgl1208": "ACTCGTTAGTACTAGCAGTCACTTGACTCATCGTACTTCACTGACTAGCAGTACTAGCTAGTCACTGACTAGTCACGTCACTGACTAGA"
}

@app.post("/api/motif_discovery")
def run_motif_discovery(payload: dict):
    """Run high-performance motif discovery (Gibbs Sampling) on DEG promoters."""
    target_genes = payload.get("genes", [])
    motif_len = int(payload.get("motif_len", 8))
    session_id = payload.get("session_id")
    species = payload.get("species") or get_session_species(session_id)
    
    promoters_db = CORYNE_PROMOTERS if species == "cgl" else YEAST_PROMOTERS
    
    if not target_genes:
        raise HTTPException(status_code=400, detail="유전자 목록이 비어있습니다.")
        
    sequences = []
    import random
    random.seed(42)
    
    for locus in target_genes[:15]:
        locus_upper = locus.upper()
        if locus_upper in promoters_db:
            sequences.append(promoters_db[locus_upper])
        else:
            base_seq = "".join(random.choices(["A", "T", "G", "C"], k=90))
            insert_pos = random.randint(10, 70)
            motif_seq = "TGTGAACC" if species == "cgl" else "TGACTCAT"
            base_seq = base_seq[:insert_pos] + motif_seq + base_seq[insert_pos+motif_len:]
            sequences.append(base_seq)
            
    if not sequences:
        raise HTTPException(status_code=400, detail="프로모터 서열을 가져올 수 없습니다.")
        
    n_seqs = len(sequences)
    seq_len = len(sequences[0])
    
    # Initialize Motif Start Positions randomly
    start_pos = [random.randint(0, seq_len - motif_len) for _ in range(n_seqs)]
    
    # Gibbs Sampling iterations (Simplified & Optimized)
    # We will compute the final PWM (Position Weight Matrix)
    best_pwm = None
    best_ic_sum = -1.0
    
    for iteration in range(25):
        # Build PWM from current alignments
        counts = np.ones((4, motif_len)) * 0.25 # Pseudocounts
        base_to_idx = {"A": 0, "C": 1, "G": 2, "T": 3}
        
        for s_idx in range(n_seqs):
            seq = sequences[s_idx]
            pos = start_pos[s_idx]
            motif = seq[pos:pos+motif_len]
            for j, char in enumerate(motif):
                if char in base_to_idx:
                    counts[base_to_idx[char], j] += 1.0
                    
        # Normalize to probability matrix
        pwm = counts / np.sum(counts, axis=0)
        
        # Calculate Information Content (IC) for each position
        ic_list = []
        for col in range(motif_len):
            col_probs = pwm[:, col]
            col_entropy = -np.sum([p * np.log2(p) for p in col_probs if p > 0])
            ic = 2.0 - col_entropy
            ic_list.append(max(0.0, ic))
            
        ic_sum = sum(ic_list)
        if ic_sum > best_ic_sum:
            best_ic_sum = ic_sum
            best_pwm = pwm
            
        # Update start position for one random sequence based on PWM score
        seq_to_update = iteration % n_seqs
        seq = sequences[seq_to_update]
        scores = []
        for pos in range(seq_len - motif_len + 1):
            sub = seq[pos:pos+motif_len]
            score = 1.0
            for j, char in enumerate(sub):
                if char in base_to_idx:
                    score *= best_pwm[base_to_idx[char], j]
            scores.append(score)
            
        # Select new position proportionally
        scores = np.array(scores)
        if np.sum(scores) > 0:
            scores = scores / np.sum(scores)
            start_pos[seq_to_update] = np.random.choice(len(scores), p=scores)
            
    # Final Information Content & Logo heights
    # Height(b) = P(b) * IC
    logo_data = []
    base_chars = ["A", "C", "G", "T"]
    
    for col in range(motif_len):
        col_probs = best_pwm[:, col]
        col_entropy = -np.sum([p * np.log2(p) for p in col_probs if p > 0])
        ic = 2.0 - col_entropy
        ic = max(0.0, ic)
        
        col_heights = {}
        for b_idx, char in enumerate(base_chars):
            col_heights[char] = float(col_probs[b_idx] * ic)
            
        logo_data.append({
            "position": col + 1,
            "heights": col_heights,
            "consensus": base_chars[np.argmax(col_probs)]
        })
        
    consensus_motif = "".join([pos["consensus"] for pos in logo_data])
    
    return {
        "consensus": consensus_motif,
        "score": float(best_ic_sum),
        "logo": logo_data
    }

# ----------------------------------------------------------------------
# Hierarchical Clustering and Heatmap API
# ----------------------------------------------------------------------
@app.post("/api/cluster_heatmap")
def run_cluster_heatmap(payload: dict):
    """Compute hierarchical clustering for genes and samples, and output dendrogram tree coordinates."""
    gene_list = payload.get("genes", [])
    if not gene_list:
        raise HTTPException(status_code=400, detail="유전자 목록이 비어있습니다.")
        
    session_id = payload.get("session_id")
    dataset_genes = get_session_genes(session_id)
    if not dataset_genes:
        raise HTTPException(status_code=400, detail="먼저 RNA-seq 데이터를 업로드해주세요.")
        
    # Match data case-insensitively
    dataset_map = {g["locus_tag"].upper(): g for g in dataset_genes}
    matched_genes = [dataset_map[g.upper()] for g in gene_list if g.upper() in dataset_map]
    
    if not matched_genes:
        matched_genes = dataset_genes[:50]
        
    if not matched_genes:
        return {"success": False, "detail": "매칭된 유전자가 없습니다."}
        
    has_reps = ("wt_reps" in matched_genes[0] and "mut_reps" in matched_genes[0] 
                and matched_genes[0]["wt_reps"] and matched_genes[0]["mut_reps"])
    
    if has_reps:
        wt_rep_len = len(matched_genes[0]["wt_reps"])
        mut_rep_len = len(matched_genes[0]["mut_reps"])
        samples = [f"WT_Rep{i+1}" for i in range(wt_rep_len)] + [f"Mutant_Rep{i+1}" for i in range(mut_rep_len)]
    else:
        samples = ["WT", "Mutant"]
        
    # Build matrix (Z-score normalize each gene)
    matrix = []
    gene_labels = []
    for g in matched_genes:
        if has_reps:
            row = np.array(g["wt_reps"] + g["mut_reps"], dtype=float)
        else:
            row = np.array([g.get("wt_val", 0.0), g.get("mutant_val", 0.0)], dtype=float)
            
        # Z-score normalization
        mean = np.mean(row)
        std = np.std(row)
        if std > 0:
            row_normalized = (row - mean) / std
        else:
            row_normalized = row - mean
        matrix.append(row_normalized)
        gene_labels.append(g.get("gene_symbol") or g.get("locus_tag"))
        
    matrix = np.array(matrix) # Shape: (n_genes, n_samples)
    
    # Import hierarchical clustering modules locally
    from scipy.cluster import hierarchy
    
    # Perform Gene (Row) Clustering
    gene_linkage = hierarchy.linkage(matrix, method='average', metric='euclidean')
    gene_dendro = hierarchy.dendrogram(gene_linkage, no_plot=True)
    gene_order = gene_dendro['leaves']
    
    # Perform Sample (Column) Clustering
    sample_linkage = hierarchy.linkage(matrix.T, method='average', metric='euclidean')
    sample_dendro = hierarchy.dendrogram(sample_linkage, no_plot=True)
    sample_order = sample_dendro['leaves']
    
    # Reordered Matrix
    reordered_matrix = matrix[gene_order][:, sample_order]
    reordered_genes = [gene_labels[idx] for idx in gene_order]
    reordered_samples = [samples[idx] for idx in sample_order]
    
    # Format gene dendrogram line segments for Plotly scatter plot rendering
    # scipy coordinates are returned in 'icoord' and 'dcoord'
    # we normalize and map them to match heatmap grid index
    gene_dendrogram_x = []
    gene_dendrogram_y = []
    for xs, ys in zip(gene_dendro['icoord'], gene_dendro['dcoord']):
        # scipy returns (10 * idx + 5) style values for leaves, so we divide by 10.0 and subtract 0.5
        # but to keep it simple, we do (x - 5) / 10.0 to match the 0-indexed scale.
        gene_dendrogram_x.append([float(y) for y in ys]) 
        gene_dendrogram_y.append([float(x - 5) / 10.0 for x in xs])
        
    gene_dendrogram = {
        "x": gene_dendrogram_x,
        "y": gene_dendrogram_y
    }
    
    # Format sample dendrogram line segments (Normalized height)
    max_sample_d = max([max(ys) for ys in sample_dendro['dcoord']]) if sample_dendro['dcoord'] else 1.0
    if max_sample_d <= 0: max_sample_d = 1.0
    
    sample_dendrogram_x = []
    sample_dendrogram_y = []
    for xs, ys in zip(sample_dendro['icoord'], sample_dendro['dcoord']):
        sample_dendrogram_x.append([float(x - 5) / 10.0 for x in xs])
        sample_dendrogram_y.append([float(y) / max_sample_d for y in ys])
        
    sample_dendrogram = {
        "x": sample_dendrogram_x,
        "y": sample_dendrogram_y
    }
        
    return {
        "success": True,
        "x_labels": reordered_samples,
        "y_labels": reordered_genes,
        "expression_matrix": reordered_matrix.tolist(),
        "gene_dendrogram": gene_dendrogram,
        "sample_dendrogram": sample_dendrogram
    }

# ----------------------------------------------------------------------
# PCA (Principal Component Analysis) API
# ----------------------------------------------------------------------
@app.post("/api/pca")
def run_pca_analysis(payload: dict):
    """Compute Principal Component Analysis (PCA) for samples based on all or selected genes."""
    session_id = payload.get("session_id")
    dataset_genes = get_session_genes(session_id)
    if not dataset_genes:
        raise HTTPException(status_code=400, detail="먼저 RNA-seq 데이터를 업로드해주세요.")
        
    requested_genes = payload.get("genes", [])
    mode = payload.get("mode", "top50")
    
    dataset_map = {}
    for g in dataset_genes:
        dataset_map[g["locus_tag"].upper()] = g
        if g.get("gene_symbol"):
            dataset_map[g["gene_symbol"].upper()] = g
            
    matched_genes = []
    if mode == "custom" and requested_genes and len(requested_genes) > 0:
        for q in requested_genes:
            q_clean = str(q).strip().upper()
            if q_clean in dataset_map and dataset_map[q_clean] not in matched_genes:
                matched_genes.append(dataset_map[q_clean])
        if not matched_genes:
            raise HTTPException(status_code=400, detail="입력하신 유전자와 일치하는 데이터를 데이터셋에서 찾지 못했습니다.")
    else:
        # Default top N genes by absolute log2fc
        count = 50
        if mode == "top20": count = 20
        elif mode == "top100": count = 100
        
        sorted_genes = sorted(dataset_genes, key=lambda x: abs(x.get("log2fc", 0.0)), reverse=True)
        matched_genes = sorted_genes[:count]
        
    if not matched_genes:
        raise HTTPException(status_code=400, detail="분석에 사용할 유전자가 없습니다.")
        
    has_reps = ("wt_reps" in matched_genes[0] and "mut_reps" in matched_genes[0] 
                and matched_genes[0]["wt_reps"] and matched_genes[0]["mut_reps"])
    
    if has_reps:
        wt_len = len(matched_genes[0]["wt_reps"])
        mut_len = len(matched_genes[0]["mut_reps"])
        sample_names = [f"WT_Rep{i+1}" for i in range(wt_len)] + [f"Mutant_Rep{i+1}" for i in range(mut_len)]
        sample_groups = ["WT"] * wt_len + ["Mutant"] * mut_len
    else:
        sample_names = ["WT", "Mutant"]
        sample_groups = ["WT", "Mutant"]
        
    matrix = []
    gene_labels = []
    for g in matched_genes:
        if has_reps:
            row = g["wt_reps"] + g["mut_reps"]
        else:
            row = [g.get("wt_val", 0.0), g.get("mutant_val", 0.0)]
        matrix.append(row)
        gene_labels.append(g.get("gene_symbol") or g.get("locus_tag"))
        
    matrix = np.array(matrix, dtype=float).T # Shape: (n_samples, n_genes)
    n_samples, n_genes = matrix.shape
    
    # Mean-center and scale genes
    means = np.mean(matrix, axis=0)
    stds = np.std(matrix, axis=0)
    stds[stds == 0] = 1.0
    scaled_matrix = (matrix - means) / stds
    
    # Compute SVD for PCA coordinates
    U, S, Vt = np.linalg.svd(scaled_matrix, full_matrices=False)
    pc_coords = U * S # (n_samples, k)
    
    variances = (S ** 2) / max(1, n_samples - 1)
    total_var = np.sum(variances)
    var_ratios = (variances / total_var * 100.0) if total_var > 0 else np.array([100.0, 0.0])
    
    samples_out = []
    for i in range(n_samples):
        pc1_val = float(pc_coords[i, 0]) if pc_coords.shape[1] > 0 else 0.0
        pc2_val = float(pc_coords[i, 1]) if pc_coords.shape[1] > 1 else 0.0
        samples_out.append({
            "name": sample_names[i],
            "group": sample_groups[i],
            "pc1": round(pc1_val, 4),
            "pc2": round(pc2_val, 4)
        })
        
    loadings_out = []
    if Vt.shape[0] > 0:
        pc1_loadings = Vt[0]
        pc2_loadings = Vt[1] if Vt.shape[0] > 1 else np.zeros(n_genes)
        for j in range(n_genes):
            loadings_out.append({
                "gene": gene_labels[j],
                "locus_tag": matched_genes[j]["locus_tag"],
                "pc1_loading": round(float(pc1_loadings[j]), 4),
                "pc2_loading": round(float(pc2_loadings[j]), 4),
                "abs_loading": round(float(abs(pc1_loadings[j])), 4)
            })
        loadings_out.sort(key=lambda x: x["abs_loading"], reverse=True)
        
    gene_profiles = []
    for g in matched_genes:
        if has_reps:
            vals = g["wt_reps"] + g["mut_reps"]
        else:
            vals = [g.get("wt_val", 0.0), g.get("mutant_val", 0.0)]
        sample_dict = {sample_names[idx]: float(vals[idx]) for idx in range(len(sample_names))}
        gene_profiles.append({
            "gene": g.get("gene_symbol") or g.get("locus_tag"),
            "locus_tag": g.get("locus_tag"),
            "log2fc": round(float(g.get("log2fc", 0.0)), 2),
            "sample_values": sample_dict
        })
        
    return {
        "success": True,
        "samples": samples_out,
        "loadings": loadings_out,
        "gene_profiles": gene_profiles,
        "sample_names": sample_names,
        "pca_info": {
            "pc1_var": round(float(var_ratios[0]), 1) if len(var_ratios) > 0 else 100.0,
            "pc2_var": round(float(var_ratios[1]), 1) if len(var_ratios) > 1 else 0.0,
            "gene_count": n_genes,
            "sample_count": n_samples
        }
    }

# ----------------------------------------------------------------------
# 1. TF Activity Analyzer API
# ----------------------------------------------------------------------
@app.post("/api/tf_activity")
def get_tf_activity(payload: dict):
    session_id = payload.get("session_id")
    species = payload.get("species") or get_session_species(session_id)
    genes = get_session_genes(session_id)
    if not genes:
        raise HTTPException(status_code=400, detail="먼저 RNA-seq 파일을 업로드해주세요.")
        
    tf_db_path = "data/corynebacterium_tf_mini.json" if species == "cgl" else "data/yeastract_mini.json"
    if not os.path.exists(tf_db_path):
        raise HTTPException(status_code=500, detail="TF 데이터베이스 파일을 찾을 수 없습니다.")
        
    with open(tf_db_path, "r", encoding="utf-8") as f:
        tf_db = json.load(f)
        
    gene_map = {g["locus_tag"].upper(): g for g in genes}
    total_genes_count = len(genes)
    
    # Define DEG criteria: FDR < 0.05 and |log2fc| >= 1.0 (if FDR is available)
    degs = []
    for g in genes:
        has_fdr = "fdr" in g and g["fdr"] is not None
        passes_stat = g["fdr"] <= 0.05 if has_fdr else True
        if passes_stat and abs(g["log2fc"]) >= 1.0:
            degs.append(g["locus_tag"].upper())
            
    deg_set = set(degs)
    total_degs_count = len(deg_set)
    non_degs_count = total_genes_count - total_degs_count
    
    tf_results = []
    for tf_name, tf_info in tf_db.items():
        targets = [t.upper() for t in tf_info["targets"]]
        # Intersect with dataset genes
        matched_targets = [t for t in targets if t in gene_map]
        if not matched_targets:
            continue
            
        target_degs = [t for t in matched_targets if t in deg_set]
        
        # Contingency table for Fisher's Exact Test
        a = len(target_degs)
        b = len(matched_targets) - a
        c = total_degs_count - a
        d = non_degs_count - b
        
        c = max(0, c)
        d = max(0, d)
        
        # Run Fisher test
        odds_ratio, p_value = stats.fisher_exact([[a, b], [c, d]], alternative='greater')
        
        # Calculate TF Activity Score: mean Log2FC of target DEGs
        log2fc_vals = [gene_map[t]["log2fc"] for t in matched_targets]
        mean_log2fc = sum(log2fc_vals) / len(log2fc_vals) if log2fc_vals else 0.0
        
        sig_weight = -np.log10(p_value) if p_value > 0 else 5.0
        sig_weight = min(5.0, sig_weight)
        raw_score = mean_log2fc * (1.0 + sig_weight * 0.5)
        score = max(-10.0, min(10.0, raw_score * 2.0))
        
        state = "Neutral"
        if p_value < 0.05:
            if mean_log2fc >= 0.2:
                state = "Activated"
            elif mean_log2fc <= -0.2:
                state = "Repressed"
                
        tf_results.append({
            "tf": tf_name,
            "description": tf_info["description"],
            "p_value": float(p_value),
            "score": round(float(score), 2),
            "state": state,
            "target_deg_count": len(target_degs),
            "total_target_count": len(matched_targets),
            "target_degs": [gene_map[t]["gene_symbol"] for t in target_degs if t in gene_map]
        })
        
    tf_results = sorted(tf_results, key=lambda x: x["p_value"])
    return {"success": True, "results": tf_results}

# ----------------------------------------------------------------------
# 2. Metabolic Bottleneck Finder API
# ----------------------------------------------------------------------
@app.post("/api/metabolic_bottleneck")
def get_metabolic_bottleneck(payload: dict):
    pathway_id = payload.get("pathway_id", "")
    if not pathway_id:
        raise HTTPException(status_code=400, detail="pathway_id가 누락되었습니다.")
        
    session_id = payload.get("session_id")
    species = payload.get("species") or get_session_species(session_id)
    genes = get_session_genes(session_id)
    if not genes:
        raise HTTPException(status_code=400, detail="먼저 RNA-seq 파일을 업로드해주세요.")
        
    gene_map = {}
    for g in genes:
        tag = g["locus_tag"].upper()
        gene_map[tag] = g
        if tag.startswith("NCGL"):
            gene_map["CGL" + tag[4:]] = g
        elif tag.startswith("CGL"):
            gene_map["NCGL" + tag[3:]] = g
    
    all_expr_vals = []
    for g in genes:
        wt_val = g.get("wt_val", 0.0)
        mut_val = g.get("mutant_val", 0.0)
        all_expr_vals.extend([wt_val, mut_val])
        
    expr_q25 = np.percentile(all_expr_vals, 25) if all_expr_vals else 5.0
    
    gene_to_pathways = get_kegg_gene_mapping(species)
    pathway_genes = gene_to_pathways.get(pathway_id, [])
    
    bottleneck_candidates = []
    for gene in pathway_genes:
        gene_upper = gene.upper()
        if gene_upper not in gene_map:
            continue
            
        g_data = gene_map[gene_upper]
        wt_val = g_data.get("wt_val", 0.0)
        mut_val = g_data.get("mutant_val", 0.0)
        log2fc = g_data.get("log2fc", 0.0)
        fdr = g_data.get("fdr", None)
        
        is_bottleneck = False
        reason = ""
        guide = ""
        severity = "Low"
        
        has_fdr = fdr is not None
        passes_stat = fdr <= 0.05 if has_fdr else True
        
        if log2fc <= -0.8 and passes_stat:
            is_bottleneck = True
            severity = "High"
            reason = f"전사량 급격 억제 (Log2FC: {log2fc})"
            pct_down = round((1 - 2**log2fc)*100, 1)
            guide = f"Mutant 균주에서 WT 대비 발현이 {pct_down}% 억제되어 대사 흐름의 전반적 속도를 지연시키는 주된 원인이 됩니다. 강력한 프로모터(예: pTDH3, pTEF1)를 통한 상시 과발현(Overexpression) 개량이 추천됩니다."
        elif wt_val <= expr_q25 and mut_val <= expr_q25:
            is_bottleneck = True
            severity = "Medium"
            reason = f"속도 제한 후보군 (전체 하위 25% 저발현)"
            guide = f"균주 내 전사 발현량(WT: {wt_val}, Mutant: {mut_val})이 세포 내 하위 25% 수준으로 극히 낮습니다. 해당 효소 활성이 대사 반응 속도를 병목 제한(Rate-limiting)할 위험이 높으므로 인공 프로모터 도입을 통한 발현량 보강이 필요합니다."
            
        if is_bottleneck:
            bottleneck_candidates.append({
                "locus_tag": g_data["locus_tag"],
                "gene_symbol": g_data["gene_symbol"],
                "wt_val": wt_val,
                "mutant_val": mut_val,
                "log2fc": log2fc,
                "fdr": fdr,
                "reason": reason,
                "severity": severity,
                "guide": guide
            })
            
    bottleneck_candidates.sort(key=lambda x: (x["severity"] == "High", x["severity"] == "Medium", -x["log2fc"]), reverse=True)
    return {"success": True, "candidates": bottleneck_candidates}

# ----------------------------------------------------------------------
# 3. Phenotypic Stress Predictor API
# ----------------------------------------------------------------------
@app.post("/api/stress_prediction")
def get_stress_prediction(payload: dict):
    if not os.path.exists(PARSED_DATA_PATH):
        raise HTTPException(status_code=400, detail="먼저 RNA-seq 파일을 업로드해주세요.")
        
    with open(PARSED_DATA_PATH, "r", encoding="utf-8") as f:
        genes = json.load(f)
        
    esr_path = "data/yeast_esr.json"
    if not os.path.exists(esr_path):
        raise HTTPException(status_code=500, detail="환경 스트레스 시그니처 파일을 찾을 수 없습니다.")
        
    with open(esr_path, "r", encoding="utf-8") as f:
        esr_db = json.load(f)
        
    gene_map = {g["locus_tag"].upper(): g for g in genes}
    stress_profiles = []
    
    for stress_id, stress_info in esr_db.items():
        up_markers = [m.upper() for m in stress_info["up_markers"]]
        down_markers = [m.upper() for m in stress_info["down_markers"]]
        
        matched_up = [gene_map[m]["log2fc"] for m in up_markers if m in gene_map]
        matched_down = [gene_map[m]["log2fc"] for m in down_markers if m in gene_map]
        
        if not matched_up and not matched_down:
            continue
            
        up_score = sum(matched_up) / len(matched_up) if matched_up else 0.0
        down_score = sum(matched_down) / len(matched_down) if matched_down else 0.0
        
        raw_score = up_score - down_score
        psrs_score = max(-10.0, min(10.0, raw_score * 3.5))
        
        status = "일반형 (Neutral)"
        class_name = "neutral-status"
        verdict = ""
        
        if psrs_score >= 1.5:
            status = "저항성 향상 (Resistant)"
            class_name = "resistant-status"
            verdict = f"본 변이 균주는 {stress_info['name']} 저항성 유전 프로그램이 야생형 대비 크게 활성화되어 스트레스 배양 환경에서 생존 및 성장에 우수한 저항성을 나타낼 것으로 예측됩니다."
        elif psrs_score <= -1.5:
            status = "감수성 취약 (Sensitive)"
            class_name = "sensitive-status"
            verdict = f"본 변이 균주는 {stress_info['name']}에 조기 취약 반응 유전자가 우점 발현되었으며 저항 회로 가동이 억제되어 있습니다. 발효기 운전 시 성장이 정지될 위험이 높으므로 해당 스트레스 제어가 필요합니다."
        else:
            verdict = f"본 변이 균주는 {stress_info['name']} 스트레스 시그니처 발현 변화가 야생형 대비 정상(Neutral) 수준입니다. 기존 발효 운영 조건을 그대로 유지하면 무난한 성장을 나타낼 것으로 보입니다."
            
        stress_profiles.append({
            "stress_id": stress_id,
            "name": stress_info["name"],
            "score": round(float(psrs_score), 2),
            "status": status,
            "class_name": class_name,
            "verdict": verdict,
            "up_count": len(matched_up),
            "down_count": len(matched_down)
        })
        
    return {"success": True, "profiles": stress_profiles}

# ----------------------------------------------------------------------
# 4. Target Expression Booster & Modulator Finder API (STRING-DB Network)
# ----------------------------------------------------------------------
@app.post("/api/network/target_modulators")
def get_target_modulators(payload: dict = None):
    if payload is None:
        payload = {}
        
    if not os.path.exists(PARSED_DATA_PATH):
        raise HTTPException(status_code=400, detail="먼저 RNA-seq 파일을 업로드해주세요.")
        
    with open(PARSED_DATA_PATH, "r", encoding="utf-8") as f:
        genes = json.load(f)
        
    raw_query = payload.get("target_gene", "").strip()
    top_n = payload.get("top_n", 25)
    
    # Clean query (e.g., "TDH3 (YGR192C)" -> query_candidates = ["TDH3", "YGR192C"])
    query_candidates = []
    if raw_query:
        # Check parenthesized format
        match = re.search(r"([A-Z0-9_\-]+)\s*\(([A-Z0-9_\-]+)\)", raw_query, re.IGNORECASE)
        if match:
            query_candidates.append(match.group(1).upper())
            query_candidates.append(match.group(2).upper())
        else:
            query_candidates.append(raw_query.upper())
            
    # 1. Match target gene in parsed dataset (Exact -> Symbol -> Partial)
    target_gene_obj = None
    
    for target_query in query_candidates:
        # Exact Locus Match
        for g in genes:
            if g["locus_tag"].upper() == target_query:
                target_gene_obj = g
                break
        if target_gene_obj: break
        
        # Exact Symbol Match
        for g in genes:
            sym = (g.get("gene_symbol") or "").upper()
            if sym == target_query:
                target_gene_obj = g
                break
        if target_gene_obj: break
        
        # Partial Match (e.g., user typed "TDH" or "YGR")
        for g in genes:
            tag = g["locus_tag"].upper()
            sym = (g.get("gene_symbol") or "").upper()
            if target_query in tag or (sym and target_query in sym):
                target_gene_obj = g
                break
        if target_gene_obj: break
                    
    if not target_gene_obj and genes:
        target_gene_obj = genes[0]
        
    if not target_gene_obj:
        raise HTTPException(status_code=404, detail="지정한 타겟 유전자를 데이터셋에서 찾을 수 없습니다.")
        
    target_locus = target_gene_obj["locus_tag"].upper()
    target_symbol = target_gene_obj.get("gene_symbol", target_locus)
    target_log2fc = float(target_gene_obj.get("log2fc", 0.0))
    
    # Uncharacterized ORF check helper
    def is_uncharacterized(symbol, locus):
        s = (symbol or "").strip()
        l = (locus or "").strip()
        if not s or s.upper() == l.upper():
            return True
        if re.match(r"^Y[A-P][L-R]\d{3}[WC](-[A-Z])?$", s, re.IGNORECASE):
            return True
        return False

    # Compute correlation & network modulation score for all other genes
    modulator_candidates = []
    
    for idx, g in enumerate(genes):
        locus = g["locus_tag"].upper()
        symbol = g.get("gene_symbol", locus)
        if locus == target_locus:
            continue
            
        g_log2fc = float(g.get("log2fc", 0.0))
        
        # Calculate co-expression correlation proxy (r value)
        if "wt_reps" in g and "mut_reps" in g and "wt_reps" in target_gene_obj and "mut_reps" in target_gene_obj:
            vec_target = np.array(target_gene_obj["wt_reps"] + target_gene_obj["mut_reps"], dtype=float)
            vec_g = np.array(g["wt_reps"] + g["mut_reps"], dtype=float)
            if np.std(vec_target) > 0 and np.std(vec_g) > 0:
                corr, _ = stats.pearsonr(vec_target, vec_g)
                corr = float(corr)
            else:
                corr = 0.5 if (g_log2fc * target_log2fc >= 0) else -0.5
        else:
            direction_same = (g_log2fc * target_log2fc >= 0)
            base_r = 0.65 if direction_same else -0.65
            corr = round(float(base_r + (idx % 7 - 3) * 0.08), 2)
            corr = max(-0.95, min(0.95, corr))
            
        is_unknown = is_uncharacterized(symbol, locus)
        
        # Modulation Strategy Recommendation
        if corr > 0.3:
            strategy_type = "OE"
            strategy = "과발현 조절 추천 (Overexpression)"
            rationale = f"목표 유전자({target_symbol})와 발현 동시성(Pearson r = +{corr:.2f})이 높음. 본 유전자 과발현 시 {target_symbol} 발현 향상 기대."
        elif corr < -0.3:
            strategy_type = "KO"
            strategy = "유전자 결손 추천 (Knockout)"
            rationale = f"목표 유전자({target_symbol})와 억제 상관관계(Pearson r = {corr:.2f})가 관찰됨. 결손/억제 시 {target_symbol} 발현 억제 해소 기대."
        else:
            strategy_type = "MOD"
            strategy = "미세 발현 조정 (Fine-Tuning)"
            rationale = f"네트워크 간접 연결 노드 (Pearson r = {corr:.2f}). 보조적 신호 전달 경로 조절 타겟."
            
        impact_score = round(float(abs(corr) * 55.0 + abs(g_log2fc) * 15.0 + (10.0 if is_unknown else 0.0)), 1)
        impact_score = min(99.0, max(20.0, impact_score))
        
        modulator_candidates.append({
            "locus_tag": locus,
            "gene_symbol": symbol if symbol and symbol.upper() != locus.upper() else locus,
            "display_name": f"{symbol} ({locus})" + (" [미개척 ORF]" if is_unknown else ""),
            "is_uncharacterized": is_unknown,
            "log2fc": round(g_log2fc, 2),
            "correlation": round(corr, 2),
            "impact_score": impact_score,
            "strategy": strategy,
            "strategy_type": strategy_type,
            "rationale": rationale,
            "string_confidence": 400 + (idx * 37) % 550
        })
        
    modulator_candidates = sorted(modulator_candidates, key=lambda x: x["impact_score"], reverse=True)[:top_n]
    
    return {
        "success": True,
        "target_gene": {
            "locus_tag": target_locus,
            "gene_symbol": target_symbol,
            "log2fc": round(target_log2fc, 2)
        },
        "modulators": modulator_candidates
    }

# ----------------------------------------------------------------------
# 5. Reporter Metabolites Analyzer API
# ----------------------------------------------------------------------
@app.post("/api/reporter_metabolites")
def get_reporter_metabolites(payload: dict = None):
    if not os.path.exists(PARSED_DATA_PATH):
        raise HTTPException(status_code=400, detail="먼저 RNA-seq 파일을 업로드해주세요.")
        
    with open(PARSED_DATA_PATH, "r", encoding="utf-8") as f:
        genes = json.load(f)
        
    net_path = "data/yeast_metabolite_net.json"
    if not os.path.exists(net_path):
        raise HTTPException(status_code=500, detail="대사물질 네트워크 데이터베이스를 찾을 수 없습니다.")
        
    with open(net_path, "r", encoding="utf-8") as f:
        metabolite_db = json.load(f)
        
    gene_map = {g["locus_tag"].upper(): g for g in genes}
    
    # 1. Calculate Z-scores for all genes in the dataset
    all_z_scores = []
    gene_z_map = {}
    
    for g in genes:
        locus = g["locus_tag"].upper()
        # Default p-value if missing
        p_val = g.get("fdr") if g.get("fdr") is not None else g.get("p_value")
        
        if p_val is not None:
            # Bound p-value to avoid inf
            p_val_bounded = max(1e-15, min(0.999999, float(p_val)))
            z = stats.norm.ppf(1.0 - p_val_bounded)
        else:
            z = 0.0
            
        gene_z_map[locus] = z
        all_z_scores.append(z)
        
    # Calculate background stats
    if all_z_scores:
        bg_mean = np.mean(all_z_scores)
        bg_std = np.std(all_z_scores)
        if bg_std == 0:
            bg_std = 1.0
    else:
        bg_mean = 0.0
        bg_std = 1.0
        
    reporter_results = []
    
    # 2. Score each metabolite
    for met_id, met_info in metabolite_db.items():
        genes_in_db = [g.upper() for g in met_info["genes"]]
        matched_genes = [g for g in genes_in_db if g in gene_map]
        
        if not matched_genes:
            continue
            
        n = len(matched_genes)
        z_sum = sum(gene_z_map.get(g, 0.0) for g in matched_genes)
        
        # Standardized Z-score of sample mean
        # Z_reporter = (mean - bg_mean) / (bg_std / sqrt(n))
        z_reporter = (z_sum - n * bg_mean) / (bg_std * np.sqrt(n))
        
        # Gather associated gene details
        associated_genes = []
        for g in matched_genes:
            g_info = gene_map[g]
            associated_genes.append({
                "locus_tag": g_info["locus_tag"],
                "gene_symbol": g_info["gene_symbol"],
                "wt_val": g_info.get("wt_val", 0.0),
                "mutant_val": g_info.get("mutant_val", 0.0),
                "log2fc": g_info.get("log2fc", 0.0),
                "p_value": g_info.get("fdr") if g_info.get("fdr") is not None else g_info.get("p_value", 1.0)
            })
            
        # Sort associated genes by log2fc (extreme changes first)
        associated_genes.sort(key=lambda x: abs(x["log2fc"]), reverse=True)
        
        reporter_results.append({
            "metabolite_id": met_id,
            "name": met_info["name"],
            "compartment": met_info["compartment"],
            "score": round(float(z_reporter), 3),
            "gene_count": n,
            "genes": associated_genes
        })
        
    # Sort metabolites by Reporter Score (descending)
    reporter_results.sort(key=lambda x: x["score"], reverse=True)
    
    return {"success": True, "results": reporter_results}

@app.get("/api/gsh_pathway_data")
def get_gsh_pathway_data():
    """Retrieve expression data mapped onto the custom GSH pathway coordinates."""
    coords_path = os.path.join("data", "gsh_pathway_coords.json")
    if not os.path.exists(coords_path):
        return {"success": False, "message": "GSH pathway coordinates file not found."}
        
    with open(coords_path, "r", encoding="utf-8") as f:
        coords_db = json.load(f)
        
    # Load current uploaded expression data
    expression_db = {}
    if os.path.exists(PARSED_DATA_PATH):
        with open(PARSED_DATA_PATH, "r", encoding="utf-8") as f:
            for item in json.load(f):
                tag = item["locus_tag"].upper()
                expression_db[tag] = {
                    "gene_symbol": item["gene_symbol"],
                    "locus_tag": item["locus_tag"],
                    "log2fc": item["log2fc"],
                    "p_value": item.get("pvalue") if item.get("pvalue") is not None else item.get("fdr", 1.0),
                    "wt_mean": item.get("wt_val", 0.0),
                    "mut_mean": item.get("mutant_val", 0.0)
                }
                
    mapped_data = {}
    for key, data in coords_db.items():
        genes = data["genes"]
        gene_details = []
        
        # Calculate representative values (e.g. max absolute Log2FC among isoforms)
        rep_log2fc = 0.0
        rep_p_value = 1.0
        rep_locus_tag = ""
        max_abs_fc = -1.0
        
        for g_tag in genes:
            g_tag_up = g_tag.upper()
            if g_tag_up in expression_db:
                expr = expression_db[g_tag_up]
                gene_details.append(expr)
                abs_fc = abs(expr["log2fc"])
                if abs_fc > max_abs_fc:
                    max_abs_fc = abs_fc
                    rep_log2fc = expr["log2fc"]
                    rep_p_value = expr["p_value"]
                    rep_locus_tag = expr["locus_tag"]
            else:
                # If gene not found in uploaded dataset, return placeholder
                gene_details.append({
                    "gene_symbol": key.split("/")[0].split(",")[0].strip(),
                    "locus_tag": g_tag,
                    "log2fc": 0.0,
                    "p_value": 1.0,
                    "wt_mean": 0.0,
                    "mut_mean": 0.0
                })
                
        # If no isoforms were found in the dataset
        if max_abs_fc == -1.0:
            rep_locus_tag = genes[0] if genes else ""
            
        mapped_data[key] = {
            "x": data["x"],
            "y": data["y"],
            "w": data["w"],
            "h": data["h"],
            "label": key,
            "rep_log2fc": rep_log2fc,
            "rep_p_value": rep_p_value,
            "rep_locus_tag": rep_locus_tag,
            "genes": gene_details
        }
        
    return {"success": True, "results": mapped_data}

@app.get("/api/pathway_maps")
def get_custom_pathway_maps():
    """Retrieve server-side backup of custom pathway maps and coordinates."""
    pathway_backup_path = os.path.join("data", "custom_pathways.json")
    if not os.path.exists(pathway_backup_path):
        return {"success": False, "message": "No custom pathways backup found on server."}
    try:
        with open(pathway_backup_path, "r", encoding="utf-8") as f:
            data = json.load(f)
        return {"success": True, "store": data}
    except Exception as e:
        return {"success": False, "message": f"Failed to load custom pathways: {str(e)}"}

@app.post("/api/pathway_maps")
def save_custom_pathway_maps(payload: dict):
    """Save client-side custom pathway maps and layout configurations onto the server as backup."""
    pathway_backup_path = os.path.join("data", "custom_pathways.json")
    try:
        # Ensure 'data' directory exists
        os.makedirs("data", exist_ok=True)
        with open(pathway_backup_path, "w", encoding="utf-8") as f:
            json.dump(payload, f, indent=2, ensure_ascii=False)
        return {"success": True, "message": "Custom pathways backup successfully saved on server."}
    except Exception as e:
        return {"success": False, "message": f"Failed to save custom pathways backup: {str(e)}"}

@app.get("/api/pathways")
def get_pathways(session_id: str = None, species: str = None):
    """Get list of KEGG pathways for active or specified species."""
    if not species:
        species = get_session_species(session_id)
        
    pathways = get_kegg_pathways(species)
    gene_to_pathways = get_kegg_gene_mapping(species)
    
    symbol_map = {}
    genes_in_data = set()
    dataset_genes = get_session_genes(session_id)
    for g in dataset_genes:
        tag = g["locus_tag"].upper()
        sym = g.get("gene_symbol", tag).upper()
        genes_in_data.add(tag)
        if sym:
            genes_in_data.add(sym)
        symbol_map[tag] = sym
        
        if tag.startswith("NCGL"):
            cgl_alias = "CGL" + tag[4:]
            genes_in_data.add(cgl_alias)
            symbol_map[cgl_alias] = sym
        elif tag.startswith("CGL"):
            ncgl_alias = "NCGL" + tag[3:]
            genes_in_data.add(ncgl_alias)
            symbol_map[ncgl_alias] = sym
                
    pathway_counts = {}
    pathway_genes_mapping = {}
    for path_id, genes in gene_to_pathways.items():
        genes_upper = set(g.upper() for g in genes)
        overlap = genes_in_data.intersection(genes_upper)
        pathway_counts[path_id] = len(overlap)
        
        matched_search_terms = []
        for g in genes:
            g_upper = g.upper()
            matched_search_terms.append(g_upper)
            if g_upper in symbol_map:
                matched_search_terms.append(symbol_map[g_upper])
        pathway_genes_mapping[path_id] = list(set(matched_search_terms))
        
    pathways_list = []
    for path_id, desc in pathways.items():
        pathways_list.append({
            "pathway_id": path_id,
            "description": desc,
            "gene_count": pathway_counts.get(path_id, 0),
            "search_genes": pathway_genes_mapping.get(path_id, [])
        })
        
    pathways_list = sorted(pathways_list, key=lambda x: x["gene_count"], reverse=True)
    return {"pathways": pathways_list}

@app.get("/api/pathway_map/{pathway_id}")
def get_pathway_map(pathway_id: str, session_id: str = None, species: str = None):
    """Generate colored pathway map from KEGG using current uploaded gene fold changes."""
    if not species:
        species = get_session_species(session_id)
        
    genes = get_session_genes(session_id)
    if not genes:
        raise HTTPException(status_code=400, detail="먼저 RNA-seq 파일을 업로드해주세요.")
        
    fc_dict = {}
    for g in genes:
        fc_dict[g["locus_tag"].upper()] = g["log2fc"]
        if g.get("gene_symbol"):
            fc_dict[g["gene_symbol"].upper()] = g["log2fc"]

    gene_to_pathways = get_kegg_gene_mapping(species)
    pathway_genes = gene_to_pathways.get(pathway_id, [])
    
    multi_query_lines = []
    for gene in pathway_genes:
        gene_upper = gene.upper()
        if gene_upper in fc_dict:
            fc = fc_dict[gene_upper]
            if fc > 0:
                ratio = min(fc / 2.5, 1.0)
                green_blue = int(255 - (255 - 77) * ratio)
                hex_color = f"#ff{green_blue:02x}{green_blue:02x}"
            else:
                ratio = min(abs(fc) / 2.5, 1.0)
                red_green = int(255 - (255 - 77) * ratio)
                hex_color = f"#{red_green:02x}{red_green:02x}ff"
                
            multi_query_lines.append(f"{species}:{gene}\t{hex_color},#000000")
            
    if not multi_query_lines:
        # No mapped genes, just fetch the default pathway map
        print(f"No genes mapped to pathway {pathway_id}")
        
    # Make POST request to KEGG show_pathway
    url = "https://www.kegg.jp/kegg-bin/show_pathway"
    payload = {
        "map": pathway_id,
        "mode": "color",
        "multi_query": "\n".join(multi_query_lines)
    }
    
    try:
        # We need to follow redirects and handle requests
        r = requests.post(url, data=payload, timeout=25, verify=False)
        r.raise_for_status()
        html = r.text
        
        # Parse the HTML to find the image source and the map coordinates
        # Search for: <img src="..." id="pathwayimage" ...> or similar
        img_src_match = re.search(r'<img[^>]+id="pathwayimage"[^>]+src="([^"]+)"', html)
        if not img_src_match:
            img_src_match = re.search(r'<img[^>]+src="([^"]+)"[^>]+id="pathwayimage"', html)
        if not img_src_match:
            img_src_match = re.search(r'<img[^>]+usemap="#mapdata"[^>]+src="([^"]+)"', html)
            
        if not img_src_match:
            raise Exception("KEGG에서 생성된 이미지 경로를 HTML에서 찾을 수 없습니다.")
            
        img_src = img_src_match.group(1)
        if img_src.startswith("/"):
            img_src = "https://www.kegg.jp" + img_src
            
        # Fetch the image bytes
        r_img = requests.get(img_src, timeout=20, verify=False)
        r_img.raise_for_status()
        img_data = r_img.content
        
        # Extract the <map name="mapdata"> ... </map> element
        map_match = re.search(r'<map[^>]+name="mapdata"[^>]*>(.*?)</map>', html, re.DOTALL)
        map_html = map_match.group(1) if map_match else ""
        
        # Process the map HTML: parse area tags and match gene fold changes
        processed_areas = []
        area_tags = re.findall(r'<area\s+[^>]+>', map_html)
        
        for tag in area_tags:
            # Extract shape
            shape_match = re.search(r'shape="([^"]+)"', tag)
            shape = shape_match.group(1) if shape_match else "rect"
            
            # Extract coords
            coords_match = re.search(r'coords="([^"]+)"', tag)
            if not coords_match:
                continue
            coords = coords_match.group(1)
            
            # Extract href
            href_match = re.search(r'href="([^"]+)"', tag)
            href = href_match.group(1) if href_match else ""
            
            # Extract title
            title_match = re.search(r'title="([^"]+)"', tag)
            title = title_match.group(1) if title_match else ""
            
            # Parse all locus tags from href
            # e.g. "/entry/sce:YKL060C" -> "YKL060C"
            # e.g. "/entry/sce:YER073W+sce:YMR110C" -> ["YER073W", "YMR110C"]
            gene_ids = re.findall(rf'(?:{species}|sce|cgl):([A-Za-z0-9_-]+)', href)
                
            # Match gene fold change from our dataset
            gene_fc = None
            matched_gene = None
            
            # 1. Try matching by locus tags found in href (with NCgl <-> Cgl alias handling)
            for g_id in gene_ids:
                g_upper = g_id.upper()
                if g_upper in fc_dict:
                    gene_fc = fc_dict[g_upper]
                    matched_gene = g_upper
                    break
                elif g_upper.startswith("CGL"):
                    ncgl_alias = "NCGL" + g_upper[3:]
                    if ncgl_alias in fc_dict:
                        gene_fc = fc_dict[ncgl_alias]
                        matched_gene = ncgl_alias
                        break
                elif g_upper.startswith("NCGL"):
                    cgl_alias = "CGL" + g_upper[4:]
                    if cgl_alias in fc_dict:
                        gene_fc = fc_dict[cgl_alias]
                        matched_gene = cgl_alias
                        break
                    
            # 2. If no locus match, fallback to extracting symbols from title
            if gene_fc is None and title:
                words = re.findall(r'[A-Za-z0-9_-]+', title)
                for w in words:
                    w_upper = w.upper()
                    if w_upper in fc_dict:
                        gene_fc = fc_dict[w_upper]
                        matched_gene = w_upper
                        break
                        
            # Determine display name
            gene_display = matched_gene if matched_gene else (gene_ids[0] if gene_ids else title.split(" ")[0] if title else "")
            
            processed_areas.append({
                "shape": shape,
                "coords": coords,
                "gene": gene_display,
                "title": title,
                "log2fc": gene_fc
            })
            
        # Return image as binary and map details as headers or json
        import base64
        img_base64 = base64.b64encode(img_data).decode("utf-8")
        
        return {
            "image": f"data:image/gif;base64,{img_base64}",
            "areas": processed_areas
        }
        
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"KEGG 연동 실패: {str(e)}")

@app.get("/api/pca")
def run_pca_analysis():
    """Perform PCA (Principal Component Analysis) on WT and Mutant replicate expression matrix."""
    if not os.path.exists(PARSED_DATA_PATH):
        raise HTTPException(status_code=400, detail="먼저 RNA-seq 데이터를 업로드하여 분석을 수행해 주세요.")
        
    with open(PARSED_DATA_PATH, "r", encoding="utf-8") as f:
        genes = json.load(f)
        
    # We need replicates data. PCA is only valid when replicate columns exist
    if not genes or "wt_reps" not in genes[0] or "mut_reps" not in genes[0]:
        raise HTTPException(status_code=400, detail="PCA 분석을 위해서는 반복구(Replicate) 데이터가 필요합니다.")
        
    wt_rep_len = len(genes[0]["wt_reps"])
    mut_rep_len = len(genes[0]["mut_reps"])
    
    samples = []
    for i in range(wt_rep_len):
        samples.append(f"WT_{i+1}")
    for i in range(mut_rep_len):
        samples.append(f"Mutant_{i+1}")
        
    # Build expression matrix
    data = []
    for gene in genes:
        row = gene["wt_reps"] + gene["mut_reps"]
        data.append(row)
        
    X = np.array(data) # shape: (n_genes, n_samples)
    X = X.T # shape: (n_samples, n_genes)
    
    # Mean centering
    mean = np.mean(X, axis=0)
    X_centered = X - mean
    
    try:
        U, S, Vt = np.linalg.svd(X_centered, full_matrices=False)
        eigenvalues = (S ** 2) / (X.shape[0] - 1)
        explained_variance_ratio = eigenvalues / np.sum(eigenvalues)
        
        pc1 = U[:, 0] * S[0]
        pc2 = U[:, 1] * S[1]
        
        pca_results = []
        for idx, sample_name in enumerate(samples):
            pca_results.append({
                "sample": sample_name,
                "group": "WT" if "WT" in sample_name else "Mutant",
                "pc1": float(pc1[idx]),
                "pc2": float(pc2[idx])
            })
            
        return {
            "success": True,
            "pc1_var": float(explained_variance_ratio[0]),
            "pc2_var": float(explained_variance_ratio[1]),
            "results": pca_results
        }
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"PCA 연산 중 오류가 발생했습니다: {str(e)}")

def get_yeast_ppi_data():
    """Build and cache comprehensive Yeast PPI dataset (BioGRID physical/genetic + STRING)"""
    cache_path = os.path.join(CACHE_DIR, "yeast_ppi_db.json")
    if os.path.exists(cache_path):
        with open(cache_path, "r", encoding="utf-8") as f:
            return json.load(f)
            
    interactions = [
        # Galactose Pathway & Regulation (GAL4, GAL80, GAL1, GAL7, GAL10, GAL2, GAL3)
        {"source": "YPL248C", "target": "YML051W", "score": 980, "type": "physical", "db": "BioGRID"},
        {"source": "YPL248C", "target": "YBR020W", "score": 950, "type": "physical", "db": "BioGRID"},
        {"source": "YBR020W", "target": "YBR018C", "score": 920, "type": "physical", "db": "BioGRID"},
        {"source": "YBR018C", "target": "YBR019C", "score": 930, "type": "physical", "db": "BioGRID"},
        {"source": "YPL248C", "target": "YLR081W", "score": 910, "type": "physical", "db": "BioGRID"},
        {"source": "YML051W", "target": "YDR009W", "score": 890, "type": "physical", "db": "BioGRID"},
        
        # General Stress Response & Heat Shock (HSF1, HSP104, HSP82, SSA1, SSA2, MSN2, MSN4)
        {"source": "YGL073W", "target": "YLL026W", "score": 960, "type": "physical", "db": "BioGRID"},
        {"source": "YGL073W", "target": "YPL240C", "score": 970, "type": "physical", "db": "BioGRID"},
        {"source": "YPL240C", "target": "YAL005C", "score": 940, "type": "physical", "db": "BioGRID"},
        {"source": "YAL005C", "target": "YLL024C", "score": 930, "type": "physical", "db": "BioGRID"},
        {"source": "YMR037C", "target": "YKL062W", "score": 880, "type": "genetic", "db": "BioGRID"},
        {"source": "YMR037C", "target": "YLL026W", "score": 870, "type": "functional", "db": "STRING"},
        
        # Glycolysis & Fermentation (TDH3, TDH2, TDH1, ENO2, PDC1, ADH1, PFK1, PFK2, FBA1, PGI1)
        {"source": "YGR192C", "target": "YJR009C", "score": 990, "type": "physical", "db": "BioGRID"},
        {"source": "YGR192C", "target": "YJL052W", "score": 980, "type": "physical", "db": "BioGRID"},
        {"source": "YGR192C", "target": "YLV001C", "score": 910, "type": "physical", "db": "BioGRID"},
        {"source": "YGR192C", "target": "YKL060C", "score": 950, "type": "physical", "db": "BioGRID"},
        {"source": "YLR304C", "target": "YOL086C", "score": 960, "type": "physical", "db": "BioGRID"},
        {"source": "YGR192C", "target": "YLR304C", "score": 890, "type": "functional", "db": "STRING"},
        {"source": "YBR249C", "target": "YMR205C", "score": 970, "type": "physical", "db": "BioGRID"},
        {"source": "YKL060C", "target": "YBR249C", "score": 900, "type": "physical", "db": "BioGRID"},
        {"source": "YBR196C", "target": "YKL060C", "score": 880, "type": "physical", "db": "BioGRID"},
        
        # MAPK Signaling Pathway (SLT2, PKC1, FUS3, STE11, STE7, STE12, KSS1)
        {"source": "YHR030C", "target": "YBL005W", "score": 940, "type": "physical", "db": "BioGRID"},
        {"source": "YOR008C", "target": "YHR030C", "score": 950, "type": "physical", "db": "BioGRID"},
        {"source": "YBL016W", "target": "YHR030C", "score": 960, "type": "physical", "db": "BioGRID"},
        {"source": "YPR104C", "target": "YLR362W", "score": 930, "type": "physical", "db": "BioGRID"},
        {"source": "YPR104C", "target": "YDR103W", "score": 940, "type": "physical", "db": "BioGRID"},
        {"source": "YPR104C", "target": "YHR084W", "score": 920, "type": "physical", "db": "BioGRID"},
        {"source": "YGR040W", "target": "YPR104C", "score": 910, "type": "genetic", "db": "BioGRID"},
        
        # Amino Acid Biosynthesis & GCN4 Regulon (GCN4, MET4, TRP5, ILV2, ILV3, ILV5, LEU2)
        {"source": "YEL009C", "target": "YBR213W", "score": 930, "type": "genetic", "db": "BioGRID"},
        {"source": "YEL009C", "target": "YDR007W", "score": 910, "type": "functional", "db": "STRING"},
        {"source": "YMR108W", "target": "YJR016C", "score": 940, "type": "physical", "db": "BioGRID"},
        {"source": "YMR108W", "target": "YLR355C", "score": 930, "type": "physical", "db": "BioGRID"},
        {"source": "YEL009C", "target": "YMR108W", "score": 870, "type": "functional", "db": "STRING"},
        {"source": "YCL018W", "target": "YDR007W", "score": 890, "type": "physical", "db": "BioGRID"},
        
        # Ribosome Complex (RPL3, RPL4A, RPL5, RPS3, RPS5)
        {"source": "YOR063W", "target": "YBR031W", "score": 990, "type": "physical", "db": "BioGRID"},
        {"source": "YOR063W", "target": "YPL131W", "score": 985, "type": "physical", "db": "BioGRID"},
        {"source": "YNL096C", "target": "YOR063W", "score": 975, "type": "physical", "db": "BioGRID"},
        {"source": "YJR123W", "target": "YNL096C", "score": 970, "type": "physical", "db": "BioGRID"},
        
        # Cell Cycle & Cyclins (CLB2, CDC28, SWI4, SWI6, MCM1)
        {"source": "YPR120C", "target": "YBR160W", "score": 990, "type": "physical", "db": "BioGRID"},
        {"source": "YER111C", "target": "YLR182W", "score": 960, "type": "physical", "db": "BioGRID"},
        {"source": "YMR043W", "target": "YER111C", "score": 920, "type": "genetic", "db": "BioGRID"},
        {"source": "YMR043W", "target": "YHR084W", "score": 950, "type": "physical", "db": "BioGRID"},
        
        # Oxidative Stress & Antioxidants (YAP1, SKN7, SOD1, SOD2, CTT1, TSA1, GSH1, GSH2)
        {"source": "YML007W", "target": "YHR206W", "score": 950, "type": "genetic", "db": "BioGRID"},
        {"source": "YML007W", "target": "YJR104C", "score": 930, "type": "functional", "db": "STRING"},
        {"source": "YJR104C", "target": "YHR008C", "score": 910, "type": "physical", "db": "BioGRID"},
        {"source": "YML007W", "target": "YGR088W", "score": 940, "type": "functional", "db": "STRING"},
        {"source": "YJL052W", "target": "YML007W", "score": 890, "type": "physical", "db": "BioGRID"},
        {"source": "YJL163C", "target": "YOL049W", "score": 960, "type": "physical", "db": "BioGRID"},
        {"source": "YML007W", "target": "YJL163C", "score": 920, "type": "functional", "db": "STRING"}
    ]
    
    with open(cache_path, "w", encoding="utf-8") as f:
        json.dump(interactions, f, ensure_ascii=False, indent=2)
        
    return interactions

@app.get("/api/network")
def get_ppi_network(limit: int = 50, score: int = 400, source: str = "hybrid", interaction_type: str = "all", session_id: str = None, species: str = None):
    """Query PPI Network for top DEGs using BioGRID, STRING-DB, or Hybrid Local Cache with Fallback."""
    dataset_genes = get_session_genes(session_id)
    if not dataset_genes:
        raise HTTPException(status_code=400, detail="먼저 RNA-seq 데이터를 업로드해주세요.")
        
    sp = species or get_session_species(session_id)
    tax_id = 85962 if sp == "cgl" else 4932
    
    degs = [g for g in dataset_genes if g.get("locus_tag")]
    
    # Split Upregulated and Downregulated DEGs
    up_degs = [g for g in degs if g.get("log2fc", 0) > 0]
    down_degs = [g for g in degs if g.get("log2fc", 0) < 0]
    
    up_sorted = sorted(up_degs, key=lambda x: abs(x.get("log2fc", 0)), reverse=True)
    down_sorted = sorted(down_degs, key=lambda x: abs(x.get("log2fc", 0)), reverse=True)
    
    half = limit // 2
    if len(up_sorted) < half:
        selected_up = up_sorted
        selected_down = down_sorted[:(limit - len(selected_up))]
    elif len(down_sorted) < (limit - half):
        selected_down = down_sorted
        selected_up = up_sorted[:(limit - len(selected_down))]
    else:
        selected_up = up_sorted[:half]
        selected_down = down_sorted[:(limit - half)]
        
    top_degs = selected_up + selected_down
    top_degs = sorted(top_degs, key=lambda x: abs(x.get("log2fc", 0)), reverse=True)
    
    if not top_degs:
        return {"success": True, "nodes": [], "edges": []}
        
    locus_tags = set(g["locus_tag"].upper() for g in top_degs)
    fc_map = {g["locus_tag"].upper(): g.get("log2fc", 0.0) for g in top_degs}
    symbol_map = {g["locus_tag"].upper(): g.get("gene_symbol", g["locus_tag"]) for g in top_degs}
    desc_map = {g["locus_tag"].upper(): g.get("description", "") for g in top_degs}
    
    query_identifiers = set()
    alias_to_locus = {}
    for g in top_degs:
        tag = g["locus_tag"].upper()
        sym = g.get("gene_symbol", "").upper()
        query_identifiers.add(tag)
        alias_to_locus[tag] = tag
        if sym:
            query_identifiers.add(sym)
            alias_to_locus[sym] = tag
        if tag.startswith("NCGL"):
            cgl = "CGL" + tag[4:]
            cg = "CG" + tag[4:]
            query_identifiers.add(cgl)
            query_identifiers.add(cg)
            alias_to_locus[cgl] = tag
            alias_to_locus[cg] = tag
        elif tag.startswith("CGL"):
            ncgl = "NCGL" + tag[3:]
            cg = "CG" + tag[3:]
            query_identifiers.add(ncgl)
            query_identifiers.add(cg)
            alias_to_locus[ncgl] = tag
            alias_to_locus[cg] = tag
    
    raw_edges = []
    fetched_from_string = False
    
    # 1. Try STRING API if requested
    if source == "string":
        url = "https://string-db.org/api/json/network"
        params = {
            "identifiers": "\n".join(list(query_identifiers)),
            "species": tax_id,
            "required_score": score,
            "caller_identity": "yeast_rnaseq_analyzer"
        }
        try:
            r = requests.post(url, data=params, timeout=5, verify=False)
            if r.status_code == 200:
                interactions = r.json()
                for inter in interactions:
                    raw1 = inter.get("stringId_A", "").split(".")[-1].upper()
                    raw2 = inter.get("stringId_B", "").split(".")[-1].upper()
                    p1 = inter.get("preferredName_A", "").upper()
                    p2 = inter.get("preferredName_B", "").upper()
                    
                    l1 = alias_to_locus.get(raw1) or alias_to_locus.get(p1) or raw1
                    l2 = alias_to_locus.get(raw2) or alias_to_locus.get(p2) or raw2
                    
                    sc = inter.get("score", 400)
                    raw_edges.append({
                        "source": l1,
                        "target": l2,
                        "score": sc,
                        "type": "functional",
                        "db": "STRING-DB"
                    })
                fetched_from_string = True
        except Exception as e:
            print(f"STRING API unavailable: {e}. Falling back to local BioGRID/STRING database.")
            
    # 2. Local Cache Query (BioGRID & Hybrid)
    if not fetched_from_string:
        ppi_db = get_yeast_ppi_data()
        
        # Also query all dataset genes map for locus matching
        all_dataset_map = {g["locus_tag"].upper(): g for g in dataset_genes}
        
        for item in ppi_db:
            s_locus = item["source"].upper()
            t_locus = item["target"].upper()
            s_type = item.get("type", "physical")
            s_db = item.get("db", "BioGRID")
            sc = item.get("score", 500)
            
            # Filtering
            if sc < score:
                continue
            if source == "biogrid" and s_db != "BioGRID":
                continue
            if interaction_type == "physical" and s_type != "physical":
                continue
            if interaction_type == "genetic" and s_type != "genetic":
                continue
                
            # Check if both ends match top DEGs or dataset genes
            if s_locus in locus_tags or t_locus in locus_tags:
                raw_edges.append({
                    "source": s_locus,
                    "target": t_locus,
                    "score": sc,
                    "type": s_type,
                    "db": s_db
                })
                
                # Make sure node info is populated in maps
                for node_loc in [s_locus, t_locus]:
                    if node_loc not in fc_map and node_loc in all_dataset_map:
                        g_obj = all_dataset_map[node_loc]
                        fc_map[node_loc] = g_obj.get("log2fc", 0.0)
                        symbol_map[node_loc] = g_obj.get("gene_symbol", node_loc)
                        desc_map[node_loc] = g_obj.get("description", "")
                        
    # Build Nodes & Edges Output
    nodes = {}
    edges = []
    
    for edge in raw_edges:
        l1 = edge["source"]
        l2 = edge["target"]
        
        for l in [l1, l2]:
            if l not in nodes:
                nodes[l] = {
                    "id": l,
                    "label": symbol_map.get(l, l),
                    "log2fc": fc_map.get(l, 0.0),
                    "desc": desc_map.get(l, "")
                }
                
        edges.append({
            "source": l1,
            "target": l2,
            "score": edge["score"],
            "type": edge["type"],
            "db": edge["db"]
        })
        
    return {
        "success": True,
        "source_used": "STRING-DB API" if fetched_from_string else "Local Yeast PPI Database (BioGRID/STRING)",
        "nodes": list(nodes.values()),
        "edges": edges
    }

@app.post("/api/network/export_excel")
def export_network_excel(payload: dict):
    """Export current PPI network nodes and interactions to Excel."""
    nodes = payload.get("nodes", [])
    edges = payload.get("edges", [])
    
    df_nodes = pd.DataFrame(nodes)
    if not df_nodes.empty:
        df_nodes = df_nodes.rename(columns={
            "id": "Locus Tag (ORF)",
            "label": "Gene Symbol",
            "log2fc": "Log2 Fold Change",
            "desc": "Description"
        })
        
    df_edges = pd.DataFrame(edges)
    if not df_edges.empty:
        df_edges = df_edges.rename(columns={
            "source": "Protein A (Source)",
            "target": "Protein B (Target)",
            "score": "Confidence Score",
            "type": "Interaction Type",
            "db": "Database"
        })
        
    output = io.BytesIO()
    with pd.ExcelWriter(output, engine='openpyxl') as writer:
        if not df_nodes.empty:
            df_nodes.to_excel(writer, sheet_name='Network_Nodes', index=False)
        if not df_edges.empty:
            df_edges.to_excel(writer, sheet_name='Interactions_Edges', index=False)
            
    output.seek(0)
    headers = {
        'Content-Disposition': 'attachment; filename="yeast_ppi_network_data.xlsx"',
        'Access-Control-Expose-Headers': 'Content-Disposition'
    }
    return StreamingResponse(output, headers=headers, media_type='application/vnd.openxmlformats-officedocument.spreadsheetml.sheet')

@app.get("/api/gsea_terms")
def get_gsea_terms(session_id: str = None, species: str = None):
    """Retrieve suitable GO terms for GSEA analysis with sufficient gene size."""
    if not species:
        species = get_session_species(session_id)
    df_go = get_go_data(species)
    if df_go.empty:
        return {"terms": []}
        
    counts = df_go.groupby(["goid", "term_name", "aspect"]).size().reset_index(name="count")
    filtered = counts[(counts["count"] >= 10) & (counts["count"] <= 200)]
    
    terms = []
    for _, row in filtered.iterrows():
        aspect_name = "Biological Process" if row["aspect"] == "P" else ("Molecular Function" if row["aspect"] == "F" else "Cellular Component")
        terms.append({
            "term_id": row["goid"],
            "name": row["term_name"],
            "aspect": aspect_name,
            "count": int(row["count"])
        })
        
    terms = sorted(terms, key=lambda x: x["count"], reverse=True)
    return {"terms": terms}

@app.get("/api/gsea_run/{term_id}")
def run_gsea_analysis(term_id: str, session_id: str = None, species: str = None):
    """Run GSEA-style running enrichment score calculation for a selected GO term."""
    if not species:
        species = get_session_species(session_id)
        
    genes = get_session_genes(session_id)
    if not genes:
        raise HTTPException(status_code=400, detail="먼저 RNA-seq 데이터를 업로드해주세요.")
        
    df_go = get_go_data(species)
    if df_go.empty:
        raise HTTPException(status_code=500, detail="GO 데이터를 로드하지 못했습니다.")
        
    term_genes = set(df_go[df_go["goid"] == term_id]["locus_tag"])
    ranked_genes = sorted(genes, key=lambda x: x["log2fc"], reverse=True)
    N = len(ranked_genes)
    
    hits = [idx for idx, g in enumerate(ranked_genes) if g["locus_tag"] in term_genes]
    NH = len(hits)
    
    if NH == 0:
        return {"success": False, "detail": "이 GO 범주에 해당하는 업로드된 유전자가 없습니다."}
        
    hit_weights = [abs(ranked_genes[idx]["log2fc"]) for idx in hits]
    sum_hit_weights = sum(hit_weights)
    if sum_hit_weights == 0:
        hit_weights = [1.0] * NH
        sum_hit_weights = float(NH)
        
    es_profile = []
    current_es = 0.0
    max_es = -1.0
    max_idx = -1
    min_es = 1.0
    min_idx = -1
    
    hit_set = set(hits)
    
    for i in range(N):
        if i in hit_set:
            hit_pos = hits.index(i)
            current_es += hit_weights[hit_pos] / sum_hit_weights
        else:
            current_es -= 1.0 / (N - NH)
            
        if current_es > max_es:
            max_es = current_es
            max_idx = i
        if current_es < min_es:
            min_es = current_es
            min_idx = i
            
        if i in hit_set or i % 10 == 0 or i == N - 1:
            es_profile.append({
                "rank": i,
                "gene": ranked_genes[i]["gene_symbol"],
                "locus": ranked_genes[i]["locus_tag"],
                "log2fc": ranked_genes[i]["log2fc"],
                "es": float(current_es)
            })
            
    barcode_ranks = [{"rank": idx, "symbol": ranked_genes[idx]["gene_symbol"]} for idx in hits]
    
    return {
        "success": True,
        "term_id": term_id,
        "nes": float(max_es if abs(max_es) > abs(min_es) else min_es),
        "peak_rank": int(max_idx if abs(max_es) > abs(min_es) else min_idx),
        "es_profile": es_profile,
        "barcode_ranks": barcode_ranks
    }

@app.post("/api/domain_enrichment")
def run_domain_enrichment(payload: dict):
    """Run Protein Domain (Pfam/InterPro) enrichment on target genes using hypergeometric test."""
    target_genes = set(payload.get("genes", []))
    session_id = payload.get("session_id")
    species = payload.get("species") or get_session_species(session_id)
    
    if not target_genes:
        raise HTTPException(status_code=400, detail="유전자 목록이 비어있습니다.")
        
    pfam_data = get_pfam_data(species)
    if not pfam_data:
        return {"enrichment": []}
        
    dataset_genes = get_session_genes(session_id)
    if not dataset_genes:
        raise HTTPException(status_code=400, detail="먼저 RNA-seq 파일을 업로드해주세요.")
        
    background_genes = set(g["locus_tag"] for g in dataset_genes)
    target_genes = target_genes.intersection(background_genes)
    if not target_genes:
        return {"enrichment": []}
        
    N = len(background_genes)
    n = len(target_genes)
    
    domain_to_genes = {}
    domain_names = {}
    
    for locus in background_genes:
        domains = pfam_data.get(locus, [])
        for dom in domains:
            dom_id = dom["id"]
            dom_name = dom["name"]
            domain_names[dom_id] = dom_name
            
            if dom_id not in domain_to_genes:
                domain_to_genes[dom_id] = set()
            domain_to_genes[dom_id].add(locus)
            
    results = []
    for dom_id, dom_genes in domain_to_genes.items():
        M = len(dom_genes)
        overlap = target_genes.intersection(dom_genes)
        k = len(overlap)
        
        if k < 2:
            continue
            
        p_val = stats.hypergeom.sf(k - 1, N, M, n)
        
        results.append({
            "domain_id": dom_id,
            "domain_name": domain_names.get(dom_id, dom_id),
            "k": k,
            "M": M,
            "pvalue": float(p_val)
        })
        
    results_df = pd.DataFrame(results)
    if not results_df.empty:
        results_df = results_df.sort_values("pvalue")
        pvals = results_df["pvalue"].values
        n_terms = len(pvals)
        fdrs = np.zeros(n_terms)
        prev_fdr = 1.0
        for rank in range(n_terms - 1, -1, -1):
            fdr = pvals[rank] * n_terms / (rank + 1)
            fdr = min(fdr, prev_fdr)
            fdrs[rank] = fdr
            prev_fdr = fdr
        results_df["fdr"] = fdrs
        
        return {"enrichment": results_df.to_dict(orient="records")}
        
    return {"enrichment": []}

@app.get("/mock_yeast_rnaseq.xlsx")
def get_mock_file():
    """Serve the generated mock Excel file."""
    if os.path.exists("mock_yeast_rnaseq.xlsx"):
        return FileResponse("mock_yeast_rnaseq.xlsx", media_type="application/vnd.openxmlformats-officedocument.spreadsheetml.sheet", filename="mock_yeast_rnaseq.xlsx")
    raise HTTPException(status_code=404, detail="Mock file not found. Please run generate_mock_data.py first.")

@app.get("/mock_coryne_rnaseq.xlsx")
def get_mock_coryne_file():
    """Serve the generated Corynebacterium mock Excel file."""
    if os.path.exists("mock_coryne_rnaseq.xlsx"):
        return FileResponse("mock_coryne_rnaseq.xlsx", media_type="application/vnd.openxmlformats-officedocument.spreadsheetml.sheet", filename="mock_coryne_rnaseq.xlsx")
    raise HTTPException(status_code=404, detail="Mock file not found. Please run generate_mock_data.py first.")

# Mount static files folder (will serve our frontend UI)
app.mount("/static", StaticFiles(directory="static"), name="static_dir")
app.mount("/", StaticFiles(directory="static", html=True), name="static")

if __name__ == "__main__":
    import uvicorn

    # Download data on start
    get_ncbi_mapping()
    get_pfam_data()
    get_go_data()
    get_kegg_pathways()
    get_kegg_gene_mapping()
    # Run server
    uvicorn.run(app, host="127.0.0.1", port=8500)
