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
    print("Usage: build-standalone-dpd.py <REPO_ROOT> <OUTPUT_DIR> [DPD_DB_PATH]")
    sys.exit(1)

REPO_ROOT = sys.argv[1]
OUTPUT_DIR = sys.argv[2]
DPD_DB_PATH = sys.argv[3] if len(sys.argv) > 3 else os.path.join("/tmp/dpd_gen", "dpd.db")
DG_DB_PATH = os.path.join(REPO_ROOT, "dg.db")
SUTTA_WORDS_PATH = os.path.join(REPO_ROOT, "public/overrides/texts/sutta_words.txt")

# POS Abbreviations mapping (EN to RU)
POS_RU = {
    "adj.": "прил.", "pron.": "местоим.", "masc.": "муж.", "fem.": "жен.", "nt.": "ср.",
    "ind.": "нескл.", "pp.": "прич.прош.", "ptp.": "прич.долж.", "prp.": "прич.наст.",
    "ger.": "герунд.", "inf.": "инф.", "abs.": "абс.", "prefix": "прист.", "suffix": "суф.",
    "root": "корень", "idiom": "идиом.", "sandhi": "сандхи", "var.": "вар.",
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
    # In GHA we might not have dg.db, so we prefer sutta_words.txt if available
    if os.path.exists(SUTTA_WORDS_PATH):
        print(f"Loading word set from {SUTTA_WORDS_PATH}...")
        with open(SUTTA_WORDS_PATH, "r", encoding="utf-8") as f:
            for line in f:
                parts = line.strip().split()
                if parts:
                    word = parts[0].lower().replace("ṃ", "ṁ")
                    word_set.add(word)
    elif os.path.exists(DG_DB_PATH):
        print(f"Extracting word set from {DG_DB_PATH}...")
        conn = sqlite3.connect(DG_DB_PATH)
        cursor = conn.cursor()
        cursor.execute("SELECT word FROM vocab")
        for row in cursor.fetchall():
            word_set.add(row[0].lower().replace("ṃ", "ṁ"))
        conn.close()
    
    # Common small words fallback
    word_set.update(["a", "ā", "i", "ī", "u", "ū", "e", "o", "ca", "ti", "iti", "na", "hi", "tu", "nu", "kho", "kho-pana"])
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

    word_set = get_word_set()
    print(f"Word set size: {len(word_set)}")

    conn = sqlite3.connect(DPD_DB_PATH)
    conn.row_factory = sqlite3.Row
    cursor = conn.cursor()

    print("Making deconstructor splits set...")
    deconstructed_splits_set = set()
    cursor.execute("SELECT deconstructor FROM lookup WHERE deconstructor != \"\"")
    for row in cursor.fetchall():
        try:
            dec_list = json.loads(row["deconstructor"])
            for dec in dec_list:
                for part in dec.split(" + "):
                    deconstructed_splits_set.add(part.lower().replace("ṃ", "ṁ"))
        except: pass

    print("Fetching headwords and translations...")
    query = """
    SELECT h.*, r.ru_meaning, r.ru_meaning_raw, r.ru_meaning_lit
    FROM dpd_headwords h
    LEFT JOIN russian r ON h.id = r.id
    """
    cursor.execute(query)
    headwords = cursor.fetchall()

    i2h_dict, ebts_en_dict, ebts_ru_dict, matched_headwords = {}, {}, {}, set()
    
    print("Processing headwords...")
    for h in headwords:
        lemma_1 = h["lemma_1"]
        if "(gram)" in (h["meaning_1"] or ""): continue
        infl_all = (h["inflections"] or "") + "," + (h["inflections_api_ca_eva_iti"] or "")
        infl_list = [i.strip().lower().replace("ṃ", "ṁ") for i in infl_all.split(",") if i.strip()]
        
        found = False
        for infl in infl_list:
            if infl in word_set or infl in deconstructed_splits_set:
                i2h_dict.setdefault(infl, []).append(lemma_1)
                found = True
        
        if found:
            matched_headwords.add(lemma_1)
            meaning_en = h["meaning_1"] or h["meaning_2"] or ""
            ebts_en_dict[lemma_1] = f"{h['pos']}. <b>{meaning_en}</b>"
            if h["meaning_lit"]:
                ebts_en_dict[lemma_1] = ebts_en_dict[lemma_1].replace("</b>", f"; lit. {h['meaning_lit']}</b>")
            if h["construction"]:
                ebts_en_dict[lemma_1] += f" [{h['construction'].splitlines()[0]}]"
            
            # RU
            pos_ru = translate_pos(h['pos'])
            pos_ru_str = pos_ru if pos_ru.endswith('.') else pos_ru + "."
            if h["ru_meaning"]:
                ru_text = f"<b>{h['ru_meaning']}</b>"
                if h["ru_meaning_lit"]: ru_text += f"; досл. {h['ru_meaning_lit']}"
            elif h["ru_meaning_raw"]:
                ru_text = f"<i>[пер. ИИ]</i> {h['ru_meaning_raw']}"
            else: ru_text = meaning_en
            
            ru_full = f"{pos_ru_str} {ru_text}"
            if h["construction"]: ru_full += f" [{h['construction'].splitlines()[0]}]"
            ebts_ru_dict[lemma_1] = ru_full

    print("Sorting data...")
    for infl in i2h_dict: i2h_dict[infl] = sorted(list(set(i2h_dict[infl])), key=pali_sort_key)
    ebts_en_dict = dict(sorted(ebts_en_dict.items(), key=lambda x: pali_sort_key(x[0])))
    ebts_ru_dict = dict(sorted(ebts_ru_dict.items(), key=lambda x: pali_sort_key(x[0])))

    print("Processing deconstructor...")
    deconstructor_dict = {}
    cursor.execute("SELECT lookup_key, deconstructor, spelling FROM lookup WHERE deconstructor != \"\" OR spelling != \"\"")
    for row in cursor.fetchall():
        key = row["lookup_key"].lower().replace("ṃ", "ṁ")
        if key in word_set and key not in matched_headwords:
            content = []
            if row["deconstructor"]:
                try: content.extend(json.loads(row["deconstructor"]))
                except: pass
            if row["spelling"]:
                try:
                    sp = json.loads(row["spelling"])
                    for s in sp: content.append(f"incorrect spelling of <i>{s}</i>")
                except: pass
            if content:
                deconstructor_dict[key] = "<br>".join(content)
    
    deconstructor_dict = dict(sorted(deconstructor_dict.items(), key=lambda x: pali_sort_key(x[0])))

    print(f"Saving to {OUTPUT_DIR}...")
    os.makedirs(os.path.join(OUTPUT_DIR, "ru"), exist_ok=True)
    def save_js(filename, var_name, data):
        with open(os.path.join(OUTPUT_DIR, filename), "w", encoding="utf-8") as f:
            f.write(f"var {var_name} = " + json.dumps(data, ensure_ascii=False, indent=2) + ";")

    save_js("dpd_i2h.js", "dpd_i2h", i2h_dict)
    save_js("dpd_ebts.js", "dpd_ebts", ebts_en_dict)
    save_js("ru/dpd_ebts.js", "dpd_ebts", ebts_ru_dict)
    save_js("dpd_deconstructor.js", "dpd_deconstructor", deconstructor_dict)
    conn.close()
    print("Done!")

if __name__ == "__main__":
    generate()
