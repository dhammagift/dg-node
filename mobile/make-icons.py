#!/usr/bin/env python3
# Generates the Android launcher icon set (legacy square/round + adaptive-icon foreground, all
# 5 densities) from the site's existing brand mark — no new source art needed. Python/Pillow, not
# Node, because that's what's actually available here (no ImageMagick/sharp/@capacitor/assets
# installed) — a one-off asset-generation script, not part of the app's runtime or its Node build
# pipeline (build-assets.js etc.), so the odd-one-out language doesn't cost anything.
#
# Source: pwa-bold-monocolor-512.png (the same icon dg-twa's web manifest used) — transparent
# background, single teal/orange glyph, exactly what an adaptive-icon foreground needs.
# Background color: #2E3E50, dg-twa's web manifest background_color.
#
# Re-run after changing SRC/BG_COLOR below; this only touches mobile/android/app/src/main/res/
# mipmap-*/ic_launcher*.png and values/ic_launcher_background.xml (edit that color by hand).
#
# Usage: python3 make-icons.py

from PIL import Image, ImageDraw
import os

SRC = '/var/www/html/assets/img/pwa-bold-monocolor-512.png'
OUT = os.path.join(os.path.dirname(__file__), 'android', 'app', 'src', 'main', 'res')
BG_COLOR = (46, 62, 80, 255)  # #2E3E50

# Legacy (pre-Android-8.0) square/round icons — glyph composited onto a solid background, since a
# transparent legacy icon looks inconsistent across launchers that don't know to add one.
LEGACY_DENSITIES = {'mdpi': 48, 'hdpi': 72, 'xhdpi': 96, 'xxhdpi': 144, 'xxxhdpi': 192}
# Adaptive icon foreground layer — 108dp canvas per density, glyph kept within the 66/108 safe
# zone and left transparent outside it (the OS composites this over ic_launcher_background.xml).
FOREGROUND_DENSITIES = {'mdpi': 108, 'hdpi': 162, 'xhdpi': 216, 'xxhdpi': 324, 'xxxhdpi': 432}
LEGACY_LOGO_SCALE = 0.72
SAFE_ZONE_SCALE = 66 / 108

logo = Image.open(SRC).convert('RGBA')

def composite_square(canvas_size, logo_scale):
    canvas = Image.new('RGBA', (canvas_size, canvas_size), BG_COLOR)
    logo_size = int(canvas_size * logo_scale)
    resized = logo.resize((logo_size, logo_size), Image.LANCZOS)
    offset = (canvas_size - logo_size) // 2
    canvas.paste(resized, (offset, offset), resized)
    return canvas

def circular_mask(img):
    mask = Image.new('L', img.size, 0)
    ImageDraw.Draw(mask).ellipse((0, 0, img.size[0], img.size[1]), fill=255)
    out = img.copy()
    out.putalpha(mask)
    return out

for density, px in LEGACY_DENSITIES.items():
    square = composite_square(px, LEGACY_LOGO_SCALE)
    square.save(os.path.join(OUT, f'mipmap-{density}', 'ic_launcher.png'))
    circular_mask(square).save(os.path.join(OUT, f'mipmap-{density}', 'ic_launcher_round.png'))

for density, px in FOREGROUND_DENSITIES.items():
    canvas = Image.new('RGBA', (px, px), (0, 0, 0, 0))
    logo_size = int(px * SAFE_ZONE_SCALE)
    resized = logo.resize((logo_size, logo_size), Image.LANCZOS)
    offset = (px - logo_size) // 2
    canvas.paste(resized, (offset, offset), resized)
    canvas.save(os.path.join(OUT, f'mipmap-{density}', 'ic_launcher_foreground.png'))

print(f'Generated {len(LEGACY_DENSITIES)} legacy + {len(FOREGROUND_DENSITIES)} adaptive-foreground icon(s) from {SRC}.')
