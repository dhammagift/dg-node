import type { ReactNode } from 'react';
import { Drawer, DrawerGroup, DrawerRow, Segmented, Icon } from '@dhammagift/dg-ui';

// The panel frame (`#dg-drawer` in the app) is supplied here with --dg-* tokens; the group
// itself is what these stories vary.
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

export const Open = () => (
  <Panel>
    <DrawerGroup title="Navigation" open>
      <DrawerRow href="/" icon={<Icon name="dharmachakra" className="dg-row-ic" />}>Home</DrawerRow>
      <DrawerRow icon={<Icon name="compass" className="dg-row-ic" />}>Four Noble Truths</DrawerRow>
      <DrawerRow icon={<Icon name="linkSolidFull" className="dg-row-ic" />}>Links</DrawerRow>
      <DrawerRow icon={<Icon name="comment" className="dg-row-ic" />}>Contacts</DrawerRow>
      <DrawerRow href="/login" icon={<Icon name="openLink" className="dg-row-ic" />}>Login</DrawerRow>
    </DrawerGroup>
  </Panel>
);

export const Collapsed = () => (
  <Panel>
    <DrawerGroup title="Navigation" open={false}>
      <DrawerRow href="/" icon={<Icon name="dharmachakra" className="dg-row-ic" />}>Home</DrawerRow>
      <DrawerRow icon={<Icon name="compass" className="dg-row-ic" />}>Four Noble Truths</DrawerRow>
    </DrawerGroup>
    <DrawerGroup title="Reading modes" open>
      <DrawerRow icon={<Icon name="alignLeft" className="dg-row-ic" />}>Single</DrawerRow>
      <DrawerRow icon={<Icon name="tableColumns" className="dg-row-ic" />}>Multi Translators</DrawerRow>
      <DrawerRow icon={<Icon name="codeCompareSolidFull" className="dg-row-ic" />}>Multi Language</DrawerRow>
      <DrawerRow icon={<Icon name="eyeSlash" className="dg-row-ic" />}>Memorize</DrawerRow>
    </DrawerGroup>
  </Panel>
);

export const PlainHeading = () => (
  <Panel>
    <DrawerGroup title="Settings" collapsible={false}>
      <Segmented value="en" options={[{ value: 'ru', label: 'RU' }, { value: 'en', label: 'EN' }]} />
      <Segmented
        value="light"
        options={[
          { value: 'light', label: 'Light', icon: <Icon name="sun" size={13} /> },
          { value: 'dark', label: 'Dark', icon: <Icon name="moon" size={13} /> },
        ]}
      />
      <DrawerRow href="/settings/" icon={<Icon name="gear" className="dg-row-ic" />}>Settings</DrawerRow>
    </DrawerGroup>
  </Panel>
);
