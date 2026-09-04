import { Tile, TileGrid, Icon } from '@dhammagift/dg-ui';

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
