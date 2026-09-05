import type { ReactNode } from 'react';
import { ReaderSegment } from '@dhammagift/dg-ui';

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

export const TwoLanguages = () => (
  <div id="sutta">
    <ReaderSegment
      id="dn22:1.1"
      pali="Evaṁ me sutaṁ—ekaṁ samayaṁ bhagavā kurūsu viharati kammāsadhammaṁ nāma kurūnaṁ nigamo."
      translations={[
        { lang: 'ru', text: 'Так я слышал. Однажды Благословенный пребывал в стране Куру, в городе курувов под названием Каммасадхамма.', translator: 'ru_o' },
        { lang: 'en', text: 'So I have heard. At one time the Buddha was staying in the land of the Kurus, near the Kuru town named Kammāsadamma.', translator: 'en_sujato' },
      ]}
    />
    <ReaderSegment
      id="dn22:1.2"
      pali="Tatra kho bhagavā bhikkhū āmantesi: “bhikkhavo”ti."
      translations={[
        { lang: 'ru', text: 'Там Благословенный обратился к монахам: «Монахи!»', translator: 'ru_o' },
        { lang: 'en', text: 'There the Buddha addressed the mendicants, “Mendicants!”', translator: 'en_sujato' },
      ]}
    />
  </div>
);

export const WithVariant = () => (
  <div id="sutta">
    <ReaderSegment
      id="dn22:1.4"
      pali="“Ekāyano ayaṁ, bhikkhave, maggo sattānaṁ visuddhiyā."
      variant="ekāyanvāyaṁ (bj, pts1ed)"
      translations={[
        { lang: 'ru', text: '«Монахи, есть прямой путь к очищению существ,', translator: 'ru_o' },
      ]}
    />
  </div>
);

export const TwoTranslators = () => (
  <div id="sutta">
    <ReaderSegment
      id="sn56.11:2.1"
      pali="“Dveme, bhikkhave, antā pabbajitena na sevitabbā."
      translations={[
        { lang: 'ru', text: '«Монахи, эти две крайности не следует практиковать тому, кто оставил мирскую жизнь.', translator: 'ru_o' },
        { lang: 'ru', text: '«Монахи, есть две крайности, которых не должен придерживаться отрёкшийся от мира.', translator: 'ru_sv' },
      ]}
    />
  </div>
);

export const PaliOnly = () => (
  <div id="sutta">
    <ReaderSegment id="dhp1:1.1" pali="Manopubbaṅgamā dhammā, manoseṭṭhā manomayā;" />
    <ReaderSegment id="dhp1:1.2" pali="Manasā ce paduṭṭhena, bhāsati vā karoti vā;" />
  </div>
);

/** Reading in dark theme — the variant reading and the greyed transliteration both have their own .dark rules. */
export const DarkTheme = () => (
  <Dark>
    <div id="sutta">
      <ReaderSegment
        id="dn22:1.4"
        pali="“Ekāyano ayaṁ, bhikkhave, maggo sattānaṁ visuddhiyā, sokaparidevānaṁ samatikkamāya."
        variant="ekāyanvāyaṁ (bj, pts1ed)"
        translations={[
          { lang: 'ru', text: '«Монахи, есть прямой путь к очищению существ, к преодолению печали и стенаний,', translator: 'ru_o' },
          { lang: 'en', text: '“Mendicants, the path to convergence is the path for the purification of sentient beings, for getting past sorrow and crying,', translator: 'en_sujato' },
        ]}
      />
      <ReaderSegment
        greyed
        id="dn22:1.5"
        pali="dukkhadomanassānaṁ atthaṅgamāya ñāyassa adhigamāya nibbānassa sacchikiriyāya, yadidaṁ cattāro satipaṭṭhānā."
        translations={[
          { lang: 'ru', text: 'для исчезновения боли и уныния, для достижения истинного пути, для осуществления ниббаны — а именно, четыре способа установления памятования.', translator: 'ru_o' },
        ]}
      />
    </div>
  </Dark>
);
