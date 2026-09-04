import { TocItem } from '@dhammagift/dg-ui';

export const SuttaContents = () => (
  <div>
    <TocItem level="h1" pali="Mahāsatipaṭṭhānasutta" translated="Большое наставление о способах установления памятования" />
    <TocItem level="h2" pali="Uddesa" translated="Изложение" />
    <TocItem level="h2" pali="Kāyānupassanā" translated="Созерцание тела" />
    <TocItem level="h3" pali="Ānāpānapabba" translated="Раздел о дыхании" />
    <TocItem level="h3" pali="Iriyāpathapabba" translated="Раздел о положениях тела" />
    <TocItem level="h4" pali="Sampajānapabba" translated="Раздел о бдительности" />
  </div>
);

export const EnglishHeadings = () => (
  <div>
    <TocItem level="h1" lang="eng" pali="Dhammacakkappavattanasutta" translated="Setting the Wheel of Dhamma Rolling" />
    <TocItem level="h2" lang="eng" pali="Majjhimā paṭipadā" translated="The Middle Way" />
    <TocItem level="h2" lang="eng" pali="Cattāri ariyasaccāni" translated="The Four Noble Truths" />
    <TocItem level="h3" lang="eng" pali="Dukkhasamudayaṁ ariyasaccaṁ" translated="The Origin of Suffering" />
  </div>
);

export const PaliOnly = () => (
  <div>
    <TocItem level="h2" pali="Vedanānupassanā" />
    <TocItem level="h2" pali="Cittānupassanā" />
    <TocItem level="h2" pali="Dhammānupassanā" />
    <TocItem level="h3" pali="Nīvaraṇapabba" />
  </div>
);

export const TranslationOnly = () => (
  <div>
    <TocItem level="h2" translated="Созерцание чувств" />
    <TocItem level="h2" translated="Созерцание ума" />
    <TocItem level="h2" translated="Созерцание явлений" />
    <TocItem level="h3" translated="Раздел о помехах" />
  </div>
);
