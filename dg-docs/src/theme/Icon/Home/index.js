import React from 'react';
import useBaseUrl from '@docusaurus/useBaseUrl';
// Diamond mark, same as the navbar logo (docusaurus.config.js) — kept in sync so this
// breadcrumb "home" icon and the navbar logo always match.
export default function IconHome(props) {
  const src = useBaseUrl('img/diamond-logo.png');
  return <img src={src} alt="" {...props} />;
}
