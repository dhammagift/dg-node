#!/usr/bin/env python3
"""Adds the Dhamma.Gift glossary to the reader's standalone DPD files, as an extra entry - never in place of DPD's.

    scripts/dpd-dg-glossary.py <dir with dpd_i2h.js, dpd_ebts.js, ru/dpd_ebts.js> <dg-docs src/data/glossary.json (or the built glossary index.html)>

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


def load_glossary(path):
    """[{name, ru, en, link}] from dg-docs' src/data/glossary.json (synced daily from the Google Sheet), or from the built
    glossary page's JSON-LD (older input)."""
    text = Path(path).read_text(encoding='utf-8')
    if path.endswith('.json'):
        data = json.loads(text)
        out = []
        for t in data.get('terms', []):
            canon = t.get('canon') or {}
            # every place the term is defined (canon.where), the main link first; all of them (owner 2026-11-13: at most 4
            # hid most of dukkha's 9; the most any term has is 12, a line and a half)
            where = ['/' + w.lstrip('/') for w in (canon.get('where') or []) if w]
            link = canon.get('link') or ''
            links = ([link] if link else []) + [w for w in where if w != link]
            # a special definition (the sheet's «Definition type»; before dg-docs read that column, the note's own start)
            kind = t.get('kind') or ('special: ' + ('assutavā puthujjano bhāsati' if 'обыватель' in t['dgNote'][:60] else 'ariyassa vinaye')
                                     if (t.get('dgNote') or '').startswith('Особое определение') else '')
            out.append({'name': t.get('pali', ''), 'ru': t.get('ru', ''), 'en': t.get('en', '') or t.get('ru', ''), 'links': links, 'kind': kind,
                        'metaphors': t.get('metaphors') or []})
        return out
    for m in LD_RE.finditer(text):
        try:
            data = json.loads(m.group(1))
        except ValueError:
            continue
        if data.get('@type') == 'DefinedTermSet':
            out = []
            for t in data.get('hasDefinedTerm', []):
                alt = t.get('alternateName') or []
                url = ((t.get('subjectOf') or {}).get('url') or '')
                mm = re.match(r'^https?://[^/]+(/[^?#\s]+)', url)
                out.append({'name': t.get('name', ''), 'ru': alt[0] if alt else '', 'en': alt[1] if len(alt) > 1 else (alt[0] if alt else ''),
                            'links': [mm.group(1)] if mm else []})
            return out
    sys.exit(f'{path}: neither glossary.json nor a page with a DefinedTermSet')


# Owner 2026-11-13: the canon's special definitions (ariyassa vinaye) go in like the others, but marked, so nobody takes
# them for the word's ordinary sense. The mark is the Pali phrase itself, as on the dg-docs glossary badge.
SPECIAL = ('ariyassa vinaye', 'assutavā puthujjano bhāsati')


def entry(meaning, links, lang, kind=''):
    out = f'<b>{meaning}</b>' if meaning else ''
    mark = kind.removeprefix('special: ').strip()
    special = mark in SPECIAL
    if special:
        # «ariyassa vinaye:» already says the links are where the canon redefines the word: no «опред.» (owner 2026-11-13)
        out += f' <i class="dg-special">{mark}</i>:'
    shown, seen = [], set()
    for seg in links:
        sutta = seg.lstrip('/').split(':')[0]   # the text only (mn9); the segment stays in the address
        if sutta in seen:
            continue                            # one link per text: its first place
        seen.add(sutta)
        # class dg-seg: the reader keeps it a link (paliLookup.js linkify) and opens it in the reader itself
        shown.append(f'<a class="dg-seg" href="{seg}" target="_top">{sutta}</a>')
    if shown:
        # "def." / "опред." in italics says what the links are: the suttas where the term is defined (owner 2026-11-05)
        out += (' ' if special else f' <i class="dg-def">{"опред." if lang == "ru" else "def."}</i> ') + ', '.join(shown)
    return out


def seg_links(refs):
    shown, seen = [], set()
    for seg in refs:
        seg = '/' + seg.lstrip('/')
        sutta = seg.lstrip('/').split(':')[0]
        if sutta not in seen:
            seen.add(sutta)
            shown.append(f'<a class="dg-seg" href="{seg}" target="_top">{sutta}</a>')
    return ', '.join(shown)


# Owner 2026-11-21: a word's metaphors (adhivacana, later seyyathāpi/evameva, yathā, no formula) as one collapsed line under
# its definition: the kind in italics, the image, the suttas; open shows them all.
def metaphors_html(items, lang):
    if not items:
        return ''
    label = 'Метафоры' if lang == 'ru' else 'Metaphors'
    preview = ', '.join(m['text'] for m in items)
    rows = ''.join(f'<div><i class="dg-meta-kind">{m["kind"]}</i> <b>{m["text"]}</b> {seg_links(m.get("refs") or [])}</div>' for m in items)
    return (f'<details class="dg-meta"><summary><i>{label}</i> <span class="dg-meta-n">{len(items)}</span> '
            f'<span class="dg-meta-preview">{preview}</span></summary>{rows}</details>')


def image_line(kind, meaning, gloss, refs):
    # on the image's own entry: «adhivacana → kāya тело mn23» (the image stands for that meaning)
    return f'<div class="dg-meta-of"><i class="dg-meta-kind">{kind}</i> → <b>{meaning}</b> {gloss} {seg_links(refs)}</div>'


def main():
    if len(sys.argv) != 3:
        sys.exit(__doc__)
    base = Path(sys.argv[1])
    terms = load_glossary(sys.argv[2])

    n_i2h, i2h = read_js(base / 'dpd_i2h.js')
    n_en, ebts_en = read_js(base / 'dpd_ebts.js')
    n_ru, ebts_ru = read_js(base / 'ru' / 'dpd_ebts.js')

    # A run on files that already carry the glossary starts from DPD alone: a term removed or renamed in the sheet must
    # not stay behind
    for d in (ebts_en, ebts_ru):
        for k in [k for k in d if k.endswith(' (DG)')]:
            del d[k]
    for form in list(i2h):
        kept = [h for h in i2h[form] if not h.endswith(' (DG)')]
        if kept:
            i2h[form] = kept
        else:
            del i2h[form]

    by_base = {}   # lemma base -> the forms (i2h keys) whose headwords include it
    for form, headwords in i2h.items():
        for hw in headwords:
            by_base.setdefault(lemma_base(hw), set()).add(form)

    # the forms are written the way the file writes them (DPD's export uses ṃ; the glossary may use either)
    nig = 'ṃ' if any('ṃ' in k for k in list(i2h)[:5000]) else 'ṁ'

    added = linked_forms = own_forms = with_link = images = 0
    # image -> its meanings, for the image's own entry (a click on vammika shows «adhivacana → kāya»)
    of_image = {}
    for t in terms:
        for m in t.get('metaphors') or []:
            of_image.setdefault(m['text'], {'forms': set(), 'lines': []})
            of_image[m['text']]['forms'].update(m.get('forms') or [])
            of_image[m['text']]['lines'].append((m['kind'], t['name'], (t.get('ru') or '').split(',')[0].strip(),
                                                 (t.get('en') or '').split(',')[0].strip(), m.get('refs') or []))
    names = {(t.get('name') or '').strip() for t in terms}
    for t in terms:
        name = (t.get('name') or '').strip()
        if not name:
            continue
        ru, en = t.get('ru') or '', t.get('en') or t.get('ru') or ''
        links = [l.strip() for l in (t.get('links') or []) if l and l.strip()]
        key = f'{name} (DG)'
        own = of_image.get(name, {}).get('lines', [])
        ebts_en[key] = entry(en, links, 'en', t.get('kind') or '') + metaphors_html(t.get('metaphors'), 'en') + ''.join(image_line(k, mn, ge, r) for k, mn, gr, ge, r in own)
        ebts_ru[key] = entry(ru, links, 'ru', t.get('kind') or '') + metaphors_html(t.get('metaphors'), 'ru') + ''.join(image_line(k, mn, gr, r) for k, mn, gr, ge, r in own)
        added += 1
        with_link += bool(links)
        forms = by_base.get(norm(name), set())
        if not forms:
            forms = {norm(name).replace('ṁ', nig)}
            own_forms += 1
        for form in forms:
            lst = i2h.setdefault(form, [])
            if key not in lst:
                lst.insert(0, key)
                linked_forms += 1

    # an image that is not a glossary term of its own gets an entry of its own, first for its forms
    for img, d in of_image.items():
        if img in names or not d['forms']:
            continue
        key = f'{img} (DG)'
        ebts_en[key] = ''.join(image_line(k, mn, ge, r) for k, mn, gr, ge, r in d['lines'])
        ebts_ru[key] = ''.join(image_line(k, mn, gr, r) for k, mn, gr, ge, r in d['lines'])
        images += 1
        for form in {f.replace('ṁ', nig) for f in d['forms']}:
            lst = i2h.setdefault(form, [])
            if key not in lst:
                lst.insert(0, key)
    write_js(base / 'dpd_i2h.js', n_i2h, i2h)
    write_js(base / 'dpd_ebts.js', n_en, ebts_en)
    write_js(base / 'ru' / 'dpd_ebts.js', n_ru, ebts_ru)
    print(f'DG glossary: {added} terms ({with_link} with a segment link), first in {linked_forms} forms, '
          f'{own_forms} terms without a DPD headword got their own form; {images} metaphor images got an entry of their own')


if __name__ == '__main__':
    main()
