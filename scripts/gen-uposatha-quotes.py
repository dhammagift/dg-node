#!/usr/bin/env python3
# Builds public/overrides/js/uposatha-quotes.json (the slideshow on /uposatha-calendar) from the Bilara data:
# root Pali (ms), Russian and English translations of the chosen segments. Run again after changing SLIDES.
import glob, json, os
BASE = '/var/www/html/suttacentral.net/sc-data/sc_bilara_data'
# id, days it is exclusive to (None = general pool), sutta file dir, sutta id, segments, russian translator, label en/ru
SLIDES = [
    ('an3.37-8',  [8],  'an/an3',  'an3.37', ['1.1', '1.2'],  'sv', 'AN 3.37', 'АН 3.37'),
    ('an3.37-14', [14], 'an/an3',  'an3.37', ['1.3', '1.4'],  'sv', 'AN 3.37', 'АН 3.37'),
    ('an3.37-verse', [8, 14, 15], 'an/an3', 'an3.37', ['5.1', '5.2', '5.3', '5.4', '5.5', '5.6'], 'sv', 'AN 3.37', 'АН 3.37'),
    ('mn146-14',  [14], 'mn',      'mn146',  ['15.2', '15.3'], 'sv', 'MN 146', 'МН 146'),
    ('an3.37-15', [15], 'an/an3',  'an3.37', ['1.5', '1.6'],  'sv', 'AN 3.37', 'АН 3.37'),
    ('mn146-15',  [15], 'mn',      'mn146',  ['27.2', '27.3'], 'sv', 'MN 146', 'МН 146'),
    ('mn118-15', [15], 'mn',      'mn118',  ['3.1'],         'sv', 'MN 118', 'МН 118'),
    ('kd2-gather', [8, 14, 15], 'vinaya', 'pli-tv-kd2', ['1.1.2', '1.4.4'], 'sv', 'Vin Mv 2.1', 'Вин Мв 2.1'),
    ('kd2-teach',  [8, 14, 15], 'vinaya', 'pli-tv-kd2', ['2.1.11'], 'sv', 'Vin Mv 2.2', 'Вин Мв 2.2'),
    ('kd2-once',   [14, 15], 'vinaya', 'pli-tv-kd2', ['4.2.5', '4.2.7'], 'sv', 'Vin Mv 2.4', 'Вин Мв 2.4'),
    ('kd2-differ', None, 'vinaya', 'pli-tv-kd2', ['34.1.1', '34.2.1'], 'sv', 'Vin Mv 2.34', 'Вин Мв 2.34'),
    ('kd2-two',   [14, 15], 'vinaya', 'pli-tv-kd2', ['14.1.4'], 'sv', 'Vin Mv 2', 'Вин Мв 2'),
    ('bu-pm-15',  [15], 'vinaya', 'pli-tv-bu-pm', ['5.2'], 'sv', 'Bu Pm', 'Бху Пм'),
    ('an3.37-few',  None, 'an/an3', 'an3.37', ['2.3', '2.4', '2.5'], 'sv', 'AN 3.37', 'АН 3.37'),
    ('an3.37-many', None, 'an/an3', 'an3.37', ['3.3', '3.4', '3.5'], 'sv', 'AN 3.37', 'АН 3.37'),
    ('mn83',      [8, 14, 15], 'mn',      'mn83',   ['3.3'],         'sv', 'MN 83', 'МН 83'),
    ('sn20.4',    None, 'sn/sn20', 'sn20.4',  ['1.2'],         'sv', 'SN 20.4', 'СН 20.4'),
    ('mn53-night', None, 'mn',     'mn53',   ['10.3', '10.4', '10.5'], 'sv', 'MN 53', 'МН 53'),
    ('ud1.1-watch', None, 'kn/ud/vagga1', 'ud1.1', ['1.4'],  'sv', 'Ud 1.1', 'Уд 1.1'),
    ('an3.70-three', None, 'an/an3', 'an3.70', ['2.1', '2.2', '2.3'], 'sv', 'AN 3.70', 'АН 3.70'),
    ('an3.70-noble', None, 'an/an3', 'an3.70', ['4.1', '4.2', '4.3'], 'sv', 'AN 3.70', 'АН 3.70'),
    ('an3.70-vow',   None, 'an/an3', 'an3.70', ['19.1', '19.2', '19.3', '19.4'], 'sv', 'AN 3.70', 'АН 3.70'),
    ('snp2.14-factors', [8, 14, 15], 'kn/snp', 'snp2.14', ['26.1', '26.2', '26.3', '26.4', '27.1', '27.2', '27.3', '27.4'], 'sv', 'Snp 2.14', 'Снп 2.14'),
    ('snp2.14-days',    [8, 14, 15], 'kn/snp', 'snp2.14', ['28.1', '28.2', '28.3', '28.4'], 'sv', 'Snp 2.14', 'Снп 2.14'),
    ('snp2.14-dawn',    [8, 14, 15], 'kn/snp', 'snp2.14', ['29.1', '29.2', '29.3', '29.4'], 'sv', 'Snp 2.14', 'Снп 2.14'),
    ('an8.41',    None, 'an/an8', 'an8.41', ['2.1', '2.2', '2.3', '2.5'], 'sv', 'AN 8.41', 'АН 8.41'),
    ('an10.46',   None, 'an/an10', 'an10.46', ['1.5'],        'o',  'AN 10.46', 'АН 10.46'),
]
# lines that are about an Uposatha day but do not teach it: they go to the random pool
# verses keep their line breaks
POEMS = {'an3.37-verse', 'snp2.14-factors', 'snp2.14-days', 'snp2.14-dawn'}
RANDOM_IDS = {'mn118-15', 'kd2-two', 'bu-pm-15'}
def load(p):
    return json.load(open(os.path.join(BASE, p)))
OFFLINE = '/var/www/offline-data/dhammagift/translation'
def titles(sutta, pli, ru, en):
    # the sutta's name in Pali and in the translations (segment 0.2 or 0.3 holds it)
    def one(d):
        for k in (f'{sutta}:0.3', f'{sutta}:0.2'):
            v = d.get(k, '').strip()
            if v and not v[0].isdigit(): return v
        return d.get(f'{sutta}:0.3', '').strip()
    return {'pli': one(pli), 'ru': one(ru), 'en': one(en)}
def find(kind, sutta, lang, prefer):
    # The project's own translation first (offline-data: the best one, then the second one), then SuttaCentral's;
    # within a folder the preferred translator first.
    for root in ([f'{OFFLINE}/{lang}', f'{OFFLINE}/{lang}_other'] if lang == 'ru' else []) + [f'{BASE}/translation/{lang}']:
        files = sorted(glob.glob(f'{root}/**/{sutta}_translation-{lang}-*.json', recursive=True))
        if files:
            files.sort(key=lambda f: 0 if f.endswith(f'-{prefer}.json') else 1)
            return json.load(open(files[0]))
    return {}
out = []
for sid, days, nik, sutta, segs, ru_tr, en_label, ru_label in SLIDES:
    pli = json.load(open(glob.glob(f'{BASE}/root/pli/ms/**/{sutta}_root-pli-ms.json', recursive=True)[0]))
    ru = find('', sutta, 'ru', ru_tr)
    en = find('', sutta, 'en', 'sujato')
    key = lambda s: f'{sutta}:{s}'
    sep = '\n' if sid in POEMS else ' '
    join = lambda d: sep.join(d[key(s)].strip() for s in segs if key(s) in d).replace('<j>', '')
    # "special" slides belong to the 8th / 14th / 15th day; "general" ones say that the Uposatha is to be kept
    if sid in RANDOM_IDS: days = None
    out.append({'id': sid, 'kind': 'random' if sid in RANDOM_IDS else 'special' if days else 'general', 'days': days, 'title': titles(sutta, pli, ru, en), 'ref': key(segs[0]), 'cite': {'en': en_label, 'ru': ru_label}, 'pli': join(pli), 'ru': join(ru), 'en': join(en).replace(' Then—', '')})
# "random": every place in the four Nikayas and the Khuddaka books where the Uposatha is named (any form of "uposath"),
# with both translations - like the hits of a search for "uposath"; all of them, not one per sutta.
import re
UPO = re.compile(r'uposath', re.I)
used = {o['ref'] for o in out}
for f in sorted(glob.glob(f'{BASE}/root/pli/ms/sutta/**/*_root-pli-ms.json', recursive=True)):
    sutta = os.path.basename(f).split('_')[0]
    if not re.match(r'(dn|mn|sn|an|snp|ud|iti|dhp|thag|thig)', sutta): continue
    pli = json.load(open(f))
    hits = [k for k, v in pli.items() if UPO.search(v) and k not in used and ':0.' not in k]
    if not hits: continue
    ru, en = find('', sutta, 'ru', 'o'), find('', sutta, 'en', 'sujato')
    ttl = titles(sutta, pli, ru, en)
    for k in hits:
        if k in en and len(en[k].strip()) >= 30 and len(pli[k].strip()) >= 30:
            n = sutta
            out.append({'id': k, 'kind': 'random', 'days': None, 'title': ttl, 'ref': k, 'cite': {'en': n, 'ru': n}, 'pli': pli[k].strip().replace('<j>', ''), 'ru': ru.get(k, '').strip().replace('<j>', ''), 'en': en[k].strip().replace('<j>', '')})
path = os.path.join(os.path.dirname(__file__), '..', 'public', 'overrides', 'js', 'uposatha-quotes.json')
json.dump(out, open(path, 'w'), ensure_ascii=False, indent=1)
print(len(out), 'slides ->', os.path.normpath(path))
