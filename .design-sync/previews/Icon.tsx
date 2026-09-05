import { Icon } from '@dhammagift/dg-ui';

// Local helpers — not exported, so they do not become card cells. The gallery framing is
// plain layout only; every glyph below is the app's own shipped artwork, inlined by Icon.
const grid = {
  display: 'flex',
  flexWrap: 'wrap',
  gap: '20px 8px',
  maxWidth: 800,
  fontFamily: 'var(--dg-font)',
  color: 'var(--dg-text)',
};
const cell = {
  display: 'flex',
  flexDirection: 'column',
  alignItems: 'center',
  justifyContent: 'flex-end',
  gap: 8,
  width: 96,
};
const caption = {
  fontSize: 11,
  lineHeight: 1.25,
  textAlign: 'center',
  color: 'var(--dg-text-muted)',
  wordBreak: 'break-word',
};

function Glyph({ name, size = 22, note }) {
  return (
    <span style={cell}>
      <Icon name={name} size={size} title={name} />
      <span style={caption}>{note ?? name}</span>
    </span>
  );
}

/** The glyphs the results toolbar carries above a search for `kacchapa`. */
export const ToolbarGlyphs = () => (
  <div style={grid}>
    <Glyph name="circleHalfStroke" />
    <Glyph name="comment" />
    <Glyph name="commentSlash" />
    <Glyph name="select" />
    <Glyph name="selectSlash" />
    <Glyph name="alignRight" />
    <Glyph name="alignLeft" />
    <Glyph name="solidStar" />
    <Glyph name="regularStar" />
    <Glyph name="star" />
    <Glyph name="starBlack" />
    <Glyph name="compass" />
    <Glyph name="gear" />
    <Glyph name="question" />
    <Glyph name="listUlSolidFull" />
  </div>
);

/** Reader-side glyphs: editions, columns, notes, copying and outbound links. */
export const ReaderGlyphs = () => (
  <div style={grid}>
    <Glyph name="book" />
    <Glyph name="dharmachakra" />
    <Glyph name="tableColumns" />
    <Glyph name="codeCompareSolidFull" />
    <Glyph name="memo" />
    <Glyph name="memoBlack" />
    <Glyph name="copy" />
    <Glyph name="openLink" />
    <Glyph name="linkSolidFull" />
    <Glyph name="pdf" />
    <Glyph name="eye" />
    <Glyph name="eyeSlash" />
    <Glyph name="clockRotateLeft" />
    <Glyph name="dgLogoDark" />
  </div>
);

/** The legacy TTS player's transport row, plus the theme and scroll glyphs. */
export const PlayerGlyphs = () => (
  <div style={grid}>
    <Glyph name="backwardStep" />
    <Glyph name="play" />
    <Glyph name="playGrey" />
    <Glyph name="pauseGrey" />
    <Glyph name="forwardStep" />
    <Glyph name="volumeSolidFull" />
    <Glyph name="rotateSolidFull" />
    <Glyph name="rotateRightSolidFull" />
    <Glyph name="hourglassRegularFull" />
    <Glyph name="trashCanRegularFull" />
    <Glyph name="moon" />
    <Glyph name="sun" />
    <Glyph name="arrowUpDark" />
  </div>
);

/** The four sizes the app actually asks for: 16 in the results toolbar, 19–30 in the reader hero. */
export const Sizes = () => (
  <div style={{ ...grid, alignItems: 'flex-end', gap: '20px 20px' }}>
    <Glyph name="compass" size={16} note="16 — results toolbar" />
    <Glyph name="compass" size={19} note="19 — burger / hero" />
    <Glyph name="compass" size={24} note="24 — sheet rows" />
    <Glyph name="compass" size={30} note="30 — reader hero" />
  </div>
);

// Dark theme is a class, not a prop: the tokens are redefined on `.dark`, and custom
// properties inherit, so putting the class on a wrapper themes everything inside it. The
// wrapper paints --dg-page itself — the card's own ground stays light otherwise.
const Dark = ({ children }) => (
  <div className="dark" style={{ background: 'var(--dg-page)', padding: 20 }}>
    {children}
  </div>
);

/**
 * The same gallery on the dark ground. Most glyphs hard-code `fill="#989898"` on their paths,
 * which beats the `currentColor` on the `<svg>` — so they read the same grey in both themes.
 * That is how the app looks too (it renders them as `<img>`), not a rendering fault. Only
 * `select`, `memo`, `play`, `tableColumns`, `linkSolidFull` and `codeCompareSolidFull` follow
 * `currentColor` and lighten here; the captions follow --dg-text-muted and lighten with them.
 */
export const DarkTheme = () => (
  <Dark>
    <div style={grid}>
      <Glyph name="circleHalfStroke" />
      <Glyph name="moon" />
      <Glyph name="sun" />
      <Glyph name="compass" />
      <Glyph name="book" />
      <Glyph name="dharmachakra" />
      <Glyph name="tableColumns" />
      <Glyph name="select" />
      <Glyph name="linkSolidFull" />
      <Glyph name="codeCompareSolidFull" />
      <Glyph name="play" />
      <Glyph name="gear" />
      <Glyph name="question" />
      <Glyph name="listUlSolidFull" />
    </div>
  </Dark>
);
