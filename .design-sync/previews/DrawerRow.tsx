import type { ReactNode } from 'react';
import { Drawer, DrawerRow, Brand, Icon } from '@dhammagift/dg-ui';

// Rows are shown in the drawer they belong to — it carries its own panel surface.
// A fixed-position overlay needs a containing block with a real height. The preview card's
// root carries `transform: translateZ(0)` and, with only the out-of-flow panel inside it,
// measures 0px tall — the drawer then computes `height: 0` from its own `top/bottom` and
// clips itself away. This stage is that missing viewport, nothing more: page ground, a
// height, and the transform that makes it the containing block.
const Stage = ({ children, height = 560, className }: { children: ReactNode; height?: number; className?: string }) => (
  <div className={className} style={{
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
  <Stage height={340}>
    <Drawer backdrop={false} head={<Brand />}>{children}</Drawer>
  </Stage>
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

/**
 * Rows in dark theme. `.dark` goes on the Stage — it already paints `var(--dg-page)`, so the
 * page ground, the drawer surface and the row hover/divider tokens all flip together.
 */
export const DarkTheme = () => (
  <Stage className="dark" height={400}>
    <Drawer backdrop={false} head={<Brand />}>
      <DrawerRow href="/" icon={<Icon name="dharmachakra" className="dg-row-ic" />}>Home</DrawerRow>
      <DrawerRow icon={<Icon name="compass" className="dg-row-ic" />}>Four Noble Truths</DrawerRow>
      <DrawerRow icon={<Icon name="clockRotateLeft" className="dg-row-ic" />}>History</DrawerRow>
      <DrawerRow href="/settings/" icon={<Icon name="gear" className="dg-row-ic" />}>Settings</DrawerRow>
      <DrawerRow href="/login" icon={<Icon name="openLink" className="dg-row-ic" />}>Login</DrawerRow>
    </Drawer>
  </Stage>
);
