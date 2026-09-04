import { ScopeSummary } from '@dhammagift/dg-ui';

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
