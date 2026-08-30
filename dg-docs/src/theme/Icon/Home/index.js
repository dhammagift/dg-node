import React from 'react';
import useBaseUrl from '@docusaurus/useBaseUrl';
// Shell (shankha), not a house — owner's convention, same mark as the navbar logo
// (docusaurus.config.js) and the main app's own "home" icon (search/index.html).
export default function IconHome(props) {
  const src = useBaseUrl('img/dgsankhaonly.png');
  return <img src={src} alt="" {...props} />;
}
