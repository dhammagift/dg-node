import React from 'react';

// Static, non-interactive mockup of the browser extension's popup, built from
// the ACTUAL colors/shapes used in the extension's own code (dictPlugin repo,
// dictLookup-extention-*/content.js: bubble background #E1EBED / dark #07021D,
// border-radius 8px, box-shadow 0 4px 15px rgba(0,0,0,.4), close-button red
// rgba(206,5,32,.6)) — not a generic illustration, and not a real screenshot
// either (this environment can't reach a browser to take one — see the note
// under the mockup). Mirrors the spirit of <AppFrame>: show the real thing
// instead of prose, for a piece of UI that can't be iframed (it only exists
// inside an installed extension, not as a same-origin page).
export default function ExtensionMock() {
  return (
    <div
      style={{
        border: '1px solid var(--ifm-color-emphasis-300)',
        borderRadius: 8,
        padding: '1.25rem',
        background: 'var(--ifm-background-surface-color)',
        maxWidth: 420,
        margin: '1.5rem auto',
        fontFamily: 'var(--ifm-font-family-base)',
      }}
    >
      {/* fake page paragraph with a selected word */}
      <p style={{ margin: '0 0 10px', fontSize: 14, color: 'var(--ifm-font-color-base)' }}>
        ...the simile of the{' '}
        <span style={{ background: 'rgba(66,133,244,.35)', borderRadius: 2 }}>kacchapa</span>{' '}
        (tortoise) in the discourse...
      </p>

      {/* fake OS-style right-click context menu */}
      <div
        style={{
          display: 'inline-block',
          background: '#f7f7f7',
          color: '#222',
          borderRadius: 4,
          boxShadow: '0 2px 8px rgba(0,0,0,.25)',
          fontSize: 13,
          overflow: 'hidden',
          marginBottom: 14,
        }}
      >
        <div style={{ padding: '6px 14px', borderBottom: '1px solid #e2e2e2' }}>Copy</div>
        <div style={{ padding: '6px 14px', fontWeight: 600 }}>🐢 Dhamma.gift</div>
      </div>

      {/* the extension's own popup card, real colors from content.js */}
      <div
        style={{
          background: '#E1EBED',
          color: '#111',
          borderRadius: 8,
          boxShadow: '0 4px 15px rgba(0,0,0,.4)',
          padding: '10px 14px',
          fontSize: 13,
          position: 'relative',
        }}
      >
        <span
          title="close"
          style={{
            position: 'absolute',
            top: 6,
            right: 8,
            width: 16,
            height: 16,
            lineHeight: '16px',
            textAlign: 'center',
            borderRadius: '50%',
            background: 'rgba(206,5,32,.6)',
            color: '#fff',
            fontSize: 11,
            cursor: 'default',
          }}
        >
          ×
        </span>
        <strong>kacchapa</strong> <span style={{ opacity: 0.7 }}>(m.)</span>
        <div style={{ marginTop: 4 }}>tortoise — <em>DPD</em> lookup result, click any word for this on any site</div>
      </div>
    </div>
  );
}
