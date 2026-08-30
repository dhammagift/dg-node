// Fixes: (1) loading the docs site in "auto" theme mode shows light regardless of the
// resolved (system/site) appearance, and (2) navigating around the docs while an embedded
// AppFrame iframe is on screen can flip an already-correct dark page back to light with no
// visible cause — and silently downgrades the shared theme preference itself in the process.
//
// Root cause of both: the main app's theme cycle (assets/js/themeswitchNew.js) is three-state
// and persists the literal string "auto" into the shared `theme` localStorage key (not just
// "light"/"dark"). Docusaurus only understands "light"/"dark":
// (1) its inline noflash script (@docusaurus/theme-classic inlineScripts.js) writes whatever
//     string it finds straight into `data-theme` unvalidated — `data-theme="auto"` matches no
//     CSS rule, so the page silently renders light on first load.
// (2) @docusaurus/theme-common's ColorModeProvider ALSO listens for `storage` events on this
//     same key for its whole lifetime (colorMode.js's `ColorModeStorage.listen(...)`), and
//     coerces any value that isn't exactly "dark" straight to "light" — hardcoded, not
//     system-preference-aware. A same-origin AppFrame iframe (present on almost every user/*
//     page) runs the exact same theme-init script in its own fresh document; for a
//     first-time visitor (`theme` key doesn't exist yet) that script's very first write is
//     `localStorage.theme = "auto"` — a genuine null→"auto" change, which DOES fire a real
//     `storage` event in the parent docs page. Worse: Docusaurus's `setColorMode()` PERSISTS
//     its wrong coercion back into the same shared key (`persistColorModeChoice` →
//     `ColorModeStorage.set('light')`) — so this doesn't just mis-paint the docs page, it
//     silently overwrites the visitor's real "auto" preference to a hardcoded "light" that
//     the main app itself will also see on the next visit. Reproduced directly: dispatching a
//     synthetic `storage` event with `newValue: "auto"` on an already-dark docs page flips
//     `data-theme` to "light" AND rewrites `localStorage.theme` to "light" — confirmed both
//     effects, not a guess.
//
// Fix: normalize once at module scope (before hydration paints, for case 1). For case 2,
// capture the event's own `newValue` at dispatch time (constant across all listeners
// regardless of order) and, after a tick (letting Docusaurus's listener run and do its
// damage), restore the storage key to that ORIGINAL value and recompute `data-theme` from it
// — repairing both the corrupted key and the wrong paint in one step. A genuinely valid
// "light"/"dark" value from another tab is left alone; only the three-state "auto" (or any
// other value Docusaurus can't represent) triggers the repair.
if (typeof document !== 'undefined') {
  function resolveAndPaint(rawValue) {
    if (rawValue === 'light' || rawValue === 'dark') return;
    var resolved = window.matchMedia('(prefers-color-scheme: dark)').matches ? 'dark' : 'light';
    document.documentElement.setAttribute('data-theme', resolved);
    document.documentElement.setAttribute('data-theme-choice', 'system');
  }

  try {
    resolveAndPaint(window.localStorage.getItem('theme'));
  } catch (e) {}

  window.addEventListener('storage', function (e) {
    if (e.key !== 'theme') return;
    var originalValue = e.newValue;
    if (originalValue === 'light' || originalValue === 'dark') return;
    setTimeout(function () {
      try {
        window.localStorage.setItem('theme', originalValue);
      } catch (err) {}
      resolveAndPaint(originalValue);
    }, 0);
  });
}
