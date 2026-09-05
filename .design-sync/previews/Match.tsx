import type { ReactNode } from 'react';
import { Match, QuoteSegment } from '@dhammagift/dg-ui';

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

export const HighlightedWord = () => (
  <div id="sutta">
    <p className="pli-lang inputscript-ISOPali" lang="pi">
      Bhūtapubbaṁ, bhikkhave, kummo <Match>kacchapo</Match> sāyanhasamayaṁ anunadītīre gocarapasuto ahosi.
    </p>
  </div>
);

export const InflectedForms = () => (
  <div id="sutta">
    <p className="pli-lang inputscript-ISOPali" lang="pi">
      <Match>kacchapa</Match>, <Match>kacchapo</Match>, <Match>kacchapaṁ</Match>, <Match>kacchapānaṁ</Match>
    </p>
  </div>
);

export const InsideSegment = () => (
  <div id="sutta">
    <QuoteSegment
      id="mn129:23.2"
      pali={<>Tatrāssa kāṇo <Match>kacchapo</Match>, so vassasatassa vassasatassa accayena sakiṁ ummujjeyya.</>}
      translations={[
        { lang: 'ru', text: 'И была бы там одноглазая черепаха, которая всплывала бы на поверхность раз в сто лет.', translator: 'ru_sv' },
        { lang: 'en', text: 'And there was a one-eyed turtle who popped up once every hundred years.', translator: 'en_sujato' },
      ]}
    />
  </div>
);

/** The highlight in dark theme: .dark .finder repaints it #DA420E against the #111 page. */
export const DarkTheme = () => (
  <Dark>
    <div id="sutta">
      <QuoteSegment
        id="sn56.47:2.2"
        pali={<>Tatrāssa <Match>kacchapo</Match> kāṇo; so vassasatassa vassasatassa accayena sakiṁ sakiṁ ummujjeyya.</>}
        translations={[
          { lang: 'ru', text: 'И была бы там одноглазая черепаха, которая всплывала бы на поверхность раз в сто лет.', translator: 'ru_sv' },
          { lang: 'en', text: 'And there was a one-eyed turtle who popped up once every hundred years.', translator: 'en_sujato' },
        ]}
      />
      <p className="pli-lang inputscript-ISOPali" lang="pi">
        <Match>kacchapa</Match>, <Match>kacchapo</Match>, <Match>kacchapaṁ</Match>, <Match>kacchapānaṁ</Match>
      </p>
    </div>
  </Dark>
);
