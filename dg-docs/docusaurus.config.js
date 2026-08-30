// @ts-check
import {themes as prismThemes} from 'prism-react-renderer';

// Two independent single-locale builds share this one config (see package.json
// build/build:ru scripts) so each locale gets a REAL, baked-in URL prefix — Docusaurus
// always puts the active locale right after baseUrl, so building en and ru separately
// with different baseUrls is the only way to get /docs/... (en) and /ru/docs/... (ru)
// instead of /docs/ru/... (locale stuck in the middle of one shared prefix). A single
// shared build with baseUrl:'/' (Docusaurus's own native-i18n-dropdown setup, e.g.
// docusaurus.io) isn't safe here: dhamma.gift's root is a real app, and that build would
// generate its own sitemap.xml/favicon.ico/assets/... at the exact same root paths.
const RU_BUILD = process.env.DOCS_BUILD_LOCALE === 'ru';

/** @type {import('@docusaurus/types').Config} */
const config = {
  title: RU_BUILD ? 'Справка Dhamma.gift (БЕТА)' : 'Dhamma.gift Help (BETA)',
  tagline: 'Search & Reader for the Pali Canon',
  favicon: 'img/favicon.ico',

  future: {
    v4: true,
  },

  url: 'https://dhamma.gift',
  baseUrl: RU_BUILD ? '/ru/docs/' : '/docs/',

  organizationName: 'dhammagift',
  projectName: 'dg-docs',

  onBrokenLinks: 'throw',

  // Default `namespace: true` hashes url+baseUrl into every storage key (e.g. "theme-350"),
  // different per build (en vs ru have different baseUrls) — meant to let several Docusaurus
  // sites share a domain without clashing keys, but it also meant color mode never matched
  // the main app's own plain "theme" key, or even matched between the two docs builds
  // themselves. Disabled so the docs site shares the app's real theme toggle, same-origin.
  storage: {
    namespace: false,
  },

  clientModules: [
    './src/clientModules/themeFix.js',
    './src/clientModules/quickModal.js',
    './src/clientModules/langSwitch.js',
  ],

  i18n: {
    defaultLocale: RU_BUILD ? 'ru' : 'en',
    locales: [RU_BUILD ? 'ru' : 'en'],
  },

  plugins: [
    [
      '@easyops-cn/docusaurus-search-local',
      /** @type {import('@easyops-cn/docusaurus-search-local').PluginOptions} */
      ({
        hashed: true,
        language: [RU_BUILD ? 'ru' : 'en'],
        // Docs live at the site root (routeBasePath: '/'), not under the
        // plugin's default '/docs' assumption — must match or it silently
        // indexes nothing (empty processDocInfos() result, no error).
        docsRouteBasePath: '/',
        // Default 'mod+k' (Ctrl/Cmd+K) is reserved by the browser itself in real Chrome/Edge
        // (focuses the address bar) and in Firefox (old search bar) — the keydown never
        // reaches page JS, unfixable from here. '/' is the one shortcut that reliably works
        // everywhere; this also fixes the visible "Ctrl K" hint badge, which was misleading
        // in exactly the browsers where it doesn't work. Replaces the separate
        // searchShortcut.js clientModule workaround with the plugin's own real config.
        searchBarShortcutKeymap: '/',
      }),
    ],
  ],

  presets: [
    [
      'classic',
      /** @type {import('@docusaurus/preset-classic').Options} */
      ({
        docs: {
          // Default locale's content is always read from `path`, not from an
          // i18n/<locale> override dir — so the ru build points `path` straight at
          // the ru content tree instead of relying on i18n locale-override lookup.
          path: RU_BUILD ? 'i18n/ru/docusaurus-plugin-content-docs/current' : 'docs',
          routeBasePath: '/',
          sidebarPath: './sidebars.js',
        },
        blog: false,
        theme: {
          customCss: './src/css/custom.css',
        },
      }),
    ],
  ],

  themeConfig:
    /** @type {import('@docusaurus/preset-classic').ThemeConfig} */
    ({
      colorMode: {
        // Same localStorage key ('theme') as the main app (search/index.html) —
        // switching theme here or in an embedded AppFrame stays in sync same-origin.
        respectPrefersColorScheme: true,
      },
      navbar: {
        title: RU_BUILD ? 'Справка Dhamma.gift' : 'Dhamma.gift Help',
        logo: {
          // Shell (shankha), not a house — same "home" mark the main app already uses
          // (search/index.html .dg-shell-logo / dg-go-home), owner's explicit convention.
          // Copied into dg-docs/static/img/ — this build is served in isolation under its
          // own baseUrl, it never sees the main app's /assets/ mount at runtime.
          alt: 'Dhamma.gift',
          src: 'img/dgsankhaonly.png',
          href: '/', // site root within THIS build — Docusaurus adds baseUrl itself
        },
        // No compass/language items here — Docusaurus's mobile sidebar silently drops
        // custom `type: 'html'` navbar.items (verified: desktop-only). Both are instead
        // injected next to the theme toggle by src/clientModules/langSwitch.js, which
        // shows up in both desktop and mobile headers and can recompute the language
        // link's target on route change (page-preserving switch, not always-home).
        items: [],
      },
      footer: {
        style: 'dark',
        links: [],
        copyright: `Dhamma.gift`,
      },
      prism: {
        theme: prismThemes.github,
        darkTheme: prismThemes.dracula,
      },
    }),
};

export default config;
