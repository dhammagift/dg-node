import { ReaderSegment } from '@dhammagift/dg-ui';

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
