import React, { useEffect, useRef, useState } from 'react';

// Adds two things to a prose page that has no embedded live reader of its own (Principles of
// Translation, Rationale, Sutta Principles): word-by-word Pali dictionary lookup, and a
// "Listen" button.
//
// Dictionary: reuses the real production popup dictionary (assets/js/paliLookup.js) exactly
// as embedded elsewhere on the site (see siteroot/assets/common/o.html's <top-nav-icons
// show-dict>) — lazy-loads the same script+CSS, same toggle button markup/classes, so it's
// the same feature, not a reimplementation. It only reacts to elements marked `lang="pi"` —
// this component auto-tags the article's own <code>/<em> spans that are Pali/Sanskrit terms
// (Latin script) and leaves plain Russian/English emphasis alone (Cyrillic text is never
// tagged), since the three target pages were never hand-marked with lang="pi" to begin with.
//
// Listen: verified live (playwright, o.html) that the production TTS engine
// (read/js/voice.js) does NOT work on this content — it only knows how to read real sutta
// segment data or one specific legacy table layout; on a plain prose page it logs "Нет
// данных для воспроизведения" and never speaks. Rather than force this content into that
// legacy shape, this uses the browser's own Web Speech API directly against the article's
// rendered text — simpler and it actually works.
export default function PageTools({ articleSelector = '.theme-doc-markdown' }) {
  const [dictOn, setDictOn] = useState(true);
  const [speaking, setSpeaking] = useState(false);
  // Starts false (matches server-rendered output, no `window` at build time) and is corrected
  // in the effect below. Deliberately NOT computed inline in the render body: when the effect
  // that sets dictOn from localStorage happens to compute the same value as its initial state
  // (the common case — no prior visit), React bails out of re-rendering, and an inline
  // `typeof window !== 'undefined'` check would then stay frozen at its build-time (false)
  // value forever, even in the browser. A real state transition guarantees the correction
  // actually lands for a page whose true value differs from the server guess.
  const [isRu, setIsRu] = useState(false);

  useEffect(() => {
    setIsRu(window.location.pathname.startsWith('/ru/'));

    const stored = window.localStorage.getItem('dictionaryVisible');
    setDictOn(stored === null ? true : stored === 'true');

    if (!document.getElementById('palilookup-css-lazy')) {
      const link = document.createElement('link');
      link.id = 'palilookup-css-lazy';
      link.rel = 'stylesheet';
      link.href = '/assets/css/paliLookup.css';
      document.head.appendChild(link);
    }
    if (!document.querySelector('script[data-palilookup]')) {
      const script = document.createElement('script');
      script.src = '/assets/js/paliLookup.js';
      script.defer = true;
      script.dataset.palilookup = 'true';
      document.body.appendChild(script);
    }

    const article = document.querySelector(articleSelector);
    if (article) {
      article.querySelectorAll('code, em, strong').forEach((el) => {
        const text = el.textContent;
        // eslint-disable-next-line no-control-regex
        if (/[Ѐ-ӿ]/.test(text)) return; // has Cyrillic -> not a Pali/Sanskrit term
        if (!/[a-zA-Z]/.test(text)) return; // nothing to look up
        el.setAttribute('lang', 'pi');
        el.classList.add('pli-lang');
      });
    }

    return () => {
      if (window.speechSynthesis) window.speechSynthesis.cancel();
    };
  }, [articleSelector]);

  function toggleDict() {
    const next = !dictOn;
    setDictOn(next);
    window.localStorage.setItem('dictionaryVisible', String(next));
    document.querySelectorAll('.toggle-dict-btn img').forEach((img) => {
      img.src = next ? '/assets/svg/comment.svg' : '/assets/svg/comment-slash.svg';
    });
  }

  function toggleListen() {
    const synth = window.speechSynthesis;
    if (!synth) return;
    if (speaking) {
      synth.cancel();
      setSpeaking(false);
      return;
    }
    const article = document.querySelector(articleSelector);
    if (!article) return;
    const utter = new SpeechSynthesisUtterance(article.innerText);
    utter.lang = isRu ? 'ru-RU' : 'en-US';
    utter.onend = () => setSpeaking(false);
    utter.onerror = () => setSpeaking(false);
    synth.speak(utter);
    setSpeaking(true);
  }

  return (
    <div
      style={{
        display: 'flex',
        gap: '0.75rem',
        alignItems: 'center',
        margin: '0 0 1.5rem',
      }}
    >
      <a
        onClick={toggleDict}
        title={
          isRu
            ? 'Словарь по клику на слово (Alt+A)'
            : 'Popup dictionary on word click (Alt+A)'
        }
        className="toggle-dict-btn cursor-pointer"
        style={{ cursor: 'pointer', display: 'inline-flex' }}
      >
        <img
          src={dictOn ? '/assets/svg/comment.svg' : '/assets/svg/comment-slash.svg'}
          alt=""
        />
      </a>
      <a
        onClick={toggleListen}
        title={isRu ? (speaking ? 'Остановить' : 'Слушать статью') : speaking ? 'Stop' : 'Listen to this page'}
        className="cursor-pointer"
        style={{ cursor: 'pointer', display: 'inline-flex', textDecoration: 'none' }}
      >
        {/* #989898 — same fixed gray as assets/svg/comment.svg, not `currentColor`: inside an
            <a> here, currentColor resolves to Docusaurus's green link color, which made this
            icon look like an unrelated accent button instead of matching the dictionary
            icon right next to it. */}
        <svg width="24" height="24" viewBox="0 0 24 24">
          <path
            fill="#989898"
            d={speaking ? 'M6 5h4v14H6zM14 5h4v14h-4z' : 'M8 5v14l11-7z'}
          />
        </svg>
      </a>
    </div>
  );
}
