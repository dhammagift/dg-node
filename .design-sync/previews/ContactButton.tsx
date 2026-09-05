import type { ReactNode } from 'react';
import { ContactButton, Icon } from '@dhammagift/dg-ui';

// Dark is a CLASS, not a prop: the tokens are redefined on `.dark` and custom properties
// inherit, so a wrapper themes everything inside it. It must paint --dg-page itself, or the
// card's own ground stays light under a correctly themed component.
const Dark = ({ children }: { children: ReactNode }) => (
  <div className="dark" style={{ background: 'var(--dg-page)', padding: 20 }}>
    {children}
  </div>
);

// The home screen's contacts row, with the project's real channels.
export const Contacts = () => (
  <div className="dg-contacts">
    <ContactButton title="GitHub" href="https://github.com/dhammagift/dg#readme">
      <Icon name="codeCompareSolidFull" />
    </ContactButton>
    <ContactButton title="E-mail" href="mailto:agiftofdhamma@gmail.com">
      <Icon name="memo" />
    </ContactButton>
    <ContactButton title="YouTube" href="https://m.youtube.com/channel/UCoyL5T0wMubqrj4OnKVOlMw">
      <Icon name="play" />
    </ContactButton>
    <ContactButton title="Telegram" href="https://t.me/dhamma_gift">
      <Icon name="comment" />
    </ContactButton>
  </div>
);

// How the row actually ships: the motto sits above it (`.dg-contacts-motto`).
export const WithMotto = () => (
  <div>
    <p className="dg-contacts-motto">Find the Truth</p>
    <div className="dg-contacts">
      <ContactButton title="Telegram" href="https://t.me/dhamma_gift">
        <Icon name="comment" />
      </ContactButton>
      <ContactButton title="GitHub" href="https://github.com/dhammagift/dg#readme">
        <Icon name="codeCompareSolidFull" />
      </ContactButton>
      <ContactButton title="E-mail" href="mailto:agiftofdhamma@gmail.com">
        <Icon name="memo" />
      </ContactButton>
    </div>
  </div>
);

// A mailto stays in the tab — the one case the component drops target/rel.
export const Mail = () => (
  <ContactButton title="E-mail" href="mailto:agiftofdhamma@gmail.com">
    <Icon name="memo" />
  </ContactButton>
);

// Two links out to the wider project: the help page and the legacy site.
export const Elsewhere = () => (
  <div className="dg-contacts">
    <ContactButton title="Help" href="https://dhamma.gift/help">
      <Icon name="question" />
    </ContactButton>
    <ContactButton title="old.dhamma.gift" href="https://old.dhamma.gift">
      <Icon name="openLink" />
    </ContactButton>
  </div>
);

/** The contacts row in dark theme — round frames on #191919, motto ink at --dg-text-2. */
export const DarkTheme = () => (
  <Dark>
    <div>
      <p className="dg-contacts-motto">Find the Truth</p>
      <div className="dg-contacts">
        <ContactButton title="GitHub" href="https://github.com/dhammagift/dg#readme">
          <Icon name="codeCompareSolidFull" />
        </ContactButton>
        <ContactButton title="E-mail" href="mailto:agiftofdhamma@gmail.com">
          <Icon name="memo" />
        </ContactButton>
        <ContactButton title="YouTube" href="https://m.youtube.com/channel/UCoyL5T0wMubqrj4OnKVOlMw">
          <Icon name="play" />
        </ContactButton>
        <ContactButton title="Telegram" href="https://t.me/dhamma_gift">
          <Icon name="comment" />
        </ContactButton>
      </div>
    </div>
  </Dark>
);
