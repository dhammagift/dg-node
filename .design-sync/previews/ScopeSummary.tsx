import type { ReactNode } from 'react';
import { ScopeSummary } from '@dhammagift/dg-ui';

// Dark is a CLASS, not a prop: the tokens are redefined on `.dark` and custom properties
// inherit, so a wrapper themes everything inside it. It must paint --dg-page itself, or the
// card's own ground stays light under a correctly themed component.
const Dark = ({ children }: { children: ReactNode }) => (
  <div className="dark" style={{ background: 'var(--dg-page)', padding: 20 }}>
    {children}
  </div>
);

// The default scope: everything the search actually greps, spelled out. `.dg-scope` is the
// panel chrome this list sits in (border, surface, radius); the groups supply the dividers.
export const DefaultScope = () => (
  <ScopeSummary
    className="dg-scope px-3 py-2"
    groups={[
      { title: '4 Nikāyas', books: ['Dīgha Nikāya', 'Majjhima Nikāya', 'Saṁyutta Nikāya', 'Aṅguttara Nikāya'] },
      { title: 'Khuddaka', books: ['Dhammapada', 'Udāna', 'Itivuttaka', 'Sutta Nipāta', 'Theragāthā', 'Therīgāthā'] },
    ]}
  />
);

// The same expansion as the Russian interface names the books.
export const Russian = () => (
  <ScopeSummary
    className="dg-scope px-3 py-2"
    groups={[
      { title: '4 Никаи', books: ['Дигха Никая', 'Маджхима Никая', 'Саньютта Никая', 'Ангуттара Никая'] },
      { title: 'Кхуддака Никая', books: ['Дхаммапада', 'Удана', 'Итивуттака', 'Сутта Нипата'] },
      { title: 'Виная', books: ['Паривара', 'Махавагга', 'Чуллавагга'] },
    ]}
  />
);

// One group — a search narrowed to a single nikāya still explains itself.
export const SingleGroup = () => (
  <ScopeSummary
    className="dg-scope px-3 py-2"
    groups={[{ title: 'Majjhima Nikāya', books: ['mn1–mn152'] }]}
  />
);

// The whole canon, including the two baskets the default scope leaves out.
export const WholeCanon = () => (
  <ScopeSummary
    className="dg-scope px-3 py-2"
    groups={[
      { title: '4 Nikāyas', books: ['Dīgha Nikāya', 'Majjhima Nikāya', 'Saṁyutta Nikāya', 'Aṅguttara Nikāya'] },
      { title: 'Khuddaka', books: ['Dhammapada', 'Udāna', 'Itivuttaka', 'Sutta Nipāta', 'Theragāthā', 'Therīgāthā'] },
      { title: 'Vinaya', books: ['Pārājika', 'Pācittiya', 'Mahāvagga', 'Cūḷavagga', 'Parivāra'] },
      { title: 'Abhidhamma', books: ['Dhammasaṅgaṇī', 'Vibhaṅga', 'Kathāvatthu', 'Paṭṭhāna'] },
    ]}
  />
);

/** The default scope in dark theme — the `.dg-scope` panel keeps its chrome on the dark ground. */
export const DarkTheme = () => (
  <Dark>
    <ScopeSummary
      className="dg-scope px-3 py-2"
      groups={[
        { title: '4 Nikāyas', books: ['Dīgha Nikāya', 'Majjhima Nikāya', 'Saṁyutta Nikāya', 'Aṅguttara Nikāya'] },
        { title: 'Khuddaka', books: ['Dhammapada', 'Udāna', 'Itivuttaka', 'Sutta Nipāta', 'Theragāthā', 'Therīgāthā'] },
      ]}
    />
  </Dark>
);
