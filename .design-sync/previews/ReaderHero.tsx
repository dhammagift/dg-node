import { ReaderHero, IconButton, Icon } from '@dhammagift/dg-ui';

export const WithReaderButtons = () => (
  <ReaderHero query="dn22">
    <IconButton label="Contents" variant="plain"><Icon name="listUlSolidFull" size={18} /></IconButton>
    <IconButton label="Settings" variant="plain"><Icon name="gear" size={18} /></IconButton>
  </ReaderHero>
);

export const FullToolset = () => (
  <ReaderHero query="sn56.11">
    <IconButton label="Contents" variant="plain"><Icon name="listUlSolidFull" size={18} /></IconButton>
    <IconButton label="Read aloud" variant="plain"><Icon name="volumeSolidFull" size={18} /></IconButton>
    <IconButton label="Theme" variant="plain"><Icon name="circleHalfStroke" size={18} /></IconButton>
    <IconButton label="Dictionary" variant="plain"><Icon name="comment" size={18} /></IconButton>
    <IconButton label="Settings" variant="plain"><Icon name="gear" size={18} /></IconButton>
  </ReaderHero>
);

export const SearchOnly = () => (
  <ReaderHero placeholder="kacchapa" />
);
