import type { ReactNode } from 'react';
import { Drawer, DrawerRow, Icon } from '@dhammagift/dg-ui';

// Rows are shown in the drawer they belong to — the panel frame (`#dg-drawer` in the app)
// is supplied here with --dg-* tokens.
const Panel = ({ children }: { children: ReactNode }) => (
  <div style={{
    width: 320,
    background: 'var(--dg-surface)',
    color: 'var(--dg-text)',
    fontFamily: 'var(--dg-font)',
    border: '1px solid var(--dg-border-strong)',
    borderRadius: 'var(--dg-radius)',
    overflow: 'hidden',
  }}>
    <Drawer backdrop={false} className="dg-drawer-body">{children}</Drawer>
  </div>
);

export const Navigation = () => (
  <Panel>
    <DrawerRow href="/" icon={<Icon name="dharmachakra" className="dg-row-ic" />}>Home</DrawerRow>
    <DrawerRow icon={<Icon name="compass" className="dg-row-ic" />}>Four Noble Truths</DrawerRow>
    <DrawerRow href="/assets/common/keyFeatures.html" icon={<Icon name="question" className="dg-row-ic" />}>About</DrawerRow>
    <DrawerRow icon={<Icon name="linkSolidFull" className="dg-row-ic" />}>Links</DrawerRow>
    <DrawerRow icon={<Icon name="comment" className="dg-row-ic" />}>Contacts</DrawerRow>
  </Panel>
);

export const WithoutIcon = () => (
  <Panel>
    <DrawerRow href="/docs/key-features">Help</DrawerRow>
    <DrawerRow href="/login">Login</DrawerRow>
    <DrawerRow href="/settings/">Settings</DrawerRow>
  </Panel>
);

export const Actions = () => (
  <Panel>
    <DrawerRow icon={<Icon name="star" className="dg-row-ic" />} onClick={() => {}}>Add a button</DrawerRow>
    <DrawerRow icon={<Icon name="gear" className="dg-row-ic" />} onClick={() => {}}>Edit buttons</DrawerRow>
    <DrawerRow icon={<Icon name="rotateSolidFull" className="dg-row-ic" />} onClick={() => {}}>Restore buttons</DrawerRow>
    <DrawerRow icon={<Icon name="clockRotateLeft" className="dg-row-ic" />} onClick={() => {}}>History</DrawerRow>
  </Panel>
);
