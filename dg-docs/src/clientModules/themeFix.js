// Fixes: navigating from the main app in "auto" theme mode into the docs site loads light
// theme regardless of the resolved (system/site) appearance.
//
// Root cause: the main app's theme cycle (assets/js/themeswitchNew.js) is three-state and
// persists the literal string "auto" into the shared `theme` localStorage key (not just
// "light"/"dark"). Docusaurus's own inline noflash script (@docusaurus/theme-classic
// inlineScripts.js) reads that same key but only understands "light"/"dark" — any other
// value (e.g. "auto") is written straight into `data-theme` unvalidated. `data-theme="auto"`
// matches no CSS rule, so the page silently renders as light. Explicit "dark"/"light" already
// work correctly (Docusaurus's own value), so only the "auto" case needs correcting here.
//
// Runs at module scope so it executes on import, before React hydration paints — same timing
// contract as the inline script it's patching up after.
if (typeof document !== 'undefined') {
  try {
    var stored = window.localStorage.getItem('theme');
    if (stored !== 'light' && stored !== 'dark') {
      // Resolve the same way Docusaurus's own script would for "no explicit choice" (system
      // preference) — don't touch the shared storage key, only correct the DOM the docs
      // React tree reads its initial state from.
      var resolved = window.matchMedia('(prefers-color-scheme: dark)').matches ? 'dark' : 'light';
      document.documentElement.setAttribute('data-theme', resolved);
      document.documentElement.setAttribute('data-theme-choice', 'system');
    }
  } catch (e) {}
}
