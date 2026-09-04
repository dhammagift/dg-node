import type { ReactNode } from 'react';
import { Drawer, DrawerRow, Brand, Icon } from '@dhammagift/dg-ui';

// Rows are shown in the drawer they belong to — it carries its own panel surface.
const Menu = ({ children }: { children: ReactNode }) => (
  <Drawer backdrop={false} head={<Brand />}>{children}</Drawer>
);

export const Navigation = () => (
  <Menu>
    <DrawerRow href="/" icon={<Icon name="dharmachakra" className="dg-row-ic" />}>Home</DrawerRow>
    <DrawerRow icon={<Icon name="compass" className="dg-row-ic" />}>Four Noble Truths</DrawerRow>
    <DrawerRow href="/assets/common/keyFeatures.html" icon={<Icon name="question" className="dg-row-ic" />}>About</DrawerRow>
    <DrawerRow icon={<Icon name="linkSolidFull" className="dg-row-ic" />}>Links</DrawerRow>
    <DrawerRow icon={<Icon name="comment" className="dg-row-ic" />}>Contacts</DrawerRow>
  </Menu>
);

export const WithoutIcon = () => (
  <Menu>
    <DrawerRow href="/docs/key-features">Help</DrawerRow>
    <DrawerRow href="/login">Login</DrawerRow>
    <DrawerRow href="/settings/">Settings</DrawerRow>
  </Menu>
);

export const Actions = () => (
  <Menu>
    <DrawerRow icon={<Icon name="star" className="dg-row-ic" />} onClick={() => {}}>Add a button</DrawerRow>
    <DrawerRow icon={<Icon name="gear" className="dg-row-ic" />} onClick={() => {}}>Edit buttons</DrawerRow>
    <DrawerRow icon={<Icon name="rotateSolidFull" className="dg-row-ic" />} onClick={() => {}}>Restore buttons</DrawerRow>
    <DrawerRow icon={<Icon name="clockRotateLeft" className="dg-row-ic" />} onClick={() => {}}>History</DrawerRow>
  </Menu>
);
