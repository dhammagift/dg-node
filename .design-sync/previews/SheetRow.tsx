import { Sheet, SheetRow, Icon } from '@dhammagift/dg-ui';

// SheetRow's styling lives under `.dg-sheet`, so every story sits in a real Sheet.

export const WithDescription = () => (
  <Sheet title="Tipiṭaka" backdrop={false}>
    <SheetRow label="MS" description="The Mahāsaṅgīti edition, at SuttaCentral.net"
              icon={<Icon name="book" className="dg-row-icon" />} />
    <SheetRow label="BJT" description="Sri Lankan Buddha Jayanthi edition of the Pāḷi canon"
              icon={<Icon name="book" className="dg-row-icon" />} />
    <SheetRow label="CST" description="The CST edition by VRI at Tipitaka.org"
              icon={<Icon name="book" className="dg-row-icon" />} />
    <SheetRow label="PTS" description="The PTS edition, at GRETIL"
              icon={<Icon name="book" className="dg-row-icon" />} />
  </Sheet>
);

export const Starred = () => (
  <Sheet title="Collections" backdrop={false}>
    <SheetRow label="S.4nt.org" description="BJT, CST and Thai editions together" starred />
    <SheetRow label="Digital Pali Reader" description="CST and Thai editions" starred />
    <SheetRow label="Simsapa Pali Reader" description="PC · Mac · Linux"
              icon={<Icon name="openLink" className="dg-row-icon" />} />
    <SheetRow label="Buddhadust.net" description="Translations by Michael Olds"
              icon={<Icon name="openLink" className="dg-row-icon" />} />
  </Sheet>
);

export const Chips = () => (
  <Sheet title="Translators" backdrop={false}>
    <SheetRow label="Sujato" chip starred />
    <SheetRow label="Thanissaro" chip />
    <SheetRow label="Bodhi" chip />
    <SheetRow label="Ānandajoti" chip />
    <SheetRow label="Сыркин" chip />
    <SheetRow label="Хантибало" chip />
  </Sheet>
);

export const LabelOnly = () => (
  <Sheet title="Memorization" backdrop={false}>
    <SheetRow label="sn56.11" />
    <SheetRow label="dn22" />
    <SheetRow label="sn12.2" />
    <SheetRow label="dhp1" />
  </Sheet>
);
