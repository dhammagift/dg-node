import { Match, QuoteSegment } from '@dhammagift/dg-ui';

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
