// Общий движок интерфейсной локализации — вынесен из reader/reader-template.html,
// чтобы ридер и страница поиска (и в будущем — другие вкладки SPA) использовали
// один и тот же код, а не копии. Логика самого движка не менялась при переносе.
//
// Конфиг страницы задаётся через window.DHAMMA_LANG_CONFIG_PATTERN (например
// "/reader/lang_{lang}.json" или "/nodejs/res/lang_{lang}.json") — обязательно
// абсолютный путь, т.к. страницы могут отдаваться с нескольких URL.
//
// Опционально: window.DHAMMA_GLOBAL_LANG_CONFIG_PATTERN — второй, ОБЩИЙ для всех
// страниц конфиг (например "/assets/i18n/lang_global_{lang}.json"), с строками
// вроде "Закрыть"/"Настройки", которые не хочется дублировать в конфиге каждой
// страницы. Если переменная не задана — глобальный fetch просто пропускается
// (это и есть поведение ридера сегодня, ничего не ломается). Если глобальный
// fetch падает — не фатально: страница продолжает работать только со своим
// конфигом, без window.config.global.
window.DHAMMA_I18N = (() => {
  const TOKEN_PATTERN = /\{\{([A-Za-z0-9_.-]+)\}\}/g;
  const textTemplates = new WeakMap();
  let activeConfig = null;
  let activeLanguage = null;

  function getValue(config, path) {
    return path.split(".").reduce((value, part) => {
      if (value === null || value === undefined) return undefined;
      return value[part];
    }, config);
  }

  function render(template, config) {
    return template.replace(TOKEN_PATTERN, (token, path) => {
      const value = getValue(config, path);
      if (value === undefined) {
        throw new Error(`Missing localization key: ${path}`);
      }
      return String(value);
    });
  }

  function applyTextNode(node, config) {
    const savedTemplate = textTemplates.get(node);
    const template = savedTemplate ?? node.nodeValue;

    if (!template || !template.includes("{{")) return;
    if (!savedTemplate) textTemplates.set(node, template);

    const parent = node.parentElement;
    if (parent && (parent.tagName === "SCRIPT" || parent.tagName === "STYLE")) return;
    if (
      parent?.tagName === "TITLE" &&
      new URLSearchParams(window.location.search).has("q")
    ) {
      return;
    }

    node.nodeValue = render(template, config);
  }

  function replaceLanguageScript(script, source) {
    if (script.getAttribute("data-i18n-loaded-src") === source) return;

    const replacement = script.cloneNode(false);
    replacement.removeAttribute("src");
    replacement.setAttribute("data-i18n-loaded-src", source);
    replacement.async = false;
    replacement.src = source;
    script.replaceWith(replacement);
  }

  function applyElement(element, config) {
    for (const attribute of Array.from(element.attributes)) {
      if (!attribute.name.startsWith("data-i18n-")) continue;

      const targetAttribute = attribute.name.slice("data-i18n-".length);
      const value = render(attribute.value, config);

      if (element.tagName === "SCRIPT" && targetAttribute === "src") {
        replaceLanguageScript(element, value);
        return;
      }

      element.setAttribute(targetAttribute, value);
    }
  }

  function applySubtree(root, config) {
    if (!root) return;

    if (root.nodeType === Node.TEXT_NODE) {
      applyTextNode(root, config);
      return;
    }

    if (root.nodeType !== Node.ELEMENT_NODE && root.nodeType !== Node.DOCUMENT_NODE) {
      return;
    }

    if (root.nodeType === Node.ELEMENT_NODE) {
      applyElement(root, config);
    }

    const walker = document.createTreeWalker(
      root,
      NodeFilter.SHOW_ELEMENT | NodeFilter.SHOW_TEXT
    );

    let node = walker.nextNode();
    while (node) {
      if (node.nodeType === Node.ELEMENT_NODE) {
        applyElement(node, config);
      } else {
        applyTextNode(node, config);
      }
      node = walker.nextNode();
    }
  }

  function restoreDynamicTitle() {
    const q = new URLSearchParams(window.location.search).get("q");
    if (q) {
      document.title = q.replace(/pli-tv-|vb-/g, "");
    }
  }

  function revealPage() {
    document.documentElement.classList.remove("i18n-loading");
    document.getElementById("anti-fouc")?.remove();
  }

  function configUrl(language, explicitUrl) {
    if (explicitUrl) return explicitUrl;

    const configuredUrl = window.DHAMMA_LANG_CONFIG_URLS?.[language];
    if (configuredUrl) return configuredUrl;

    if (window.DHAMMA_LANG_CONFIG_URL) {
      return window.DHAMMA_LANG_CONFIG_URL;
    }

    const pattern = window.DHAMMA_LANG_CONFIG_PATTERN || "lang_{lang}.json";
    return new URL(
      pattern.replace("{lang}", encodeURIComponent(language)),
      window.location.href
    ).toString();
  }

  function globalConfigUrl(language) {
    const pattern = window.DHAMMA_GLOBAL_LANG_CONFIG_PATTERN;
    if (!pattern) return null;
    return new URL(
      pattern.replace("{lang}", encodeURIComponent(language)),
      window.location.href
    ).toString();
  }

  async function fetchConfig(url) {
    const response = await fetch(url, { credentials: "same-origin" });
    if (!response.ok) {
      throw new Error(
        `Unable to load localization config (${response.status} ${response.statusText})`
      );
    }
    return response.json();
  }

  async function fetchGlobalConfig(language) {
    const url = globalConfigUrl(language);
    if (!url) return undefined;
    try {
      return await fetchConfig(url);
    } catch (error) {
      console.error("Не удалось загрузить глобальный конфиг локализации:", error);
      return undefined;
    }
  }

  async function setSiteLanguage(language, explicitUrl) {
    const [config, globalConfig] = await Promise.all([
      fetchConfig(configUrl(language, explicitUrl)),
      fetchGlobalConfig(language)
    ]);

    if (globalConfig) {
      config.global = globalConfig;
    }

    activeConfig = config;
    activeLanguage = config.locale?.code || language;

    applySubtree(document, config);
    restoreDynamicTitle();

    if (config.locale?.htmlLang) {
      document.documentElement.lang = config.locale.htmlLang;
    }

    try {
      localStorage.setItem("dhammaLanguage", activeLanguage);
    } catch (_) {
      // Storage may be unavailable in privacy modes.
    }

    revealPage();
    document.dispatchEvent(
      new CustomEvent("dhamma:languagechange", {
        detail: { language: activeLanguage, config }
      })
    );

    return config;
  }

  const observer = new MutationObserver(records => {
    if (!activeConfig) return;
    for (const record of records) {
      for (const node of record.addedNodes) {
        applySubtree(node, activeConfig);
      }
    }
  });

  observer.observe(document.documentElement, {
    childList: true,
    subtree: true
  });

  const queryLanguage = new URLSearchParams(window.location.search).get("lang");
  let storedLanguage = null;
  try {
    storedLanguage = localStorage.getItem("dhammaLanguage");
  } catch (_) {
    // Storage may be unavailable in privacy modes.
  }

  // Fallback default is "en" (per user decision) — a visitor with no ?lang=, no stored
  // preference, and no data-default-lang override sees the English interface first.
  const initialLanguage =
    window.DHAMMA_LANG ||
    queryLanguage ||
    storedLanguage ||
    document.documentElement.dataset.defaultLang ||
    "en";

  window.setSiteLanguage = setSiteLanguage;
  window.DHAMMA_I18N_READY = setSiteLanguage(initialLanguage).catch(error => {
    console.error(error);
    revealPage();
    return null;
  });

  return {
    get language() {
      return activeLanguage;
    },
    get config() {
      return activeConfig;
    },
    ready: window.DHAMMA_I18N_READY,
    setLanguage: setSiteLanguage
  };
})();
