import React from 'react';

// Embeds a live page of the real dhamma.gift app (same origin as this docs
// site once published under siteroot/) instead of a static screenshot or a
// hand-built React clone of the UI. `src` must be a relative, same-origin
// path so it works unchanged on localhost, test.dhamma.gift and dhamma.gift,
// and so theme (localStorage 'theme') stays in sync automatically.
export default function AppFrame({src, title, height = 600}) {
  return (
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
  );
}
