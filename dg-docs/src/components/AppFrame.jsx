import React from 'react';
import useDocusaurusContext from '@docusaurus/useDocusaurusContext';

// Embeds a live page of the real dhamma.gift app (same origin as this docs
// site once published under siteroot/) instead of a static screenshot or a
// hand-built React clone of the UI. `src` must be a relative, same-origin
// path so it works unchanged on localhost, test.dhamma.gift and dhamma.gift,
// and so theme (localStorage 'theme') stays in sync automatically.
//
// Owner: "добавить ярлычок открыть в новом окне, чтобы можно было зайти
// попробовать полностью" — an iframe this small/short can't show everything
// the real page does (a phone-width sheet, a hover state, a second monitor
// for side-by-side reading...), so every embed gets a same-origin "open in a
// new window" link. Placed ABOVE the frame, not as a corner overlay on top of
// it — these embeds show the real app UI (search bar, reader corner pill,
// settings toggles...), and an overlay badge risks sitting right on top of
// some real control depending on which page `src` points at.
export default function AppFrame({src, title, height = 600}) {
  const {i18n} = useDocusaurusContext();
  const isRu = i18n.currentLocale === 'ru';
  return (
    <div style={{marginBottom: '1rem'}}>
      <div style={{display: 'flex', justifyContent: 'flex-end', marginBottom: 6}}>
        <a
          href={src}
          target="_blank"
          rel="noopener noreferrer"
          style={{
            display: 'inline-flex',
            alignItems: 'center',
            gap: 4,
            fontSize: '0.8rem',
            color: 'var(--ifm-color-emphasis-700)',
            textDecoration: 'none',
          }}
        >
          <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
            <path d="M18 13v6a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V8a2 2 0 0 1 2-2h6" />
            <polyline points="15 3 21 3 21 9" />
            <line x1="10" y1="14" x2="21" y2="3" />
          </svg>
          {isRu ? 'Открыть в новом окне' : 'Open in a new window'}
        </a>
      </div>
      <iframe
        src={src}
        title={title}
        loading="lazy"
        style={{
          width: '100%',
          height,
          border: '1px solid var(--ifm-color-emphasis-300)',
          borderRadius: 8,
        }}
      />
    </div>
  );
}
