import React from 'react';

// Inline pointer placed right next to a principle's citation in sutta.md — selects that
// sutta in the single shared <SuttaBrowser/> further down the page and scrolls it into
// view, instead of repeating the same citation a second time as a separate list of cards
// (owner: "получается два раза одно и то же").
export default function SuttaLink({ index, children = 'Читать →' }) {
  return (
    <a
      href="#sutta-reader"
      onClick={(e) => {
        e.preventDefault();
        window.dispatchEvent(new CustomEvent('dg:selectSutta', { detail: { index } }));
      }}
      style={{ cursor: 'pointer', whiteSpace: 'nowrap', fontSize: '0.9em' }}
    >
      {children}
    </a>
  );
}
