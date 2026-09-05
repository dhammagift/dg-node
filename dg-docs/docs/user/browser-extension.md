---
slug: /browser-extension
sidebar_position: 15
---

import ExtensionMock from '@site/src/components/ExtensionMock';

# Browser extension

Search the Suttas and look words up in the Pali Digital Dictionary (DPD)
on any website: select a word or phrase (or just click on a word) and the
extension shows the translation/dictionary entry right there, without
leaving the page — or sends the selected text to search on Dhamma.gift
via the right-click context menu. Toggle it on/off by clicking the
extension's icon or with a keyboard shortcut (`Ctrl+Shift+L` by default,
changeable in your browser's settings).

<div style={{display: 'flex', flexWrap: 'wrap', gap: '12px', alignItems: 'center', margin: '1rem 0'}}>
  <a href="https://chromewebstore.google.com/detail/dhammagift-search-and-wor/dnnogjdcmhbiobpnkhdbfnfjnjlikabd"><img src="/assets/img/buttons/chrome-cta.png" alt="Chrome Web Store" style={{maxWidth: '180px'}} /></a>
  <a href="https://addons.mozilla.org/en-US/firefox/addon/dhamma-gift/"><img src="/assets/img/buttons/firefox-cta.png" alt="Firefox Add-ons" style={{maxWidth: '180px'}} /></a>
  <a href="https://microsoftedge.microsoft.com/addons/detail/dhammagift-search-and-wo/aokegkhdaijkikbdocanadeghllhfmhj"><img src="/assets/img/buttons/edge-cta.png" alt="Microsoft Edge Store" style={{maxWidth: '180px'}} /></a>
  <a href="https://chromewebstore.google.com/detail/dhammagift-search-and-wor/dnnogjdcmhbiobpnkhdbfnfjnjlikabd"><img src="/assets/img/buttons/opera-cta.png" alt="Opera Add-ons" style={{maxWidth: '180px'}} /></a>
</div>

Tampermonkey script (also works on Safari, which has no extensions of its
own): [installation instructions](https://github.com/dhammagift/dictPlugin/blob/main/ExtentionMethod.md).
The pop-up dictionary plugin can be embedded on any website — [details here](https://github.com/dhammagift/dictPlugin?tab=readme-ov-file#dictplugin).

<ExtensionMock />

:::note[Mock-up, not a screenshot]
The pop-up above isn't a real screenshot of the extension (an extension
can't be embedded as an `<iframe>`, unlike the other examples in this
docs section) — it's a mock-up built from the extension's own real
colors and look (`dictPlugin/.../content.js`: background `#E1EBED`/
`#07021D`, `border-radius: 8px`, red close button
`rgba(206,5,32,...)`). A real screenshot can replace it at any time.
:::
