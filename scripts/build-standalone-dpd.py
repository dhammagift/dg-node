#!/usr/bin/env python3
import sqlite3
import json
import os
import re
import sys

# Locally generates the reader's standalone dictionary files from the DPD database.
# Logic mirrors https://github.com/digitalpalidictionary/dpd-db/tree/main/exporter/tbw
# and https://github.com/sasanarakkha/dpd-db-sbs/blob/sbs-ru/exporter/tbw/tbw_exporter_ru.py

if len(sys.argv) < 3:
    print("Usage: build-standalone-dpd.py <REPO_ROOT> <OUTPUT_DIR>")
    sys.exit(1)

REPO_ROOT = sys.argv[1]
OUTPUT_DIR = sys.argv[2]
DPD_DB_PATH = os.path.join("/tmp/dpd_gen", "dpd.db")
SUTTA_WORDS_PATH = os.path.join(REPO_ROOT, "public/overrides/texts/sutta_words.txt")

# POS Abbreviations mapping (EN to RU)
POS_RU = {
    "adj.": "прил.",
    "pron.": "местоим.",
    "masc.": "муж.",
    "fem.": "жен.",
    "nt.": "ср.",
    "ind.": "нескл.",
    "pp.": "прич.прош.",
    "ptp.": "прич.долж.",
    "prp.": "прич.наст.",
    "ger.": "герунд.",
    "inf.": "инф.",
    "abs.": "абс.",
    "prefix": "прист.",
    "suffix": "суф.",
    "root": "корень",
    "idiom": "идиом.",
    "sandhi": "сандхи",
    "var.": "вар.",
}

# Pali sort order
PALI_ALPHABET = "aāiīuūeo k kh g gh ṅ c ch j jh ñ ṭ ṭh ḍ ḍh ṇ t th d dh n p ph b bh m y r l ḷ v s h ṁ".split()
PALI_ORDER = {char: i for i, char in enumerate(PALI_ALPHABET)}

def pali_sort_key(word):
    if not word: return []
    word = word.lower().replace("ṃ", "ṁ")
    key = []
    i = 0
    while i < len(word):
        if i + 1 < len(word) and word[i:i+2] in PALI_ORDER:
            key.append(PALI_ORDER[word[i:i+2]])
            i += 2
        elif word[i] in PALI_ORDER:
            key.append(PALI_ORDER[word[i]])
            i += 1
        else:
            key.append(100 + ord(word[i]))
            i += 1
    return key

def get_word_set():
    word_set = set()
    if not os.path.exists(SUTTA_WORDS_PATH):
        print(f"Warning: {SUTTA_WORDS_PATH} not found.")
        return word_set
    
    with open(SUTTA_WORDS_PATH, "r", encoding="utf-8") as f:
        for line in f:
            line = line.strip()
            if not line: continue
            parts = line.split()
            if len(parts) >= 1:
                word = parts[0].lower().replace("ṃ", "ṁ")
                if re.match(r"^[a-zāīūṅñṭḍṇḷṁ\.\*]+$", word):
                    word_set.add(word)
    return word_set

def translate_pos(pos):
    if not pos: return ""
    for en, ru in POS_RU.items():
        if pos == en or pos == en.strip('.'):
            return ru
    return pos

def generate():
    if not os.path.exists(DPD_DB_PATH):
        print(f"Error: {DPD_DB_PATH} not found.")
        sys.exit(1)

    print("Loading word set...")
    word_set = get_word_set()
    print(f"Word set size: {len(word_set)}")

    conn = sqlite3.connect(DPD_DB_PATH)
    conn.row_factory = sqlite3.Row
    cursor = conn.cursor()

    print("Fetching headwords and translations...")
    # Join with russian table (SBS specific)
    query = """
    SELECT h.*, r.ru_meaning, r.ru_meaning_raw, r.ru_meaning_lit
    FROM dpd_headwords h
    LEFT JOIN russian r ON h.id = r.id
    """
    cursor.execute(query)
    headwords = cursor.fetchall()

    i2h_dict = {}
    ebts_en_dict = {}
    ebts_ru_dict = {}
    matched_headwords = set()
    
    print("Processing headwords...")
    for h in headwords:
        lemma_1 = h["lemma_1"]
        # Skip grammar entries
        if "(gram)" in (h["meaning_1"] or ""):
            continue
            
        infl_all = (h["inflections"] or "") + "," + (h["inflections_api_ca_eva_iti"] or "")
        infl_list = [i.strip().lower().replace("ṃ", "ṁ") for i in infl_all.split(",") if i.strip()]
        
        # Original logic: words in EBTs or deconstructor splits
        found_in_texts = False
        for infl in infl_list:
            if infl in word_set:
                i2h_dict.setdefault(infl, []).append(lemma_1)
                found_in_texts = True
        
        if found_in_texts:
            matched_headwords.add(lemma_1)
            
            # Format EN
            pos_en = h['pos']
            meaning_en = h["meaning_1"] or h["meaning_2"] or ""
            en_text = f"{pos_en}. <b>{meaning_en}</b>"
            if h["meaning_lit"]:
                en_text = en_text.replace("</b>", f"; lit. {h['meaning_lit']}</b>")
            if h["construction"]:
                en_text += f" [{h['construction'].splitlines()[0]}]"
            ebts_en_dict[lemma_1] = en_text
            
            # Format RU
            pos_ru = translate_pos(pos_en)
            if h["ru_meaning"]:
                ru_text = f"<b>{h['ru_meaning']}</b>"
                if h["ru_meaning_lit"]:
                    ru_text += f"; досл. {h['ru_meaning_lit']}"
            elif h["ru_meaning_raw"]:
                ru_text = f"<i>[пер. ИИ]</i> {h['ru_meaning_raw']}"
            else:
                ru_text = meaning_en
            
            ru_full = f"{pos_ru}. {ru_text}"
            if h["construction"]:
                ru_full += f" [{h['construction'].splitlines()[0]}]"
            ebts_ru_dict[lemma_1] = ru_full

    print("Sorting i2h...")
    for infl in i2h_dict:
        i2h_dict[infl] = sorted(list(set(i2h_dict[infl])), key=pali_sort_key)
        
    print("Processing deconstructor...")
    deconstructor_dict = {}
    cursor.execute("SELECT lookup_key, deconstructor FROM lookup WHERE deconstructor != \"\"")
    for row in cursor.fetchall():
        key = row["lookup_key"].lower().replace("ṃ", "ṁ")
        if key in word_set and key not in matched_headwords:
            try:
                dec_list = json.loads(row["deconstructor"])
                deconstructor_dict[key] = "<br>".join(dec_list)
            except:
                pass
    
    ebts_en_dict = dict(sorted(ebts_en_dict.items(), key=lambda x: pali_sort_key(x[0])))
    ebts_ru_dict = dict(sorted(ebts_ru_dict.items(), key=lambda x: pali_sort_key(x[0])))
    deconstructor_dict = dict(sorted(deconstructor_dict.items(), key=lambda x: pali_sort_key(x[0])))

    print("Saving files...")
    os.makedirs(OUTPUT_DIR, exist_ok=True)
    os.makedirs(os.path.join(OUTPUT_DIR, "ru"), exist_ok=True)
    
    def save_js(filename, var_name, data):
        with open(os.path.join(OUTPUT_DIR, filename), "w", encoding="utf-8") as f:
            f.write(f"var {var_name} = " + json.dumps(data, ensure_ascii=False, indent=2) + ";")

    save_js("dpd_i2h.js", "dpd_i2h", i2h_dict)
    save_js("dpd_ebts.js", "dpd_ebts", ebts_en_dict)
    save_js("ru/dpd_ebts.js", "dpd_ebts", ebts_ru_dict)
    save_js("dpd_deconstructor.js", "dpd_deconstructor", deconstructor_dict)

    conn.close()
    print(f"Generation complete. Files saved to {OUTPUT_DIR}")

if __name__ == "__main__":
    generate()
