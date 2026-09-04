import { QuoteSegment, Match } from '@dhammagift/dg-ui';

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
