import React, {useEffect, useRef, useState} from 'react';
import useDocusaurusContext from '@docusaurus/useDocusaurusContext';

// Embeds a live page of the real dhamma.gift app (same origin as this docs
// site once published under siteroot/) instead of a static screenshot or a
// hand-built React clone of the UI. `src` must be a relative, same-origin
// path so it works unchanged on localhost, test.dhamma.gift and dhamma.gift,
// and so theme (localStorage 'theme') stays in sync automatically.
//
// Owner: "добавить ярлычок открыть в новом окне" + "показывать красиво не
// сразу, а при взаимодействии с айфреймом — тапом или ховером". The link is
// a pill sitting ON the frame's top border (half outside), so even when shown
// it barely covers the embedded app's own controls. Revealed by :hover on the
// wrapper (mouse over the iframe counts) and by .is-active after a tap/click
// inside the iframe (:focus-within does NOT match when focus is inside an
// iframe, checked in Chromium). Styles: src/css/custom.css.
export default function AppFrame({src, title, height = 600}) {
  const {i18n} = useDocusaurusContext();
  const isRu = i18n.currentLocale === 'ru';
  const frameRef = useRef(null);
  const [active, setActive] = useState(false);
  useEffect(() => {
    // A tap inside the iframe never reaches this document, and window blur is
    // unreliable (embedded pages like /dict autofocus on load, so the window is
    // already blurred before the tap). `src` is same-origin, so listen inside
    // the frame itself; re-attach on every load (in-frame navigation makes a
    // new window). A tap anywhere on the docs page hides the pill again.
    const frame = frameRef.current;
    const on = () => setActive(true);
    const off = () => setActive(false);
    const attach = () => {
      try { frame.contentWindow.addEventListener('pointerdown', on); } catch (e) { /* cross-origin: hover only */ }
    };
    attach();
    frame.addEventListener('load', attach);
    document.addEventListener('pointerdown', off);
    return () => {
      frame.removeEventListener('load', attach);
      document.removeEventListener('pointerdown', off);
      try { frame.contentWindow.removeEventListener('pointerdown', on); } catch (e) { /* ignore */ }
    };
  }, []);
  return (
    <div className={active ? 'dg-appframe is-active' : 'dg-appframe'}>
      <a className="dg-appframe__open" href={src} target="_blank" rel="noopener noreferrer">
        <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
          <path d="M18 13v6a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V8a2 2 0 0 1 2-2h6" />
          <polyline points="15 3 21 3 21 9" />
          <line x1="10" y1="14" x2="21" y2="3" />
        </svg>
        {isRu ? 'Открыть в новом окне' : 'Open in a new window'}
      </a>
      <iframe ref={frameRef} src={src} title={title} loading="lazy" style={{height}} />
    </div>
  );
}
