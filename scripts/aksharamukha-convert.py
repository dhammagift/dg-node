#!/usr/bin/env python3
"""Batch Pali script conversion for dg-fastify.js (Aksharamukha, native Python).

stdin:  {"src": "IAST", "dst": "Devanagari", "texts": ["...", "..."]}
stdout: ["...", "..."]  (same order and length)

One process per HTTP request: the server queues every text a request needs and sends them here in
one go. The whole batch is converted in ONE call (texts joined by newline, split back) — measured on
DN 16, 1664 segments: 0.3s joined vs 4.5s one call per segment, identical output. A batch where any
text itself contains a newline falls back to one call per text so the split stays exact.
"""
import json
import sys
import warnings

warnings.filterwarnings('ignore')  # aksharamukha's regexes emit SyntaxWarnings on import

from aksharamukha import GeneralMap, transliterate  # noqa: E402

# Every script name Aksharamukha knows, to find a script's Pali variant (Lao -> LaoPali).
KNOWN = {n for v in vars(GeneralMap).values() if isinstance(v, (list, tuple)) for n in v if isinstance(n, str)}


def detect_pali(text):
    """autodetect, but a Pali variant of the detected script wins: the site is Pali, and a short word
    cannot tell the two apart (ນາປຣໍ detects as modern Lao -> "nāprṁ"; LaoPali gives "nāparaṁ")."""
    detected = transliterate.auto_detect(text)
    return detected + 'Pali' if detected + 'Pali' in KNOWN else detected


def main():
    req = json.load(sys.stdin)
    src, dst, texts = req['src'], req['dst'], req['texts']
    if src.lower() == 'autodetect':
        json.dump([transliterate.process(detect_pali(t), dst, t) for t in texts], sys.stdout, ensure_ascii=False)
        return
    if any('\n' in t for t in texts):
        out = [transliterate.process(src, dst, t) for t in texts]
    else:
        out = transliterate.process(src, dst, '\n'.join(texts)).split('\n')
        if len(out) != len(texts):  # a converter that changed the line count: do it the slow, exact way
            out = [transliterate.process(src, dst, t) for t in texts]
    json.dump(out, sys.stdout, ensure_ascii=False)


if __name__ == '__main__':
    main()
