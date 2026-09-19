#!/usr/bin/env node
/*
 * Builds a trimmed local FontAwesome icon bundle for dg-node.
 *
 * dg-node uses ~28 icons total (search/js/home.js ICONS/CONTACTS + faSvg/faSpec), but the
 * shared assets/js/fontawesome.js (symlinked from the legacy PHP repo, siteroot/assets — same
 * file the old site's other pages load) ships the full ~1.6MB "all icons" bundle. That shared
 * file is left untouched here (the legacy site uses many more icons this script never scans) —
 * this writes a nodejs-only replacement instead, loaded from public/overrides/js/ like the
 * project's other override files (see CLAUDE.md "Прод: пути и symlinks").
 *
 * Most icons render via window.FontAwesome.icon() (see faSvg()/faSpec() in home.js) rather than
 * a raw fa-(solid|regular|brands) CSS class — the scan below covers both conventions.
 *
 * Run: npm run build-icons (re-run whenever a new icon is added to the source).
 */
'use strict';
const fs = require('fs');
const path = require('path');

const ROOT = __dirname;
const OUT_FILE = path.join(ROOT, 'public', 'overrides', 'js', 'fontawesome-local.js');
const FA_SVGS = path.join(ROOT, 'node_modules', '@fortawesome', 'fontawesome-free', 'svgs');
// Second consumer: the dictionary (dhammagift/ddg-ui), which draws icons as CSS masks
// (dg.css ".gi{-webkit-mask:var(--u)}" + ".i-star{--u:url(icons/star.svg)}") and has no bundler.
// It used to load the whole Font Awesome webfont bundle (~400KB) for 14 icons; this writes those
// 14 as plain SVG files plus the matching .i-fa-* rules, so the dictionary needs no webfont at all.
// Path is a CLI argument (--dict=/path/to/ddg-ui) or this default.
const DICT_DEFAULT = '/var/www/ddg-ui';
const STYLE_DIR = { fas: 'solid', far: 'regular', fab: 'brands' };
const SKIP_DIRS = new Set(['node_modules', '.git', 'unused', 'siteroot']);
// This file documents the exact patterns it scans for, and the generated output embeds every
// icon name in a MANIFEST comment — both would otherwise match their own scan regexes.
const SKIP_FILES = new Set([path.basename(__filename), path.basename(OUT_FILE)]);

function walk(dir, out) {
    for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
        if (entry.name.startsWith('.') || SKIP_FILES.has(entry.name)) continue;
        const full = path.join(dir, entry.name);
        if (entry.isDirectory()) {
            if (SKIP_DIRS.has(entry.name)) continue;
            walk(full, out);
        } else if (/\.(html|js)$/.test(entry.name)) {
            out.push(full);
        }
    }
    return out;
}

function collectIcons() {
    const icons = new Set(); // "fas/book-bookmark"
    for (const file of walk(ROOT, [])) {
        const src = fs.readFileSync(file, 'utf8');
        for (const m of src.matchAll(/\[\s*'(fa[srb])'\s*,\s*'([a-z0-9-]+)'\s*\]/g)) {
            icons.add(m[1] + '/' + m[2]);
        }
        for (const m of src.matchAll(/fa-(solid|regular|brands)\s+fa-([a-z0-9-]+)/g)) {
            icons.add({ solid: 'fas', regular: 'far', brands: 'fab' }[m[1]] + '/' + m[2]);
        }
        // faIcon('name') — settings.js's helper, always prefix 'fas' (see there).
        for (const m of src.matchAll(/\bfaIcon\('([a-z0-9-]+)'\)/g)) {
            icons.add('fas/' + m[1]);
        }
    }
    return [...icons].sort();
}

// ---- the dictionary target -------------------------------------------------------------------
// Same scan, different output: files on disk + a stylesheet, because that project loads plain CSS.
function buildDictSet(dictRoot) {
    const srcDirs = [path.join(dictRoot, 'public', 'templates'), path.join(dictRoot, 'public', 'ru_templates'),
                     path.join(dictRoot, 'public', 'static')];
    const icons = new Set();
    for (const dir of srcDirs) {
        if (!fs.existsSync(dir)) continue;
        for (const file of walk(dir, [])) {
            const src = fs.readFileSync(file, 'utf8');
            for (const m of src.matchAll(/fa-(solid|regular|brands)\s+fa-([a-z0-9-]+)/g)) {
                icons.add({ solid: 'fas', regular: 'far', brands: 'fab' }[m[1]] + '/' + m[2]);
            }
            for (const m of src.matchAll(/\bgi i-fa-([a-z0-9-]+)/g)) {
                icons.add('already/' + m[1]);   // already converted: keep shipping it
            }
        }
    }
    const outDir = path.join(dictRoot, 'public', 'static', 'icons', 'fa');
    const cssFile = path.join(dictRoot, 'public', 'static', 'icons-fa.css');
    fs.mkdirSync(outDir, { recursive: true });

    const rules = [];
    const missing = [];
    const names = new Set();
    for (const key of [...icons].sort()) {
        const [prefix, name] = key.split('/');
        if (names.has(name)) continue;
        // "already/x" has no style of its own: look for the file in every style.
        const styles = prefix === 'already' ? ['solid', 'regular', 'brands'] : [STYLE_DIR[prefix]];
        const found = styles.map((st) => path.join(FA_SVGS, st, name + '.svg')).find((f) => fs.existsSync(f));
        if (!found) { missing.push(key); continue; }
        names.add(name);
        // currentColor is what the mask ignores anyway; the file is used as a shape, not a picture.
        fs.writeFileSync(path.join(outDir, name + '.svg'), fs.readFileSync(found, 'utf8').replace(/<!--.*?-->/s, '').trim() + '\n');
        rules.push(`.i-fa-${name}{--u:url(icons/fa/${name}.svg)}`);
    }
    if (missing.length) console.warn('[build-icons] dict: not found, skipped:', missing.join(', '));
    fs.writeFileSync(cssFile, `/* Generated by dg-node build-icons.js — do not edit by hand.\n` +
        ` * ${rules.length} Font Awesome icons as CSS masks for .gi (see dg.css).\n` +
        ` * CC BY 4.0 — https://fontawesome.com/license/free\n */\n` + rules.join('\n') + '\n');
    console.log(`[build-icons] dict: wrote ${rules.length} icons to ${path.relative(dictRoot, outDir)} and ${path.relative(dictRoot, cssFile)}`);
}

function main() {
    const dictArg = process.argv.find((a) => a.startsWith('--dict='));
    const dictRoot = dictArg ? dictArg.slice('--dict='.length) : DICT_DEFAULT;
    if (!fs.existsSync(FA_SVGS)) {
        console.error('[build-icons] @fortawesome/fontawesome-free not installed — run `npm install` first.');
        process.exit(1);
    }

    const icons = collectIcons();
    const missing = [];
    const entries = [];
    for (const key of icons) {
        const [prefix, name] = key.split('/');
        const svgPath = path.join(FA_SVGS, STYLE_DIR[prefix], name + '.svg');
        if (!fs.existsSync(svgPath)) { missing.push(key); continue; }
        const svg = fs.readFileSync(svgPath, 'utf8').replace(/<!--.*?-->/s, '');
        entries.push(`  '${key}': ${JSON.stringify(svg)}`);
    }
    if (missing.length) {
        console.warn('[build-icons] Not found in @fortawesome/fontawesome-free, skipped:', missing.join(', '));
    }

    const out = `/*!
 * Local FontAwesome subset for dg-node — generated by build-icons.js, do not edit by hand.
 * ${entries.length} icons, CC BY 4.0 (icons) / MIT (code) — https://fontawesome.com/license/free
 * MANIFEST: ${icons.join(',')}
 */
(function () {
  var ICONS = {
${entries.join(',\n')}
  };
  window.FontAwesome = {
    icon: function (spec) {
      var svg = ICONS[spec.prefix + '/' + spec.iconName];
      return svg ? { html: [svg] } : null;
    }
  };
})();
`;
    fs.mkdirSync(path.dirname(OUT_FILE), { recursive: true });
    fs.writeFileSync(OUT_FILE, out);
    console.log(`[build-icons] Wrote ${path.relative(ROOT, OUT_FILE)} — ${entries.length} icons, ${(out.length / 1024).toFixed(1)}KB`);

    if (fs.existsSync(dictRoot)) buildDictSet(dictRoot);
    else console.log(`[build-icons] dict checkout not at ${dictRoot} — skipped (pass --dict=/path)`);
}

main();
