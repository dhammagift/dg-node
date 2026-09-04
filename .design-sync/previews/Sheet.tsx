import { Sheet, SheetRow, Icon } from '@dhammagift/dg-ui';

export const WithTabs = () => (
  <Sheet
    title="Dīgha Nikāya"
    tabs={[{ id: 'all', label: 'All' }, { id: 'starred', label: 'Starred' }]}
    activeTab="all"
    backdrop={false}
  >
    <SheetRow label="DN 16" description="Mahāparinibbāna — the Buddha's last days" starred />
    <SheetRow label="DN 22" description="Mahāsatipaṭṭhāna — the great discourse on mindfulness" starred />
    <SheetRow label="DN 2" description="Sāmaññaphala — the fruits of the ascetic life"
              icon={<Icon name="book" className="dg-row-icon" />} />
    <SheetRow label="DN 31" description="Siṅgālaka — advice to a householder"
              icon={<Icon name="book" className="dg-row-icon" />} />
  </Sheet>
);

export const Plain = () => (
  <Sheet title="Editions" backdrop={false}>
    <SheetRow label="Mahāsaṅgīti" description="Sixth Council edition, the search default"
              icon={<Icon name="book" className="dg-row-icon" />} />
    <SheetRow label="Buddha Jayanthi" description="Sri Lankan edition"
              icon={<Icon name="book" className="dg-row-icon" />} />
    <SheetRow label="VRI" description="Vipassana Research Institute"
              icon={<Icon name="book" className="dg-row-icon" />} />
  </Sheet>
);

export const Chips = () => (
  <Sheet title="Translators" backdrop={false}>
    <SheetRow label="Sujato" chip starred />
    <SheetRow label="Thanissaro" chip />
    <SheetRow label="Bodhi" chip />
    <SheetRow label="Сыркин" chip />
  </Sheet>
);
