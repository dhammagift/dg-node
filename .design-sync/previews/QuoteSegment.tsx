import type { ReactNode } from 'react';
import { QuoteSegment, Match } from '@dhammagift/dg-ui';

// Dark theme is a class, not a prop: the tokens are redefined on `.dark`, and custom
// properties inherit, so putting the class on a wrapper themes everything inside it. The
// wrapper paints --dg-page itself — the card's own ground stays light otherwise.
//
// `.dark` alone is only half the app's theme switch, and the half that misses everything
// coloured by Bootstrap. themeswitch.js sets BOTH `body.dark` (which re-tokenizes --dg-*)
// and `data-bs-theme="dark"` on <html> (which re-tokenizes --bs-*), and the text colour of
// a Pali line, a table cell, a .text-muted translation, a link and a .form-control all come
// from --bs-body-color / --bs-body-bg. With `.dark` on its own the card's ground goes #111
// while the text stays #212529 — near-black on near-black. Bootstrap 5.3 scopes
// [data-bs-theme=dark] to any element, so the same wrapper can carry both.
//
// The wrapper also paints `color` for the same reason it paints `background`: re-tokenizing
// --bs-body-color does not re-run the `color` declaration that sits on <body>, so plain
// inherited text (a `.pli-lang` span carries no colour rule of its own outside a <p>) would
// keep inheriting the light-mode ink. --dg-text resolves to the same rgb(221,221,221) the
// reader's own `.dark p .pli-lang` uses.
const Dark = ({ children }: { children: ReactNode }) => (
  <div
    className="dark"
    data-bs-theme="dark"
    style={{ background: 'var(--dg-page)', color: 'var(--dg-text)', padding: 20 }}
  >
    {children}
  </div>
);

// The reader's column CSS is scoped to #sutta, so the quotes go inside it.

export const RussianTranslation = () => (
  <div id="sutta">
    <QuoteSegment
      id="sn56.11:2.1"
      pali="“Dveme, bhikkhave, antā pabbajitena na sevitabbā."
      translations={[
        { lang: 'ru', text: '«Монахи, эти две крайности не должны практиковаться тем, кто оставил мирскую жизнь.', translator: 'ru_o' },
      ]}
    />
  </div>
);

export const HighlightedHit = () => (
  <div id="sutta">
    <QuoteSegment
      id="sn35.240:2.1"
      pali={<>Bhūtapubbaṁ, bhikkhave, kummo <Match>kacchapo</Match> sāyanhasamayaṁ anunadītīre gocarapasuto ahosi.</>}
      translations={[
        { lang: 'ru', text: 'Однажды, монахи, черепаха под вечер искала пищу на берегу реки.', translator: 'ru_sv' },
        { lang: 'en', text: 'Once upon a time, mendicants, a tortoise was hunting for food along the bank of a river in the evening.', translator: 'en_sujato' },
      ]}
    />
  </div>
);

export const WithVariantReading = () => (
  <div id="sutta">
    <QuoteSegment
      id="dn22:1.4"
      pali="“Ekāyano ayaṁ, bhikkhave, maggo sattānaṁ visuddhiyā, sokaparidevānaṁ samatikkamāya."
      variant="ekāyanvāyaṁ (bj, pts1ed)"
      translations={[
        { lang: 'ru', text: '«Монахи, есть прямой путь к очищению существ, к преодолению печали и стенаний,', translator: 'ru_o' },
      ]}
    />
  </div>
);

export const HitWithContext = () => (
  <div id="sutta">
    <QuoteSegment
      context
      id="sn56.47:2.1"
      pali="“Seyyathāpi, bhikkhave, puriso mahāsamudde ekacchiggaḷaṁ yugaṁ pakkhipeyya."
      translations={[
        { lang: 'ru', text: '«Монахи, представьте, как если бы человек бросил в океан ярмо с одним отверстием.', translator: 'ru_sv' },
      ]}
    />
    <QuoteSegment
      id="sn56.47:2.2"
      pali={<>Tatrāssa <Match>kacchapo</Match> kāṇo; so vassasatassa vassasatassa accayena sakiṁ sakiṁ ummujjeyya.</>}
      translations={[
        { lang: 'ru', text: 'И была бы там одноглазая черепаха, которая всплывала бы на поверхность раз в сто лет.', translator: 'ru_sv' },
      ]}
    />
    <QuoteSegment
      context
      id="sn56.47:2.3"
      pali="Taṁ kiṁ maññatha, bhikkhave, api nu kho kāṇo kacchapo amusmiṁ ekacchiggaḷe yuge gīvaṁ paveseyyā”ti?"
      translations={[
        { lang: 'ru', text: 'Как вы думаете, монахи, смогла бы эта одноглазая черепаха просунуть шею в то ярмо с одним отверстием?»', translator: 'ru_sv' },
      ]}
    />
  </div>
);

/** A hit and a variant reading in dark theme — .dark .finder and .dark .variant both show here. */
export const DarkTheme = () => (
  <Dark>
    <div id="sutta">
      <QuoteSegment
        id="sn35.240:2.1"
        pali={<>Bhūtapubbaṁ, bhikkhave, kummo <Match>kacchapo</Match> sāyanhasamayaṁ anunadītīre gocarapasuto ahosi.</>}
        translations={[
          { lang: 'ru', text: 'Однажды, монахи, черепаха под вечер искала пищу на берегу реки.', translator: 'ru_sv' },
          { lang: 'en', text: 'Once upon a time, mendicants, a tortoise was hunting for food along the bank of a river in the evening.', translator: 'en_sujato' },
        ]}
      />
      <QuoteSegment
        id="dn22:1.4"
        pali={<>“Ekāyano ayaṁ, bhikkhave, maggo sattānaṁ visuddhiyā, sokaparidevānaṁ <Match>samatikkamāya</Match>.</>}
        variant="ekāyanvāyaṁ (bj, pts1ed)"
        translations={[
          { lang: 'ru', text: '«Монахи, есть прямой путь к очищению существ, к преодолению печали и стенаний,', translator: 'ru_o' },
        ]}
      />
    </div>
  </Dark>
);
