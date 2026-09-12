#!/usr/bin/env python3
"""Нарезка Lato на подмножества по диапазонам символов (unicode-range).

Зачем: исходные lato-*.woff2 — по ~125 КБ каждый, и в КАЖДОМ лежит сразу всё: латиница,
расширенная латиница, вся пали-диакритика и кириллица. Браузер качал файл целиком, даже если
половина диапазонов на странице не встречается: на главной это 248 КБ (начертания 400 и 600) из
816 КБ всей страницы — самая тяжёлая позиция. С unicode-range он берёт только те куски, символы
из которых реально есть на странице.

Три подмножества на начертание:
  latin      — базовая латиница, типографская пунктуация И пали-диакритика (ā ī ū ṁ ṅ ṭ ḍ ṇ ḷ …).
               Пали на этом сайте есть практически на любой странице, поэтому его диакритика
               лежит ЗДЕСЬ, а не в latin-ext, как её кладёт Google Fonts: иначе второй файл
               всё равно грузился бы всегда и смысл разделения пропал бы.
  latin-ext  — весь остальной расширенный латинский хвост (польский, вьетнамский, чешский и
               прочее, что встречается в именах переводчиков и переводах на другие языки).
               Грузится, только если такой символ на странице реально есть.
  cyrillic   — кириллица русского алфавита: интерфейс и русские переводы.
  cyrillic-ext — остальная кириллица (украинская, церковнославянская и т.п.). Отдельно, потому
               что полный блок кириллицы стоит 32 КБ против 13 КБ у одного русского — платить
               за него на каждой русской странице не за что.

Диапазоны считаются ИЗ САМОГО ШРИФТА: всё, что есть в cmap и не попало в latin/cyrillic,
уезжает в latin-ext. Так покрытие остаётся полным — ни один символ не может оказаться вне всех
трёх файлов и молча отрисоваться системным шрифтом.

Запускать только при смене самих шрифтов (редко); результат коммитится.
Требует: pip install fonttools brotli

    python3 scripts/build-fonts.py          # собрать файлы
    python3 scripts/build-fonts.py --css    # ещё и напечатать блок @font-face для home.css
"""
import subprocess
import sys
from pathlib import Path

from fontTools.ttLib import TTFont

ROOT = Path(__file__).resolve().parent.parent
FONT_DIR = ROOT / "public" / "overrides" / "fonts"
FACES = [
    ("lato-400", "normal", 400),
    ("lato-400-italic", "italic", 400),
    ("lato-600", "normal", 600),
    ("lato-700", "normal", 700),
]

# Пали-диакритика, ради которой latin-ext не нужен на обычной странице.
PALI = [
    0x0100, 0x0101, 0x012A, 0x012B, 0x016A, 0x016B,          # Ā ā Ī ī Ū ū
    0x1E0C, 0x1E0D, 0x1E36, 0x1E37, 0x1E40, 0x1E41,          # Ḍ ḍ Ḷ ḷ Ṁ ṁ
    0x1E42, 0x1E43, 0x1E44, 0x1E45, 0x1E46, 0x1E47,          # Ṃ ṃ Ṅ ṅ Ṇ ṇ
    0x1E62, 0x1E63, 0x1E6C, 0x1E6D,                          # Ṣ ṣ Ṭ ṭ
    0x015A, 0x015B, 0x1E5A, 0x1E5B, 0x0113, 0x014D, 0x0144,  # Ś ś Ṛ ṛ ē ō ń
]
LATIN_EXTRA = [0x2074, 0x20AC, 0x2113, 0x2122, 0x2191, 0x2193, 0x2212, 0x2215, 0xFEFF, 0xFFFD]
CYRILLIC_EXTRA = [0x0301, 0x2116]


def in_latin(cp):
    return cp <= 0x00FF or 0x2000 <= cp <= 0x206F or cp in PALI or cp in LATIN_EXTRA


def in_cyrillic(cp):
    return 0x0400 <= cp <= 0x045F or cp in (0x0490, 0x0491, 0x04B0, 0x04B1) or cp in CYRILLIC_EXTRA


def in_cyrillic_ext(cp):
    return 0x0460 <= cp <= 0x052F


def to_ranges(codepoints):
    """[1,2,3,7] -> 'U+1-3,U+7' — компактная запись для pyftsubset и для CSS."""
    out, start, prev = [], None, None
    for cp in sorted(codepoints):
        if start is None:
            start = prev = cp
        elif cp == prev + 1:
            prev = cp
        else:
            out.append((start, prev))
            start = prev = cp
    if start is not None:
        out.append((start, prev))
    return ",".join(f"U+{a:04X}" if a == b else f"U+{a:04X}-{b:04X}" for a, b in out)


def main():
    cmap = set(TTFont(FONT_DIR / "lato-400.woff2").getBestCmap().keys())
    groups = {
        "latin": sorted(cp for cp in cmap if in_latin(cp)),
        "cyrillic": sorted(cp for cp in cmap if in_cyrillic(cp)),
        "cyrillic-ext": sorted(cp for cp in cmap if in_cyrillic_ext(cp)),
    }
    claimed = set().union(*(set(v) for v in groups.values()))
    # Остаток (расширенная латиница, стрелки, знаки) — в latin-ext, чтобы ни один символ шрифта
    # не остался вне всех файлов и не отрисовался системным шрифтом.
    groups["latin-ext"] = sorted(cmap - claimed)

    css = []
    for face, style, weight in FACES:
        src = FONT_DIR / f"{face}.woff2"
        for name in ("latin", "latin-ext", "cyrillic", "cyrillic-ext"):
            ranges = to_ranges(groups[name])
            out = FONT_DIR / f"{face}-{name}.woff2"
            subprocess.run(
                ["pyftsubset", str(src), f"--unicodes={ranges}", "--flavor=woff2",
                 f"--output-file={out}"],
                check=True,
            )
            print(f"{out.name:<32} {out.stat().st_size:>7} bytes", file=sys.stderr)
            css.append(
                f'@font-face {{ font-family: "Lato"; font-style: {style}; font-weight: {weight}; '
                f'font-display: swap; src: url("/assets/fonts/{out.name}") format("woff2"); '
                f"unicode-range: {ranges}; }}"
            )
    if "--css" in sys.argv:
        print("\n".join(css))


if __name__ == "__main__":
    main()
