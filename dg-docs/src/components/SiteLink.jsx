import React from 'react';
import Link from '@docusaurus/Link';

// For links to the main app's own routes (the live reader `/an3.65:4.1`, `/read/?q=...`,
// `/r/?q=...`, `/api-docs/`, `/#contacts`, the other locale's docs build `/ru/docs/...`) —
// these live at the SITE ROOT, not under this docs build's own baseUrl (`/docs/` or
// `/ru/docs/`), and must resolve on whatever domain currently serves the page (prod, test,
// or a future mirror) — never a hardcoded one.
//
// Docusaurus's own <Link>/markdown links always (a) prepend this docs build's baseUrl to
// any path starting with "/" and (b) validate it against this build's own page list
// (`onBrokenLinks: 'throw'`) — both wrong for a path that belongs to a sibling route, not a
// docs page. The `pathname://` prefix is Docusaurus's documented escape hatch: it makes
// <Link> treat the target as non-internal (skips both baseUrl-prefixing and the broken-link
// check) and render a plain full-navigation <a>, same as any other external link.
export default function SiteLink({ to, children, ...props }) {
  return (
    <Link to={`pathname://${to}`} autoAddBaseUrl={false} {...props}>
      {children}
    </Link>
  );
}
