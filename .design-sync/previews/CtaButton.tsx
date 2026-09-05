import type { ReactNode } from 'react';
import { CtaButton, Icon, type IconName } from '@dhammagift/dg-ui';

// Dark is a CLASS, not a prop: the tokens are redefined on `.dark` and custom properties
// inherit, so a wrapper themes everything inside it. It must paint --dg-page itself, or the
// card's own ground stays light under a correctly themed component.
const Dark = ({ children }: { children: ReactNode }) => (
  <div className="dark" style={{ background: 'var(--dg-page)', padding: 20 }}>
    {children}
  </div>
);

/**
 * The real buttons carry store-badge PNGs from /assets/img/buttons, which do not resolve
 * outside production and are not inlined into the package. This span stands in for that
 * artwork at the same 44px badge height the `.dg-cta-btn img` rule gives it.
 */
const StoreBadge = ({ icon, kicker, name }: { icon: IconName; kicker: string; name: string }) => (
  <span
    style={{
      display: 'inline-flex',
      alignItems: 'center',
      gap: 8,
      height: 44,
      padding: '0 14px',
      borderRadius: 8,
      background: 'var(--dg-navy)',
      color: '#fff',
      fontFamily: 'var(--dg-font)',
      lineHeight: 1.15,
      whiteSpace: 'nowrap',
    }}
  >
    <Icon name={icon} size={20} />
    <span style={{ display: 'inline-flex', flexDirection: 'column', textAlign: 'left' }}>
      <span style={{ fontSize: '0.56rem', letterSpacing: '0.08em', textTransform: 'uppercase', opacity: 0.72 }}>
        {kicker}
      </span>
      <span style={{ fontSize: '0.92rem', fontWeight: 600 }}>{name}</span>
    </span>
  </span>
);

// The home screen's "Apps and extensions" row, with the app's own titles and links.
export const GetTheApp = () => (
  <div className="dg-cta">
    <CtaButton title="Download from Google Play" href="https://play.google.com/store/apps/details?id=gift.dhamma.twa">
      <StoreBadge icon="dharmachakra" kicker="Get it on" name="Google Play" />
    </CtaButton>
    <CtaButton title="Download APK" href="https://github.com/dhammagift/dg-twa/releases">
      <StoreBadge icon="codeCompareSolidFull" kicker="Download the" name="APK" />
    </CtaButton>
    <CtaButton title="Open DGift_bot" href="https://t.me/dgift_bot">
      <StoreBadge icon="comment" kicker="Chat with" name="DGift_bot" />
    </CtaButton>
  </div>
);

// Same row, browser extensions — four badges wrap inside `.dg-cta`.
export const BrowserExtensions = () => (
  <div className="dg-cta">
    <CtaButton
      title="Chrome Web Store"
      href="https://chromewebstore.google.com/detail/dhammagift-search-and-wor/dnnogjdcmhbiobpnkhdbfnfjnjlikabd"
    >
      <StoreBadge icon="openLink" kicker="Available in the" name="Chrome Web Store" />
    </CtaButton>
    <CtaButton title="Firefox Add-ons" href="https://addons.mozilla.org/en-US/firefox/addon/dhamma-gift/">
      <StoreBadge icon="openLink" kicker="Get the" name="Firefox Add-on" />
    </CtaButton>
    <CtaButton
      title="Microsoft Edge Add-ons"
      href="https://microsoftedge.microsoft.com/addons/detail/dhammagift-search-and-wo/aokegkhdaijkikbdocanadeghllhfmhj"
    >
      <StoreBadge icon="openLink" kicker="Get the" name="Edge Add-on" />
    </CtaButton>
    <CtaButton title="Opera Add-ons" href="https://addons.opera.com/en/extensions/details/dhammagift/">
      <StoreBadge icon="openLink" kicker="Get the" name="Opera Add-on" />
    </CtaButton>
  </div>
);

// One badge on its own — `title` is the action, not the vendor.
export const InstallAsApp = () => (
  <CtaButton title="Install Dhamma.gift as progressive web app" href="#install">
    <StoreBadge icon="tableColumns" kicker="Install as" name="Web App" />
  </CtaButton>
);

/**
 * The apps row in dark theme — the `.dg-cta-btn` frames take the dark border and surface, and
 * the badge stand-in follows --dg-navy down to #1b2836 the way the real PNG's ground would not.
 */
export const DarkTheme = () => (
  <Dark>
    <div className="dg-cta">
      <CtaButton title="Download from Google Play" href="https://play.google.com/store/apps/details?id=gift.dhamma.twa">
        <StoreBadge icon="dharmachakra" kicker="Get it on" name="Google Play" />
      </CtaButton>
      <CtaButton title="Download APK" href="https://github.com/dhammagift/dg-twa/releases">
        <StoreBadge icon="codeCompareSolidFull" kicker="Download the" name="APK" />
      </CtaButton>
      <CtaButton title="Open DGift_bot" href="https://t.me/dgift_bot">
        <StoreBadge icon="comment" kicker="Chat with" name="DGift_bot" />
      </CtaButton>
    </div>
  </Dark>
);
