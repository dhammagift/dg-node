import type { ReactNode } from 'react';
import { Drawer, DrawerGroup, DrawerRow, Segmented, Icon } from '@dhammagift/dg-ui';

// The app's drawer is a fixed 320px panel (`#dg-drawer`); the library ships the panel's
// contents, so the stories supply that frame with --dg-* tokens and hand `Drawer` the
// `dg-drawer-body` class the live markup puts on its <nav>.
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
    {children}
  </div>
);

export const Full = () => (
  <Panel>
    <Drawer backdrop={false} className="dg-drawer-body">
      <DrawerGroup title="Navigation">
        <DrawerRow href="/" icon={<Icon name="dharmachakra" className="dg-row-ic" />}>Home</DrawerRow>
        <DrawerRow icon={<Icon name="compass" className="dg-row-ic" />}>Four Noble Truths</DrawerRow>
        <DrawerRow href="/assets/common/keyFeatures.html" icon={<Icon name="question" className="dg-row-ic" />}>About</DrawerRow>
        <DrawerRow icon={<Icon name="linkSolidFull" className="dg-row-ic" />}>Links</DrawerRow>
        <DrawerRow icon={<Icon name="comment" className="dg-row-ic" />}>Contacts</DrawerRow>
        <DrawerRow href="/docs/key-features" icon={<Icon name="question" className="dg-row-ic" />}>Help</DrawerRow>
        <DrawerRow href="/login" icon={<Icon name="openLink" className="dg-row-ic" />}>Login</DrawerRow>
      </DrawerGroup>
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
    </Drawer>
  </Panel>
);

export const ReaderState = () => (
  <Panel>
    <Drawer backdrop={false} className="dg-drawer-body">
      <DrawerGroup title="Reading modes" collapsible={false}>
        <DrawerRow icon={<Icon name="alignLeft" className="dg-row-ic" />}>Single</DrawerRow>
        <DrawerRow icon={<Icon name="tableColumns" className="dg-row-ic" />}>Multi Translators</DrawerRow>
        <DrawerRow icon={<Icon name="codeCompareSolidFull" className="dg-row-ic" />}>Multi Language</DrawerRow>
        <DrawerRow icon={<Icon name="eyeSlash" className="dg-row-ic" />}>Memorize</DrawerRow>
        <DrawerRow icon={<Icon name="book" className="dg-row-ic" />}>Devanagari</DrawerRow>
      </DrawerGroup>
      <DrawerGroup title="Navigation" open={false}>
        <DrawerRow href="/" icon={<Icon name="dharmachakra" className="dg-row-ic" />}>Home</DrawerRow>
        <DrawerRow icon={<Icon name="compass" className="dg-row-ic" />}>Four Noble Truths</DrawerRow>
      </DrawerGroup>
    </Drawer>
  </Panel>
);

export const Dark = () => (
  <div data-theme="dark" style={{ background: 'var(--dg-page)', padding: 16, display: 'inline-block' }}>
    <Panel>
      <Drawer backdrop={false} className="dg-drawer-body">
        <DrawerGroup title="Navigation">
          <DrawerRow href="/" icon={<Icon name="dharmachakra" className="dg-row-ic" />}>Home</DrawerRow>
          <DrawerRow icon={<Icon name="compass" className="dg-row-ic" />}>Four Noble Truths</DrawerRow>
          <DrawerRow icon={<Icon name="linkSolidFull" className="dg-row-ic" />}>Links</DrawerRow>
          <DrawerRow href="/login" icon={<Icon name="openLink" className="dg-row-ic" />}>Login</DrawerRow>
        </DrawerGroup>
        <DrawerGroup title="Settings" collapsible={false}>
          <Segmented
            value="dark"
            options={[
              { value: 'light', label: 'Light', icon: <Icon name="sun" size={13} /> },
              { value: 'dark', label: 'Dark', icon: <Icon name="moon" size={13} /> },
            ]}
          />
          <DrawerRow href="/settings/" icon={<Icon name="gear" className="dg-row-ic" />}>Settings</DrawerRow>
        </DrawerGroup>
      </Drawer>
    </Panel>
  </div>
);
