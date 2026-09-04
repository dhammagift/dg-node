import type { CSSProperties } from 'react';
import { glyphs, type IconName } from './generated';

export type { IconName };

export interface IconProps {
  /** Glyph name from the app's shipped SVG set (served as /assets/svg/<name>.svg). */
  name: IconName;
  /** Edge length in px. 16 matches the results toolbar; the reader hero uses 19-30. */
  size?: number;
  /** Extra classes. The app uses `menu-icon`, `common-size-icon4`, `dg-row-icon`. */
  className?: string;
  /** Accessible label. Omit for decorative icons — the svg is then aria-hidden. */
  title?: string;
  style?: CSSProperties;
}

/**
 * A single glyph from Dhamma.gift's own icon set, inlined as SVG.
 *
 * The app renders these as `<img src="/assets/svg/gear.svg">`; the design system inlines the
 * same artwork so it inherits `currentColor` and needs no asset origin.
 */
export function Icon({ name, size = 16, className, title, style }: IconProps) {
  const glyph = glyphs[name];
  if (!glyph) return null;
  return (
    <svg
      viewBox={glyph.viewBox}
      width={size}
      height={size}
      fill="currentColor"
      className={className}
      role={title ? 'img' : undefined}
      aria-label={title}
      aria-hidden={title ? undefined : true}
      focusable="false"
      style={style}
      dangerouslySetInnerHTML={{ __html: glyph.path }}
    />
  );
}
