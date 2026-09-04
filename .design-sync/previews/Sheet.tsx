import type { ReactNode } from 'react';
import { Sheet, SheetRow, Icon } from '@dhammagift/dg-ui';

// The card root carries transform: translateZ(0), which makes IT — not the viewport — the
// containing block for any position: fixed descendant, and its own height is 0 when the
// out-of-flow panel is its only child. The sheet then resolves its offsets against a
// zero-height box and disappears. Stage supplies the missing viewport and nothing else: no
// surface, border or shadow, so every visible edge is still the component's own.
const Stage = ({ children, height = 520 }: { children: ReactNode; height?: number }) => (
  <div style={{
    position: 'relative',
    height,
    transform: 'translateZ(0)',
    overflow: 'hidden',
    background: 'var(--dg-page)',
  }}>
    {children}
  </div>
);


export const WithTabs = () => (
  <Stage>
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
  </Stage>
);

export const Plain = () => (
  <Stage>
  <Sheet title="Editions" backdrop={false}>
    <SheetRow label="Mahāsaṅgīti" description="Sixth Council edition, the search default"
              icon={<Icon name="book" className="dg-row-icon" />} />
    <SheetRow label="Buddha Jayanthi" description="Sri Lankan edition"
              icon={<Icon name="book" className="dg-row-icon" />} />
    <SheetRow label="VRI" description="Vipassana Research Institute"
              icon={<Icon name="book" className="dg-row-icon" />} />
  </Sheet>
  </Stage>
);

export const Chips = () => (
  <Stage>
  <Sheet title="Translators" backdrop={false}>
    <SheetRow label="Sujato" chip starred />
    <SheetRow label="Thanissaro" chip />
    <SheetRow label="Bodhi" chip />
    <SheetRow label="Сыркин" chip />
  </Sheet>
  </Stage>
);
