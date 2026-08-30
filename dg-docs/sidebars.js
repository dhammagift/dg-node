// EN is frozen (owner's call — finish RU first, sync EN in one pass later) so it still
// reads from docs/about|guide/*; only the RU tree was renamed to docs/dhamma|user/* for
// clean naming/slugs. Two branches here, not two sidebar files, since docusaurus.config.js
// already selects the ru build via the same env var.
const RU_BUILD = process.env.DOCS_BUILD_LOCALE === 'ru';

/** @type {import('@docusaurus/plugin-content-docs').SidebarsConfig} */
const sidebars = {
  mainSidebar: RU_BUILD
    ? [
        'index',
        {
          type: 'category',
          label: 'Дхамма',
          collapsed: false,
          items: ['dhamma/sutta', 'dhamma/principles', 'dhamma/rationale'],
        },
        {
          type: 'category',
          label: 'Помощь пользователю',
          collapsed: false,
          items: [
            'user/index',
            'user/multitool',
            'user/search',
            'user/read',
            'user/toc',
            'user/dictionary',
            'user/tts',
            'user/login',
            'user/memo',
            'user/settings',
            'user/quickmodal',
            'user/translator',
            'user/policies',
          ],
        },
        {
          // /api-docs/ is served by the same Express app as the docs build itself, at the
          // site root, not under this build's own baseUrl (/docs/ or /ru/docs/). The
          // `pathname://` prefix + autoAddBaseUrl:false make Docusaurus's sidebar <Link>
          // treat this as a plain external-style link (full navigation, no baseUrl prefix,
          // not checked by onBrokenLinks) so it resolves correctly on prod/test/any mirror.
          type: 'link',
          label: 'API',
          href: 'pathname:///api-docs/',
          autoAddBaseUrl: false,
        },
      ]
    : [
        'index',
        {
          type: 'category',
          label: 'Dhamma',
          collapsed: false,
          items: ['about/dhamma-principles', 'about/translation-principles', 'about/rationale'],
        },
        {
          type: 'category',
          label: 'User Help',
          collapsed: false,
          items: [
            'about/index',
            'guide/search',
            'guide/reader',
            'guide/settings',
            'guide/toc',
            'guide/voice-tts',
            'guide/multitool',
            'guide/login',
            'guide/memo',
            'about/policies',
          ],
        },
        {
          type: 'link',
          label: 'API',
          href: 'pathname:///api-docs/',
          autoAddBaseUrl: false,
        },
      ],
};

export default sidebars;
