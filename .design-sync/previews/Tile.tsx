import type { ReactNode } from 'react';
import { Tile, TileGrid, Icon } from '@dhammagift/dg-ui';

// Dark theme is a class, not a prop: the tokens are redefined on `.dark`, and custom
// properties inherit, so putting the class on a wrapper themes everything inside it. The
// wrapper paints --dg-page itself — the card's own ground stays light otherwise.
const Dark = ({ children }: { children: ReactNode }) => (
  <div className="dark" style={{ background: 'var(--dg-page)', padding: 20 }}>
    {children}
  </div>
);

export const HomeShortcuts = () => (
  <TileGrid>
    <Tile label="Dīgha Nikāya" description="34 long discourses" icon={<Icon name="book" size={20} />} />
    <Tile label="Majjhima" description="152 middle-length discourses" icon={<Icon name="book" size={20} />} />
    <Tile label="Dhammapada" description="423 verses" icon={<Icon name="book" size={20} />} />
    <Tile label="Vinaya" description="Monastic code" icon={<Icon name="dharmachakra" size={20} />} />
  </TileGrid>
);

export const Tools = () => (
  <TileGrid>
    <Tile label="Four Noble Truths" icon={<Icon name="compass" size={20} />} />
    <Tile label="Bookmarks" icon={<Icon name="solidStar" size={20} />} />
    <Tile label="History" icon={<Icon name="clockRotateLeft" size={20} />} />
    <Tile label="Notes" icon={<Icon name="memo" size={20} />} />
  </TileGrid>
);

// A tile is always laid out by the grid — on its own it has no height to sit in and the
// caption rides the bottom edge, so even the single-tile story keeps its TileGrid.
export const Single = () => (
  <TileGrid>
    <Tile label="Saṁyutta Nikāya" description="Connected discourses" icon={<Icon name="book" size={20} />} />
  </TileGrid>
);

/** The same shortcuts in dark theme — surfaces drop to #191919, the accent disc to #12241f. */
export const DarkTheme = () => (
  <Dark>
    <TileGrid>
      <Tile label="Dīgha Nikāya" description="34 long discourses" icon={<Icon name="book" size={20} />} />
      <Tile label="Majjhima" description="152 middle-length discourses" icon={<Icon name="book" size={20} />} />
      <Tile label="Four Noble Truths" icon={<Icon name="compass" size={20} />} />
      <Tile label="Bookmarks" icon={<Icon name="solidStar" size={20} />} />
    </TileGrid>
  </Dark>
);
