import pandas as pd
import numpy as np
import os

# 1. Base Core Yeast genes list
yeast_core_genes = [
    {"Gene_ID": 855762, "Gene_Symbol": "CDC19", "Description": "Pyruvate kinase", "locus_tag": "YAL038W", "direction": "down"},
    {"Gene_ID": 850733, "Gene_Symbol": "PDC1", "Description": "Pyruvate decarboxylase", "locus_tag": "YLR044C", "direction": "down"},
    {"Gene_ID": 853805, "Gene_Symbol": "FBA1", "Description": "Fructose-bisphosphate aldolase", "locus_tag": "YKL060C", "direction": "down"},
    {"Gene_ID": 856579, "Gene_Symbol": "ENO2", "Description": "Enolase 2", "locus_tag": "YHR174W", "direction": "down"},
    {"Gene_ID": 853705, "Gene_Symbol": "GPM1", "Description": "Phosphoglycerate mutase 1", "locus_tag": "YKL152C", "direction": "down"},
    {"Gene_ID": 853106, "Gene_Symbol": "TDH3", "Description": "Glyceraldehyde-3-phosphate dehydrogenase", "locus_tag": "YGR192C", "direction": "down"},
    {"Gene_ID": 854068, "Gene_Symbol": "ADH1", "Description": "Alcohol dehydrogenase ADH1", "locus_tag": "YOL086C", "direction": "down"},
    {"Gene_ID": 854817, "Gene_Symbol": "PGI1", "Description": "Phosphoglucose isomerase", "locus_tag": "YBR196C", "direction": "unchanged"},
    {"Gene_ID": 853503, "Gene_Symbol": "HXK1", "Description": "Hexokinase 1", "locus_tag": "YFR053C", "direction": "up"},
    {"Gene_ID": 851253, "Gene_Symbol": "HXK2", "Description": "Hexokinase 2", "locus_tag": "YGL253W", "direction": "up"},
    {"Gene_ID": 856238, "Gene_Symbol": "PFK1", "Description": "Phosphofructokinase 1 alpha", "locus_tag": "YGR240C", "direction": "up"},
    {"Gene_ID": 855210, "Gene_Symbol": "PFK2", "Description": "Phosphofructokinase 1 beta", "locus_tag": "YMR205C", "direction": "up"},
    {"Gene_ID": 852415, "Gene_Symbol": "TEF2", "Description": "Translation elongation factor EF-1 alpha", "locus_tag": "YBR110W", "direction": "unchanged"},
    {"Gene_ID": 856195, "Gene_Symbol": "TEF1", "Description": "Translation elongation factor EF-1 alpha", "locus_tag": "YPR080W", "direction": "unchanged"},
    {"Gene_ID": 850383, "Gene_Symbol": "CIT1", "Description": "Citrate synthase", "locus_tag": "YPR026W", "direction": "up"},
    {"Gene_ID": 851829, "Gene_Symbol": "ACO1", "Description": "Aconitase", "locus_tag": "YLR304C", "direction": "up"},
    {"Gene_ID": 850933, "Gene_Symbol": "MDH1", "Description": "Mitochondrial malate dehydrogenase", "locus_tag": "YKL085W", "direction": "up"},
    {"Gene_ID": 855763, "Gene_Symbol": "GCN4", "Description": "Transcription factor GCN4", "locus_tag": "YEL009C", "direction": "up"},
    {"Gene_ID": 855764, "Gene_Symbol": "HAP4", "Description": "Transcriptional activator HAP4", "locus_tag": "YKL109W", "direction": "up"},
    {"Gene_ID": 855765, "Gene_Symbol": "GAL4", "Description": "DNA-binding transcription factor GAL4", "locus_tag": "YPL248C", "direction": "up"},
    {"Gene_ID": 855766, "Gene_Symbol": "MCM1", "Description": "Transcription factor MCM1", "locus_tag": "YMR043W", "direction": "unchanged"},
    {"Gene_ID": 855767, "Gene_Symbol": "STE12", "Description": "Transcription factor STE12", "locus_tag": "YHR084W", "direction": "unchanged"},
    {"Gene_ID": 855768, "Gene_Symbol": "YAP1", "Description": "Basic leucine zipper transcription factor YAP1", "locus_tag": "YML007W", "direction": "up"},
    {"Gene_ID": 855769, "Gene_Symbol": "SWI4", "Description": "Transcription factor SWI4", "locus_tag": "YER111C", "direction": "unchanged"},
    {"Gene_ID": 855770, "Gene_Symbol": "SKN7", "Description": "Response regulator SKN7", "locus_tag": "YHR206W", "direction": "up"}
]

# Generate additional yeast genes up to 525 genes
np.random.seed(42)
yeast_genes_data = list(yeast_core_genes)
existing_yeast_tags = set(g["locus_tag"] for g in yeast_genes_data)

chroms = ["A", "B", "C", "D", "E", "F", "G", "H", "I", "J", "K", "L", "M", "N", "O", "P"]
num_counter = 1
while len(yeast_genes_data) < 525:
    ch = chroms[num_counter % len(chroms)]
    num_str = f"{num_counter:03d}"
    arm = "L" if (num_counter % 2 == 0) else "R"
    strand = "W" if (num_counter % 3 == 0) else "C"
    tag = f"Y{ch}{arm}{num_str}{strand}"
    if tag not in existing_yeast_tags:
        existing_yeast_tags.add(tag)
        dir_choice = np.random.choice(["up", "down", "unchanged"], p=[0.25, 0.25, 0.50])
        yeast_genes_data.append({
            "Gene_ID": 850000 + num_counter,
            "Gene_Symbol": f"YEST_{num_counter}",
            "Description": f"Hypothetical yeast protein Y{ch}{arm}{num_str}{strand}",
            "locus_tag": tag,
            "direction": dir_choice
        })
    num_counter += 1

# 2. Base Core Corynebacterium glutamicum genes list
coryne_core_genes = [
    {"Gene_ID": 1021201, "Gene_Symbol": "pyc", "Description": "Pyruvate carboxylase", "locus_tag": "NCgl0908", "direction": "up"},
    {"Gene_ID": 1021202, "Gene_Symbol": "ptsG", "Description": "PTS system glucose-specific EIICB component", "locus_tag": "NCgl1936", "direction": "up"},
    {"Gene_ID": 1021203, "Gene_Symbol": "lysC", "Description": "Aspartate kinase (lysine biosynthesis)", "locus_tag": "NCgl0247", "direction": "up"},
    {"Gene_ID": 1021204, "Gene_Symbol": "hom", "Description": "Homoserine dehydrogenase", "locus_tag": "NCgl1216", "direction": "down"},
    {"Gene_ID": 1021205, "Gene_Symbol": "dapA", "Description": "Dihydrodipicolinate synthase", "locus_tag": "NCgl1896", "direction": "up"},
    {"Gene_ID": 1021206, "Gene_Symbol": "lysE", "Description": "L-lysine exporter LysE", "locus_tag": "NCgl1208", "direction": "up"},
    {"Gene_ID": 1021207, "Gene_Symbol": "gdh", "Description": "NADP-dependent glutamate dehydrogenase", "locus_tag": "NCgl1997", "direction": "up"},
    {"Gene_ID": 1021208, "Gene_Symbol": "pck", "Description": "Phosphoenolpyruvate carboxykinase", "locus_tag": "NCgl2806", "direction": "down"},
    {"Gene_ID": 1021209, "Gene_Symbol": "aceA", "Description": "Isocitrate lyase (glyoxylate cycle)", "locus_tag": "NCgl2248", "direction": "up"},
    {"Gene_ID": 1021210, "Gene_Symbol": "aceB", "Description": "Malate synthase", "locus_tag": "NCgl2249", "direction": "up"},
    {"Gene_ID": 1021211, "Gene_Symbol": "gapA", "Description": "Glyceraldehyde-3-phosphate dehydrogenase", "locus_tag": "NCgl0896", "direction": "up"},
    {"Gene_ID": 1021212, "Gene_Symbol": "pyk", "Description": "Pyruvate kinase", "locus_tag": "NCgl2008", "direction": "down"},
    {"Gene_ID": 1021213, "Gene_Symbol": "pfkA", "Description": "6-phosphofructokinase", "locus_tag": "NCgl1193", "direction": "unchanged"},
    {"Gene_ID": 1021214, "Gene_Symbol": "eno", "Description": "Enolase", "locus_tag": "NCgl0935", "direction": "unchanged"},
    {"Gene_ID": 1021215, "Gene_Symbol": "ldh", "Description": "L-lactate dehydrogenase", "locus_tag": "NCgl2812", "direction": "down"},
    {"Gene_ID": 1021216, "Gene_Symbol": "glxR", "Description": "Transcriptional regulator GlxR", "locus_tag": "NCgl0367", "direction": "unchanged"},
    {"Gene_ID": 1021217, "Gene_Symbol": "sugR", "Description": "Transcriptional repressor SugR", "locus_tag": "NCgl1857", "direction": "down"},
    {"Gene_ID": 1021218, "Gene_Symbol": "amtA", "Description": "Ammonium transporter AmtA", "locus_tag": "NCgl0460", "direction": "up"},
    {"Gene_ID": 1021219, "Gene_Symbol": "glnA", "Description": "Glutamine synthetase", "locus_tag": "NCgl1834", "direction": "up"},
    {"Gene_ID": 1021220, "Gene_Symbol": "pta", "Description": "Phosphate acetyltransferase", "locus_tag": "NCgl2544", "direction": "down"},
    {"Gene_ID": 1021221, "Gene_Symbol": "ackA", "Description": "Acetate kinase", "locus_tag": "NCgl2543", "direction": "down"},
    {"Gene_ID": 1021222, "Gene_Symbol": "metA", "Description": "Homoserine O-acetyltransferase", "locus_tag": "NCgl0651", "direction": "down"},
    {"Gene_ID": 1021223, "Gene_Symbol": "cysK", "Description": "Cysteine synthase", "locus_tag": "NCgl2469", "direction": "up"},
    {"Gene_ID": 1021224, "Gene_Symbol": "pqo", "Description": "Pyruvate:quinone oxidoreductase", "locus_tag": "NCgl2533", "direction": "up"},
    {"Gene_ID": 1021225, "Gene_Symbol": "fasA", "Description": "Fatty acid synthase subunit A", "locus_tag": "NCgl0831", "direction": "unchanged"}
]

# Generate additional Corynebacterium genes up to 525 genes
coryne_genes_data = list(coryne_core_genes)
existing_coryne_tags = set(g["locus_tag"] for g in coryne_genes_data)

cg_num = 1
while len(coryne_genes_data) < 525:
    tag = f"NCgl{cg_num:04d}"
    if tag not in existing_coryne_tags:
        existing_coryne_tags.add(tag)
        dir_choice = np.random.choice(["up", "down", "unchanged"], p=[0.25, 0.25, 0.50])
        coryne_genes_data.append({
            "Gene_ID": 1020000 + cg_num,
            "Gene_Symbol": f"cg{cg_num:04d}",
            "Description": f"Corynebacterium glutamicum ORF NCgl{cg_num:04d}",
            "locus_tag": tag,
            "direction": dir_choice
        })
    cg_num += 1

def generate_excel(genes_list, filename):
    np.random.seed(42)
    rows = []
    for item in genes_list:
        wt_tpm = np.random.exponential(1000) + 50
        dir_choice = item.get("direction", "unchanged")
        if dir_choice == "up":
            fc = np.random.uniform(2.2, 6.5)
        elif dir_choice == "down":
            fc = 1 / np.random.uniform(2.2, 6.5)
        else:
            fc = np.random.uniform(0.85, 1.15)
            
        mutant_tpm = wt_tpm * fc
        wt_reps = [round(wt_tpm * np.random.uniform(0.92, 1.08), 2) for _ in range(3)]
        mut_reps = [round(mutant_tpm * np.random.uniform(0.92, 1.08), 2) for _ in range(3)]
        
        rows.append({
            "Gene_ID": item["Gene_ID"],
            "Gene_Symbol": item["Gene_Symbol"],
            "locus_tag": item["locus_tag"],
            "Description": item["Description"],
            "Mutant_TPM AVG": round(mutant_tpm, 2),
            "WT_TPM AVG": round(wt_tpm, 2),
            "Mutant_TPM_1": mut_reps[0],
            "Mutant_TPM_2": mut_reps[1],
            "Mutant_TPM_3": mut_reps[2],
            "WT_TPM_1": wt_reps[0],
            "WT_TPM_2": wt_reps[1],
            "WT_TPM_3": wt_reps[2],
            "gene_biotype": "protein_coding"
        })
        
    df = pd.DataFrame(rows)
    df.to_excel(filename, index=False)
    print(f"Generated '{filename}' with {len(df)} genes.")

if __name__ == "__main__":
    generate_excel(yeast_genes_data, "mock_yeast_rnaseq.xlsx")
    generate_excel(coryne_genes_data, "mock_coryne_rnaseq.xlsx")
