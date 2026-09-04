import { Tile, TileGrid, Icon } from '@dhammagift/dg-ui';

// The doc's own pairing: two tiles is the smallest grid the home screen ever draws.
export const Shortcuts = () => (
  <TileGrid>
    <Tile label="Suttas" description="Search the four Nikāyas" icon={<Icon name="book" size={20} />} />
    <Tile label="Vinaya" description="Monastic code" icon={<Icon name="dharmachakra" size={20} />} />
  </TileGrid>
);

// The set the app actually ships (configs/search/menu-links.json, `en`).
export const HomeScreen = () => (
  <TileGrid>
    <Tile label="Read Pāḷi" description="Table of contents" icon={<Icon name="book" size={20} />} />
    <Tile label="History" description="Recently read suttas" icon={<Icon name="clockRotateLeft" size={20} />} />
    <Tile label="Help" description="How search works" icon={<Icon name="question" size={20} />} />
    <Tile label="External" description="SuttaCentral, Access to Insight" icon={<Icon name="openLink" size={20} />} />
    <Tile label="AI & Dicts" description="Pāḷi dictionaries" icon={<Icon name="memo" size={20} />} />
    <Tile label="Materials" description="Courses and study guides" icon={<Icon name="listUlSolidFull" size={20} />} />
    <Tile label="Tools" description="Compare editions, export" icon={<Icon name="gear" size={20} />} />
    <Tile label="Four Noble Truths" description="Compass through the canon" icon={<Icon name="compass" size={20} />} />
  </TileGrid>
);

// An empty grid is not a bug: it holds the home screen's height and shimmers while
// menu-links.json is still in flight (`.dg-tiles:empty`).
export const Loading = () => <TileGrid>{null}</TileGrid>;
