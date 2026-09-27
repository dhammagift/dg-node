#!/usr/bin/env python3
# Builds public/overrides/js/uposatha-parts-pool.json: what a person did in the morning, at midday, in the evening, from the suttas
# (the pool the page "Structure of the night and day" draws from: one text per part on each opening).
# Only a person's own action counts - not the similes (spears at noon, dishes given three times a day, the sun at midday).
# Sources: the root Pali (ms) and the translations of the Bilara data, like gen-uposatha-quotes.py.
import glob, json, os, re
BASE = '/var/www/html/suttacentral.net/sc-data/sc_bilara_data'
OFFLINE = '/var/www/offline-data/dhammagift/translation'
EXCLUDE = {'mn79', 'mn80', 'mn129', 'sn12.63', 'sn56.35', 'an3.19', 'an3.129', 'sn20.4', 'an5.76', 'sn37.4'}  # mn79 is among the key suttas; the rest are similes
SIZE = {'morning': 36, 'midday': 24, 'evening': 36}
# the sets that say it for all the parts at once
SETS = [
    ('sn28.1', 'sn/sn28', 'o', {'morning': ['1.2'], 'midday': ['1.3', '1.4'], 'evening': ['2.1']}),
    ('mn32', 'mn', 'sv', {'morning': ['9.6', '9.7', '9.8', '9.9'], 'midday': ['9.6', '9.7', '9.8', '9.9'], 'evening': ['9.6', '9.7', '9.8', '9.9']}),
]
RULES = {  # part: (the words a segment must have, a segment that follows it is joined when it has)
    'morning': (re.compile(r'pubbaṇhasamayaṁ (nivāsetvā|pārupitvā)'), None),
    'midday': (re.compile(r'divāvihār'), re.compile(r'nisīdi|tenupasaṅkami|gato')),
    'evening': (re.compile(r'sāyanhasamayaṁ paṭisallānā vuṭṭhit'), None),
}
SKIP = {('midday', 'sn9.1'), ('midday', 'an9.3'), ('evening', 'sn22.127'), ('evening', 'an5.166')}  # read by hand: not the person's action of that time
BAD = re.compile(r'haneyy|sattisata|okkhāsata|pāpaṇiko|padīpo|suppati|supina', re.I)
def find(sutta, lang, prefer):
    roots = ([(f'{OFFLINE}/en_other', 'thanissaro'), (f'{OFFLINE}/en', prefer), (f'{BASE}/translation/en', 'sujato')] if lang == 'en'
             else [(f'{OFFLINE}/ru', prefer), (f'{OFFLINE}/ru_other', prefer), (f'{BASE}/translation/ru', prefer)])
    for root, who in roots:
        files = sorted(glob.glob(f'{root}/**/{sutta}_translation-{lang}-*.json', recursive=True))
        if lang == 'en' and root.endswith('en_other'): files = [f for f in files if f.endswith('-thanissaro.json')]
        if files:
            files.sort(key=lambda f: 0 if f.endswith(f'-{who}.json') else 1)
            return json.load(open(files[0]))
    return {}
def title(sutta, d):
    for k in (f'{sutta}:0.3', f'{sutta}:0.2'):
        v = d.get(k, '').strip()
        if v and not v[0].isdigit(): return v
    return d.get(f'{sutta}:0.3', '').strip()
def label(sutta):
    if sutta.startswith('pli-tv-kd'): return 'Vin Mv ' + sutta[9:]
    m = re.match(r'([a-z]+)(.*)', sutta)
    return {'mn': 'MN', 'sn': 'SN', 'an': 'AN', 'dn': 'DN', 'ud': 'Ud', 'iti': 'Iti'}.get(m.group(1), m.group(1).upper()) + ' ' + m.group(2)
def ru_label(sutta):
    if sutta.startswith('pli-tv-kd'): return 'Вин Мв ' + sutta[9:]
    m = re.match(r'([a-z]+)(.*)', sutta)
    return {'mn': 'МН', 'sn': 'СН', 'an': 'АН', 'dn': 'ДН', 'ud': 'Уд', 'iti': 'Ит'}.get(m.group(1), m.group(1).upper()) + ' ' + m.group(2)
def entry(part, sutta, segs, pli, ru, en):
    key = lambda s: f'{sutta}:{s}'
    join = lambda d: re.sub(r'\s+', ' ', ' '.join(d[key(s)].strip() for s in segs if key(s) in d and d[key(s)].strip()).replace('<j>', '')).strip()
    e = {'id': f'{part}-{sutta}-{segs[0]}', 'part': part, 'ref': key(segs[0]), 'cite': {'en': label(sutta), 'ru': ru_label(sutta)},
         'title': {'pli': title(sutta, pli), 'ru': title(sutta, ru), 'en': title(sutta, en)}, 'pli': join(pli), 'en': join(en), 'ru': join(ru)}
    return e if len(e['pli']) >= 30 and len(e['en']) >= 40 else None
pool = {p: [] for p in SIZE}
for sutta, nik, ru_tr, parts in SETS:
    pli = json.load(open(glob.glob(f'{BASE}/root/pli/ms/**/{sutta}_root-pli-ms.json', recursive=True)[0]))
    ru, en = find(sutta, 'ru', ru_tr), find(sutta, 'en', 'sujato')
    for part, segs in parts.items():
        e = entry(part, sutta, segs, pli, ru, en)
        if e: pool[part].append(e)
found = {p: [] for p in SIZE}
files = sorted(glob.glob(f'{BASE}/root/pli/ms/sutta/**/*_root-pli-ms.json', recursive=True))
def order(f):
    s = os.path.basename(f).split('_')[0]; m = re.match(r'([a-z]+)(\d+)(?:\.(\d+))?', s)
    return ({'dn': 0, 'mn': 1, 'sn': 2, 'an': 3}.get(m.group(1), 4), int(m.group(2)), int(m.group(3) or 0)) if m else (9, 0, 0)
for f in sorted(files, key=order):
    sutta = os.path.basename(f).split('_')[0]
    if not re.match(r'(dn|mn|sn|an|ud|iti)\d', sutta) or sutta in EXCLUDE or sutta in {s[0] for s in SETS}: continue
    pli = json.load(open(f)); keys = list(pli.keys())
    for part, (pat, nxt) in RULES.items():
        for i, k in enumerate(keys):
            v = pli[k]
            if not pat.search(v) or BAD.search(v) or ':0.' in k or (part, sutta) in SKIP: continue
            segs = [k.split(':', 1)[1]]
            if part == 'midday' and i and 'piṇḍa' in pli[keys[i - 1]]: segs.insert(0, keys[i - 1].split(':', 1)[1])
            found[part].append((sutta, segs)); break   # one place per sutta
for part, items in found.items():
    n = SIZE[part] - len(pool[part]); step = max(1, len(items) / n)
    chosen = [items[int(i * step)] for i in range(n)] if len(items) > n else items
    for sutta, segs in chosen:
        pli = json.load(open(glob.glob(f'{BASE}/root/pli/ms/**/{sutta}_root-pli-ms.json', recursive=True)[0]))
        e = entry(part, sutta, segs, pli, find(sutta, 'ru', 'o'), find(sutta, 'en', 'sujato'))
        if e: pool[part].append(e)
# The night: a sutta that gives what is done in all three watches (one of them is drawn for the page on every opening, all three rows from it).
# (id, russian translator, [[(sutta, [segments]) of the first watch], [... of the middle], [... of the last]])
NIGHT = [
    ('mn53', 'sv', [[('mn53', ['10.3'])], [('mn53', ['10.4'])], [('mn53', ['10.5'])]]),
    ('mn39', 'sv', [[('mn39', ['10.3'])], [('mn39', ['10.4'])], [('mn39', ['10.5'])]]),
    ('an4.37', 'sv', [[('an4.37', ['5.3'])], [('an4.37', ['5.4'])], [('an4.37', ['5.5'])]]),
    ('an8.9', 'sv', [[('an8.9', ['4.3'])], [('an8.9', ['4.4'])], [('an8.9', ['4.5'])]]),
    ('sn35.239', 'o', [[('sn35.239', ['4.3'])], [('sn35.239', ['4.4'])], [('sn35.239', ['4.5'])]]),
    ('sn35.120', 'o', [[('sn35.120', ['5.3'])], [('sn35.120', ['5.4'])], [('sn35.120', ['5.5'])]]),
    ('an8.11', 'sv', [[('an8.11', ['14.2', '15.1'])], [('an8.11', ['16.2', '17.1'])], [('an8.11', ['18.2', '19.1'])]]),
    ('mn4', 'sv', [[('mn4', ['27.1', '28.1'])], [('mn4', ['29.1', '30.1'])], [('mn4', ['31.1', '32.1', '33.1'])]]),
    ('ud1', 'sv', [[('ud1.1', ['1.4'])], [('ud1.2', ['1.4'])], [('ud1.3', ['1.4'])]]),
    ('kd1', 'sv', [[('pli-tv-kd1', ['1.2.1'])], [('pli-tv-kd1', ['1.4.1'])], [('pli-tv-kd1', ['1.6.1'])]]),
]
def root(sutta): return json.load(open(glob.glob(f'{BASE}/root/pli/ms/**/{sutta}_root-pli-ms.json', recursive=True)[0]))
pool['night'] = []
for sid, ru_tr, watches in NIGHT:
    ws = []
    for w in watches:
        parts = [entry('night', sutta, segs, root(sutta), find(sutta, 'ru', ru_tr), find(sutta, 'en', 'sujato')) for sutta, segs in w]
        parts = [e for e in parts if e]
        if not parts: break
        ws.append({'ref': parts[0]['ref'], 'pli': ' '.join(e['pli'] for e in parts), 'en': ' '.join(e['en'] for e in parts), 'ru': ' '.join(e['ru'] for e in parts if e['ru'])})
    if len(ws) == 3:
        first = entry('night', watches[0][0][0], watches[0][0][1], root(watches[0][0][0]), find(watches[0][0][0], 'ru', ru_tr), find(watches[0][0][0], 'en', 'sujato'))
        pool['night'].append({'id': sid, 'cite': first['cite'], 'title': first['title'], 'watches': ws})
path = os.path.join(os.path.dirname(__file__), '..', 'public', 'overrides', 'js', 'uposatha-parts-pool.json')
json.dump(pool, open(path, 'w'), ensure_ascii=False, indent=1)
print({p: len(v) for p, v in pool.items()}, os.path.getsize(path), 'bytes ->', os.path.normpath(path))
