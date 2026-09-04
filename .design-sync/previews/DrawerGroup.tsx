import type { ReactNode } from 'react';
import { Drawer, DrawerGroup, DrawerRow, Segmented, Brand, Icon } from '@dhammagift/dg-ui';

// Groups are shown in the drawer they belong to — it carries its own panel surface.
// A fixed-position overlay needs a containing block with a real height. The preview card's
// root carries `transform: translateZ(0)` and, with only the out-of-flow panel inside it,
// measures 0px tall — the drawer then computes `height: 0` from its own `top/bottom` and
// clips itself away. This stage is that missing viewport, nothing more: page ground, a
// height, and the transform that makes it the containing block.
const Stage = ({ children, height = 560 }: { children: ReactNode; height?: number }) => (
  <div style={{
    position: 'relative',
    height,
    transform: 'translateZ(0)',
    overflow: 'hidden',
    background: 'var(--dg-page)',
  }}>
    {children}
  </div>
);

const Menu = ({ children }: { children: ReactNode }) => (
  <Stage height={400}>
    <Drawer backdrop={false} head={<Brand />}>{children}</Drawer>
  </Stage>
);

export const Open = () => (
  <Menu>
    <DrawerGroup title="Navigation" open>
      <DrawerRow href="/" icon={<Icon name="dharmachakra" className="dg-row-ic" />}>Home</DrawerRow>
      <DrawerRow icon={<Icon name="compass" className="dg-row-ic" />}>Four Noble Truths</DrawerRow>
      <DrawerRow icon={<Icon name="linkSolidFull" className="dg-row-ic" />}>Links</DrawerRow>
      <DrawerRow icon={<Icon name="comment" className="dg-row-ic" />}>Contacts</DrawerRow>
      <DrawerRow href="/login" icon={<Icon name="openLink" className="dg-row-ic" />}>Login</DrawerRow>
    </DrawerGroup>
  </Menu>
);

export const Collapsed = () => (
  <Menu>
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
  </Menu>
);

export const PlainHeading = () => (
  <Menu>
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
  </Menu>
);
