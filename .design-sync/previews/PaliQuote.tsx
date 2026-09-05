import type { ReactNode } from 'react';
import { PaliQuote } from '@dhammagift/dg-ui';

// Dark is a CLASS, not a prop: the tokens are redefined on `.dark` and custom properties
// inherit, so a wrapper themes everything inside it. It must paint --dg-page itself, or the
// card's own ground stays light under a correctly themed component.
const Dark = ({ children }: { children: ReactNode }) => (
  <div className="dark" style={{ background: 'var(--dg-page)', padding: 20 }}>
    {children}
  </div>
);

// The triangle the app draws in front of the caveat (search/index.html, #home-howto).
const WarnIcon = () => (
  <svg viewBox="0 0 512 512" width="18" height="18" fill="currentColor" aria-hidden="true">
    <path d="M256 32c14.2 0 27.3 7.5 34.5 19.8l216 368c7.3 12.4 7.3 27.7 .2 40.1S486.3 480 472 480H40c-14.3 0-27.6-7.7-34.7-20.1s-7-27.8 .2-40.1l216-368C228.7 39.5 241.8 32 256 32zm0 128c-13.3 0-24 10.7-24 24V296c0 13.3 10.7 24 24 24s24-10.7 24-24V184c0-13.3-10.7-24-24-24zm32 224a32 32 0 1 0 -64 0 32 32 0 1 0 64 0z" />
  </svg>
);

const HOWTO_PALI =
  'Tāni ce sutte osāriyamānāni vinaye sandassiyamānāni na ceva sutte osaranti, na ca vinaye ' +
  'sandissanti, niṭṭhamettha gantabbaṁ: "addhā, idaṁ na ceva tassa bhagavato vacanaṁ; imassa ca ' +
  'bhikkhuno duggahita"nti. Iti hetaṁ, bhikkhave, chaḍḍeyyātha.';

// The home screen's "How to Search" block, verbatim from configs/search/lang_en.json.
export const HowToSearch = () => (
  <PaliQuote
    pali={HOWTO_PALI}
    translation={
      'If they (teachings, practices, methods, quotes, stories, anything associated with the ' +
      'Buddha) are not found in the Suttas and are not exhibited in the Vinaya, you should draw ' +
      'the conclusion: ‘Clearly this is not the word of the Blessed One. It has been wrongly ' +
      'understood by that monk.’ And so, monks, you should reject it.'
    }
    refs={
      <>
        <a href="/dn16?s=T%C4%81ni">dn16</a>
        <a href="/an4.180?s=T%C4%81ni">an4.180</a>
      </>
    }
    warning={
      <>
        <WarnIcon />
        <div>
          <strong>Please Remember!</strong>
          <p>
            Translations, dictionaries and commentaries do not originate directly from the Buddha
            himself! Approach them with scrutiny and critical thinking. To acquire the fundamental
            teachings, engage in the direct study of Suttas in Pali — at the very least the Middle
            Practice and the Four Noble Truths, for instance a dedicated section from sn56.11.
          </p>
        </div>
      </>
    }
  />
);

// The same block as the Russian interface serves it.
export const Russian = () => (
  <PaliQuote
    pali={HOWTO_PALI}
    translation={
      'Если при поиске в Суттах и сверке с Винаей они (учения, практики, методы, цитаты, истории, ' +
      'что-либо приписываемое Будде) не находятся в Суттах и не проходят сверку с Винаей, следует ' +
      'сделать заключение: «Определенно, это не слово Благословенного, оно ошибочно понято тем ' +
      'монахом». Таким образом, монахи, вам следует это отвергнуть.'
    }
    refs={
      <>
        <a href="/dn16?s=T%C4%81ni">dn16</a>
        <a href="/an4.180?s=T%C4%81ni">an4.180</a>
      </>
    }
    warning={
      <>
        <WarnIcon />
        <div>
          <strong>Пожалуйста, обратите внимание!</strong>
          <p>
            Переводы, словари и комментарии созданы не самим Буддой. Они могут содержать
            неточности, упрощения или даже серьёзные искажения ключевых положений его Учения.
            Поэтому их стоит изучать внимательно и с критическим подходом.
          </p>
        </div>
      </>
    }
  />
);

// Short verse, no caveat — the quote block on its own.
export const Verse = () => (
  <PaliQuote
    pali="Sabbe saṅkhārā aniccā’ti, yadā paññāya passati; Atha nibbindati dukkhe, esa maggo visuddhiyā."
    translation="‘All conditioned things are impermanent’ — when one sees this with wisdom, one turns away from suffering: this is the path to purity."
    refs={<a href="/dhp277">Dhp 277</a>}
  />
);

// Pali alone — no translation offered for this line yet.
export const PaliOnly = () => (
  <PaliQuote pali="Etaṁ santaṁ, etaṁ paṇītaṁ, yadidaṁ sabbasaṅkhārasamatho." refs={<a href="/an10.6">an10.6</a>} />
);

/**
 * The same "How to Search" block in dark theme: the quote box takes the dark surface, the
 * dn16/an4.180 refs the dark accent ink, and the caveat band the dark accent background.
 */
export const DarkTheme = () => (
  <Dark>
    <PaliQuote
      pali={HOWTO_PALI}
      translation={
        'If they (teachings, practices, methods, quotes, stories, anything associated with the ' +
        'Buddha) are not found in the Suttas and are not exhibited in the Vinaya, you should draw ' +
        'the conclusion: ‘Clearly this is not the word of the Blessed One. It has been wrongly ' +
        'understood by that monk.’ And so, monks, you should reject it.'
      }
      refs={
        <>
          <a href="/dn16?s=T%C4%81ni">dn16</a>
          <a href="/an4.180?s=T%C4%81ni">an4.180</a>
        </>
      }
      warning={
        <>
          <WarnIcon />
          <div>
            <strong>Please Remember!</strong>
            <p>
              Translations, dictionaries and commentaries do not originate directly from the Buddha
              himself! Approach them with scrutiny and critical thinking. To acquire the fundamental
              teachings, engage in the direct study of Suttas in Pali — at the very least the Middle
              Practice and the Four Noble Truths, for instance a dedicated section from sn56.11.
            </p>
          </div>
        </>
      }
    />
  </Dark>
);
