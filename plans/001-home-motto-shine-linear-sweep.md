# 001 — Make the home-motto shine read as a light sweep, not a flash

- **Status**: DONE
- **Commit**: b8813bc
- **Severity**: MEDIUM
- **Category**: Easing & duration (AUDIT.md §2), with a supporting craft issue in the gradient shape
- **Estimated scope**: 1 file, ~10 lines changed (no new files, no new selectors)

## Problem

`search/css/home.css:1297-1318` — a one-time animation on `#home-motto` ("Найдите Истину" /
"Find the Truth" on the home hero) was built to look like "a spot of light passing across the
letters" (owner's own spec). Owner's verdict on the shipped result: "фактически сейчас это
просто блик, похожий на подгрузку шрифта" — it reads as a brightness flash/pop, like a font
swap (FOUT→FOIT), not as a beam of light traveling across the word.

Current code:

```css
/* search/css/home.css:1302-1314 — current */
@supports ((background-clip: text) or (-webkit-background-clip: text)) {
    #home-motto {
        background: linear-gradient(100deg,
            var(--dg-text) 35%, var(--dg-motto-shine) 50%, var(--dg-text) 65%);
        background-size: 250% 100%;
        background-position: 160% 0;
        -webkit-background-clip: text;
        background-clip: text;
        -webkit-text-fill-color: transparent;
        color: transparent;
        animation: dg-motto-shine 1.6s var(--dg-ease) 0.3s 1 both;
    }
}
@keyframes dg-motto-shine {
    from { background-position: 160% 0; }
    to { background-position: -60% 0; }
}
```

Two independent root causes, both in this one rule, both needed for the fix to actually read as
"light passing across the letters" rather than "the text got brighter for a moment":

1. **The bright band is too wide and too soft.** The gradient's highlight stop (`var(--dg-motto-shine)`) sits between two `var(--dg-text)` stops 30 percentage points apart (`35%`→`65%`), inside a background image that is itself stretched to `250%` of the element's width. That spreads the actual bright region across roughly three-quarters of the element's own width at any instant — there is no narrow, sharp "beam", just a broad, slow overall brightening and dimming of the whole word. A light sweep needs a **narrow, distinct band** so the eye can track it moving, the same way a marquee or a glare highlight on a button is a thin travelling line, not a wide wash.

2. **The timing function is a strong ease-out (`var(--dg-ease)` = `cubic-bezier(0.22, 0.68, 0, 1)`), which is wrong for this motion.** Per AUDIT.md §2's decision order, `ease-out` is for *entering or exiting* elements (starts fast, arrives and settles — correct for a dropdown or modal appearing). This animation is *constant, directional motion crossing the screen* — AUDIT.md §2 puts that case explicitly: "Constant motion (marquee, progress) → `linear`". With `ease-out`, the highlight rushes to its final resting position and decelerates hard at the end, so most of the animation's duration is spent with the band nearly stationary near the *end* of its travel — combined with root cause 1's width, that reads exactly as "the text lit up and stayed lit for a beat", i.e. a flash, not as something crossing left-to-right at a steady visual speed.

Neither cause alone fully explains the "font-loading flash" impression; together they do — a wide band that decelerates to a near-stop is indistinguishable from a global brightness pulse.

## Target

```css
/* search/css/home.css:1302-1314 — target */
@supports ((background-clip: text) or (-webkit-background-clip: text)) {
    #home-motto {
        background: linear-gradient(100deg,
            var(--dg-text) 44%, var(--dg-motto-shine) 50%, var(--dg-text) 56%);
        background-size: 200% 100%;
        background-position: 150% 0;
        -webkit-background-clip: text;
        background-clip: text;
        -webkit-text-fill-color: transparent;
        color: transparent;
        animation: dg-motto-shine 1.4s linear 0.3s 1 both;
    }
}
@keyframes dg-motto-shine {
    from { background-position: 150% 0; }
    to { background-position: -50% 0; }
}
```

What changed and why, value by value:

- Gradient stops `35%/50%/65%` (30-point spread) → `44%/50%/56%` (12-point spread): narrows the
  bright band to a distinct beam instead of a broad wash. 12 points was chosen as roughly 40% of
  the original spread — narrow enough to read as a line, not so narrow it aliases/flickers at
  30px font-size (see feel-check below; this is the one number in this plan worth eyeballing and
  nudging, everything else is mechanically justified).
- `background-size: 250% 100%` → `200% 100%`: keeps the travel distance tied to the element's
  own width instead of over-stretching the gradient image, so the now-narrower band doesn't have
  to cross an oversized image (which would have made it look like it was crawling, not sweeping).
- `background-position` start/end `160%`/`-60%` → `150%`/`-50%`: re-derived for the new
  `200%`-wide image using the same "fully off right edge → fully off left edge" logic as the
  original (which used `160%`/`-60%` for a `250%`-wide image) — keeps the sweep starting and
  ending fully outside the visible text, so there's no visible "pop" at either end.
- `animation-timing-function`: `var(--dg-ease)` → `linear`. Per AUDIT.md §2, this is the
  documented curve for constant, marquee-like motion, which is what a light sweep is — not
  `ease-out`, which is reserved for elements entering/exiting (AUDIT.md §2, decision order).
- Duration `1.6s` → `1.4s`: with `ease-out` gone, the same nominal duration now spends its
  *entire* length in even motion instead of front-loading the perceived motion into the first
  third before decelerating — the old 1.6s will read as noticeably slower once it's linear.
  1.4s is a starting estimate, not a hard requirement; see the feel-check step to confirm or
  retune it.

## Repo conventions to follow

- This file already defines animation-specific custom properties next to the rule that uses them
  (see `--dg-motto-shine` itself, defined once per theme block at `search/css/home.css:104-108`
  and `:131-135`, right next to `--dg-text`) — no new tokens are needed for this plan, `linear`
  is a standard CSS keyword and does not need a custom property.
- `var(--dg-ease)` (defined at `search/css/home.css:103`, `cubic-bezier(0.22, 0.68, 0, 1)`) is
  this repo's one shared easing token, used throughout for **entering/exiting** UI (e.g.
  `#home-hint`'s `max-height`/`opacity`/`transform` transition at `search/css/home.css:164`, the
  reader enter/exit keyframes at `search/css/home.css:920-921`). Do not reuse it here — this is
  the one place in the file where the motion is NOT an entrance/exit, so `linear` is correct and
  intentionally different from the rest of the file's motion, not an inconsistency to "fix" back
  to `var(--dg-ease)`.

## Steps

1. Open `search/css/home.css`. Locate the `@supports ((background-clip: text) or
   (-webkit-background-clip: text)) { #home-motto { ... } }` block (currently lines 1302-1314)
   and the adjacent `@keyframes dg-motto-shine { ... }` block (currently lines 1315-1318).
2. Replace the `background` shorthand's gradient stops: `35%` → `44%`, `65%` → `56%` (the middle
   `50%` stop for `var(--dg-motto-shine)` is unchanged).
3. Replace `background-size: 250% 100%;` with `background-size: 200% 100%;`.
4. Replace `background-position: 160% 0;` with `background-position: 150% 0;` (this line appears
   once inside `#home-motto` and must match the `from` value in the keyframes in step 6).
5. Replace `animation: dg-motto-shine 1.6s var(--dg-ease) 0.3s 1 both;` with
   `animation: dg-motto-shine 1.4s linear 0.3s 1 both;` (only the duration and timing-function
   change; the `0.3s` delay, `1` iteration-count, and `both` fill-mode stay exactly as they are —
   they are unrelated to this finding).
6. In `@keyframes dg-motto-shine`, replace `from { background-position: 160% 0; }` with
   `from { background-position: 150% 0; }`, and `to { background-position: -60% 0; }` with
   `to { background-position: -50% 0; }`.
7. Leave the `@media (prefers-reduced-motion: reduce)` block (currently lines 1319-1323)
   untouched — it already drops the whole effect to a solid `var(--dg-text)` color, which is
   still correct after this change (nothing about a narrower/faster sweep affects that block).

## Boundaries

- Do NOT touch the `--dg-motto-shine` custom property definitions (`search/css/home.css:108` and
  `:135`) — the color values themselves (dimmer gray in light theme, pure white in dark theme)
  are a separate, already-correct decision (see the comments right above each) and are not part
  of this finding.
- Do NOT touch `#home-motto`'s base rule (`search/css/home.css:1286-1296` — font-size, weight,
  margin, the fallback `color: var(--dg-text)`) or anything about `#home-subtitle` below it.
- Do NOT change the delay (`0.3s`), iteration-count (`1`), or fill-mode (`both`) in the
  `animation` shorthand — only `1.6s` → `1.4s` and `var(--dg-ease)` → `linear` change.
- Do NOT add a new easing token or touch `var(--dg-ease)`'s own definition — this plan uses the
  plain `linear` keyword, not a new custom curve.
- If the `#home-motto` rule or its keyframes have drifted from the "current code" shown above
  (different stop percentages, a different animation line) since commit `b8813bc`, STOP and
  report the actual current content instead of guessing which numbers to change.

## Verification

- **Mechanical**: none — this is a pure CSS value change with no build step for this file
  (`search/index.html` loads `search/css/home.css` directly, no preprocessor). Confirm the file
  still parses as valid CSS (no dangling braces) by eye after editing; there is no linter wired
  up for this file in this repo.
- **Feel check** (do this in a real browser, home page, dark theme first since
  `--dg-motto-shine: #ffffff` there gives the highest contrast to judge the band's sharpness):
  - Hard-refresh so the animation replays (it only plays once per real page load by design).
  - Watch the heading once at normal speed: confirm it now reads as a distinct bright line
    crossing the word left-to-right at a steady pace, not as the whole word flashing brighter.
  - In Chrome DevTools → More tools → Animations panel, find the `dg-motto-shine` animation on
    `#home-motto`, set playback rate to 10%, and scrub it frame by frame: confirm the bright band
    stays visually narrow (a handful of letters wide, not covering half the word) at every point
    in the sweep, and that it moves at a visually constant speed (no lingering near the start or
    end — that would mean the `linear` change didn't take, or another easing is still cascading
    in from somewhere).
  - If the band still looks too wide or too narrow (aliasing/flicker) at actual 30px/26px
    (mobile, `search/css/home.css:1332`) font sizes, retune the `44%/56%` stops in small steps
    (e.g. `46%/54%` for narrower, `42%/58%` for wider) — this is the one value in this plan that
    is a starting estimate, not a derived constant.
  - If 1.4s still feels slow (or too fast) once it's linear, retune the duration in
    `search/css/home.css`'s `animation:` line and the matching intuition (no other number needs
    to change when only the duration changes) — try the 1.2s–1.6s range before going outside it.
  - Repeat the hard-refresh check once in light theme (`--dg-motto-shine: #cfcfcf`) — confirm the
    band is still visible as a distinct highlight and not washed out against the near-black base
    text color (`--dg-text: #1b1d19` in light theme).
  - Toggle `prefers-reduced-motion` (DevTools → Rendering panel → "Emulate CSS media feature
    prefers-reduced-motion" → reduce), hard-refresh, and confirm the heading shows as plain solid
    `var(--dg-text)` with no animation at all (unchanged from before this plan — this path is not
    touched by steps 1-6).
- **Done when**: the sweep visibly reads as a narrow band of light crossing the letters at a
  constant speed, in both themes, and the reduced-motion fallback still shows plain static text.
