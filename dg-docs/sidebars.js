// EN now mirrors RU's file set/slugs exactly (docs/dhamma/*, docs/user/*) — same page under
// both locales, needed so the navbar language switcher (src/clientModules/langSwitch.js)
// can stay on the same page across languages. Two branches here, not two sidebar files, only
// because the category/link LABELS differ; docusaurus.config.js selects the ru build via the
// same env var.
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
            'user/pwa',
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
          type: 'category',
          label: 'Технические детали',
          collapsed: false,
          items: [
            'tech/installation',
            {
              // /api-docs/ is served by the same Express app as the docs build itself, at
              // the site root, not under this build's own baseUrl (/docs/ or /ru/docs/).
              // The `pathname://` prefix + autoAddBaseUrl:false make Docusaurus's sidebar
              // <Link> treat this as a plain external-style link (full navigation, no
              // baseUrl prefix, not checked by onBrokenLinks) so it resolves correctly on
              // prod/test/any mirror.
              type: 'link',
              label: 'API',
              href: 'pathname:///api-docs/',
              autoAddBaseUrl: false,
            },
          ],
        },
      ]
    : [
        'index',
        {
          type: 'category',
          label: 'Dhamma',
          collapsed: false,
          items: ['dhamma/sutta', 'dhamma/principles', 'dhamma/rationale'],
        },
        {
          type: 'category',
          label: 'User Help',
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
          type: 'link',
          label: 'API',
          href: 'pathname:///api-docs/',
          autoAddBaseUrl: false,
        },
      ],
};

export default sidebars;
