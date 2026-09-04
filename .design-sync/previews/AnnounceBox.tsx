import type { ReactNode } from 'react';
import { AnnounceBox } from '@dhammagift/dg-ui';

/**
 * The band never appears on white: it lives over the home screen's navy→teal hero gradient
 * (#dg-hero-band), which is what its translucent white fill and #fff text are cut for.
 */
const HeroBand = ({ children }: { children: ReactNode }) => (
  <div
    style={{
      background: 'linear-gradient(165deg, var(--dg-navy) 0%, var(--dg-navy) 38%, var(--dg-accent-dark) 100%)',
      padding: '22px 16px',
      borderRadius: 12,
      display: 'flex',
      justifyContent: 'center',
    }}
  >
    {children}
  </div>
);

// The notice the site is actually serving (configs/search/announcements.json).
export const Beta = () => (
  <HeroBand>
    <AnnounceBox>
      🎉New Version🎉 Still in beta. The old one lives at <a href="https://old.dhamma.gift">old.dhamma.gift</a>
    </AnnounceBox>
  </HeroBand>
);

// Same announcement in Russian — the band carries whichever locale the visitor picked.
export const Russian = () => (
  <HeroBand>
    <AnnounceBox>
      🎉Новая Версия🎉 Пока Бета. Старая версия на <a href="https://old.dhamma.gift">old.dhamma.gift</a>
    </AnnounceBox>
  </HeroBand>
);

// A feature note, short enough for one line — the shape the band is sized for.
export const FeatureNote = () => (
  <HeroBand>
    <AnnounceBox>New: Devanagari reading mode for the Pāḷi column</AnnounceBox>
  </HeroBand>
);

// dismissible={false} drops the close button: nothing to dismiss, so the row is text only.
export const Persistent = () => (
  <HeroBand>
    <AnnounceBox dismissible={false}>Maintenance 14 Sep, 02:00–03:00 UTC — search may be slow</AnnounceBox>
  </HeroBand>
);
