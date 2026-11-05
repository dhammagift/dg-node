#!/usr/bin/env python3
"""Adds the Dhamma.Gift glossary to the reader's standalone DPD files, as an extra entry - never in place of DPD's.

    scripts/dpd-dg-glossary.py <dir with dpd_i2h.js, dpd_ebts.js, ru/dpd_ebts.js> <dg-docs glossary index.html>

Owner 2026-11-05: the glossary's own words and a link to the sutta segment it comes from - not the Pali quote. The link is
a plain relative address (/an10.114:2.1), so the site and the app open it, online and offline.

For every glossary term an entry "<term> (DG)" goes into both dpd_ebts files, and it is put first in dpd_i2h for every
form whose DPD headwords include the term (lemma without its number: "akusala 1" is "akusala"). A term DPD has no
headword for (a phrase, "adinnādānā veramaṇī") gets its own form. DPD's entries stay exactly as they were. The files are
written back compact (no indentation) - the same data, a smaller file to download and parse.
"""
import json
import re
import sys
from pathlib import Path

LD_RE = re.compile(r'<script[^>]*type=["\']?application/ld\+json["\']?[^>]*>(.*?)</script>', re.S)
HEAD_RE = re.compile(r'^\s*(?:var|let|const)?\s*(dpd_\w+)\s*=\s*', re.S)


def norm(s):
    return s.strip().lower().replace('ṃ', 'ṁ')


def lemma_base(headword):
    return norm(re.sub(r'\s+\d+(\.\d+)?$', '', headword))


def read_js(path):
    text = path.read_text(encoding='utf-8')
    m = HEAD_RE.match(text)
    if not m:
        sys.exit(f'{path}: no "dpd_... =" at the start')
    body = text[m.end():].rstrip().rstrip(';')
    return m.group(1), json.loads(body)


def write_js(path, name, data):
    path.write_text(f'var {name} = ' + json.dumps(data, ensure_ascii=False, separators=(',', ':')) + ';', encoding='utf-8')


def load_glossary(html_path):
    html = Path(html_path).read_text(encoding='utf-8')
    for m in LD_RE.finditer(html):
        try:
            data = json.loads(m.group(1))
        except ValueError:
            continue
        if data.get('@type') == 'DefinedTermSet':
            return data.get('hasDefinedTerm', [])
    sys.exit(f'{html_path}: no DefinedTermSet in its JSON-LD')


def segment_path(term):
    url = ((term.get('subjectOf') or {}).get('url') or '').strip()
    m = re.match(r'^https?://[^/]+(/[^?#\s]+)', url)
    return m.group(1) if m else None


def entry(meaning, seg, lang):
    out = f'<b>{meaning}</b>' if meaning else ''
    if seg:
        label = seg.lstrip('/').split(':')[0]   # the text only (mn9); the segment stays in the address (owner 2026-11-05)
        # "def." / "опред." in italics says what the link is: the sutta where the term is defined (owner 2026-11-05).
        # class dg-seg: the reader keeps it a link (paliLookup.js linkify) and opens it in the reader itself
        out += (f' <i class="dg-def">{"опред." if lang == "ru" else "def."}</i>'
                f' <a class="dg-seg" href="{seg}" target="_top">{label}</a>')
    return out


def main():
    if len(sys.argv) != 3:
        sys.exit(__doc__)
    base = Path(sys.argv[1])
    terms = load_glossary(sys.argv[2])

    n_i2h, i2h = read_js(base / 'dpd_i2h.js')
    n_en, ebts_en = read_js(base / 'dpd_ebts.js')
    n_ru, ebts_ru = read_js(base / 'ru' / 'dpd_ebts.js')

    by_base = {}   # lemma base -> the forms (i2h keys) whose headwords include it
    for form, headwords in i2h.items():
        for hw in headwords:
            by_base.setdefault(lemma_base(hw), set()).add(form)

    # the forms are written the way the file writes them (DPD's export uses ṃ; the glossary may use either)
    nig = 'ṃ' if any('ṃ' in k for k in list(i2h)[:5000]) else 'ṁ'

    added = linked_forms = own_forms = with_link = 0
    for t in terms:
        name = (t.get('name') or '').strip()
        if not name:
            continue
        alt = t.get('alternateName') or []
        ru = alt[0] if len(alt) > 0 else ''
        en = alt[1] if len(alt) > 1 else ru
        seg = segment_path(t)
        key = f'{name} (DG)'
        ebts_en[key] = entry(en, seg, 'en')
        ebts_ru[key] = entry(ru, seg, 'ru')
        added += 1
        with_link += bool(seg)
        forms = by_base.get(norm(name), set())
        if not forms:
            forms = {norm(name).replace('ṁ', nig)}
            own_forms += 1
        for form in forms:
            lst = i2h.setdefault(form, [])
            if key not in lst:
                lst.insert(0, key)
                linked_forms += 1

    write_js(base / 'dpd_i2h.js', n_i2h, i2h)
    write_js(base / 'dpd_ebts.js', n_en, ebts_en)
    write_js(base / 'ru' / 'dpd_ebts.js', n_ru, ebts_ru)
    print(f'DG glossary: {added} terms ({with_link} with a segment link), first in {linked_forms} forms, '
          f'{own_forms} terms without a DPD headword got their own form')


if __name__ == '__main__':
    main()
