import type { ReactNode } from 'react';
import { Tile, TileGrid, Icon } from '@dhammagift/dg-ui';

// Dark is a CLASS, not a prop: the tokens are redefined on `.dark` and custom properties
// inherit, so a wrapper themes everything inside it. It must paint --dg-page itself, or the
// card's own ground stays light under a correctly themed component.
const Dark = ({ children }: { children: ReactNode }) => (
  <div className="dark" style={{ background: 'var(--dg-page)', padding: 20 }}>
    {children}
  </div>
);

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

// Exactly one row: at >=576px the grid is four columns, so four tiles fill it without wrapping.
export const Nikayas = () => (
  <TileGrid>
    <Tile label="Dīgha" description="34 long discourses" icon={<Icon name="book" size={20} />} />
    <Tile label="Majjhima" description="152 middle-length discourses" icon={<Icon name="book" size={20} />} />
    <Tile label="Saṁyutta" description="Connected discourses" icon={<Icon name="book" size={20} />} />
    <Tile label="Aṅguttara" description="Numbered discourses" icon={<Icon name="book" size={20} />} />
  </TileGrid>
);

/** The home-screen grid in dark theme — tile surfaces drop to #191919, accent discs to #12241f. */
export const DarkTheme = () => (
  <Dark>
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
  </Dark>
);
