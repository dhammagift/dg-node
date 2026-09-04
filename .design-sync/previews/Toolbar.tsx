import { Icon, Toolbar, ToolbarButton } from '@dhammagift/dg-ui';

/** The row above the results table, as it ships: theme, expand, words, dictionary, columns, marks. */
export const ResultsToolbar = () => (
  <Toolbar>
    <ToolbarButton label="Theme"><Icon name="circleHalfStroke" /></ToolbarButton>
    <ToolbarButton label="Expand / collapse all">Expand all</ToolbarButton>
    <ToolbarButton label="Show matched words">Words</ToolbarButton>
    <ToolbarButton label="Dictionary"><Icon name="comment" /></ToolbarButton>
    <ToolbarButton label="Multi-select"><Icon name="selectSlash" /></ToolbarButton>
    <ToolbarButton label="1 / 2 columns"><Icon name="alignRight" /></ToolbarButton>
    <ToolbarButton label="Read marks" pressed><Icon name="solidStar" /></ToolbarButton>
    <ToolbarButton label="Cattāri Ariyasaccāni"><Icon name="compass" /></ToolbarButton>
    <ToolbarButton label="Settings"><Icon name="gear" /></ToolbarButton>
    <ToolbarButton label="Help"><Icon name="question" /></ToolbarButton>
  </Toolbar>
);

/** The same row inside the reader — editions, column mode, Pali line, copy, listen. */
export const ReaderToolbar = () => (
  <Toolbar>
    <ToolbarButton label="Editions"><Icon name="book" /></ToolbarButton>
    <ToolbarButton label="Compare editions"><Icon name="codeCompareSolidFull" /></ToolbarButton>
    <ToolbarButton label="Columns" pressed><Icon name="tableColumns" /></ToolbarButton>
    <ToolbarButton label="Hide the Pali line"><Icon name="eye" /></ToolbarButton>
    <ToolbarButton label="Copy segment"><Icon name="copy" /></ToolbarButton>
    <ToolbarButton label="Open on SuttaCentral"><Icon name="openLink" /></ToolbarButton>
    <ToolbarButton label="Listen"><Icon name="volumeSolidFull" /></ToolbarButton>
    <ToolbarButton label="Bookmark"><Icon name="regularStar" /></ToolbarButton>
  </Toolbar>
);

/** Short words instead of glyphs: the reader's mode switches and the scope pills. */
export const WordPills = () => (
  <Toolbar>
    <ToolbarButton label="Russian only">Ru</ToolbarButton>
    <ToolbarButton label="Two Russian translators">R+R</ToolbarButton>
    <ToolbarButton label="Russian and English" pressed>R+E</ToolbarButton>
    <ToolbarButton label="English only">En</ToolbarButton>
    <ToolbarButton label="Mahāsaṅgīti edition">MS</ToolbarButton>
    <ToolbarButton label="Buddha Jayanthi edition">BJT</ToolbarButton>
  </Toolbar>
);

/** The row wraps rather than scrolls — here forced narrow, the way it lands on a phone. */
export const Wrapping = () => (
  <div style={{ maxWidth: 260 }}>
    <Toolbar>
      <ToolbarButton label="Theme"><Icon name="circleHalfStroke" /></ToolbarButton>
      <ToolbarButton label="Expand / collapse all">Expand all</ToolbarButton>
      <ToolbarButton label="Dictionary"><Icon name="comment" /></ToolbarButton>
      <ToolbarButton label="Read marks" pressed><Icon name="solidStar" /></ToolbarButton>
      <ToolbarButton label="Settings"><Icon name="gear" /></ToolbarButton>
      <ToolbarButton label="Help"><Icon name="question" /></ToolbarButton>
    </Toolbar>
  </div>
);
