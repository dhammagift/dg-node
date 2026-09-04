import { MegaMenu, MegaMenuGroup, SheetRow } from '@dhammagift/dg-ui';

// `show` is the class the app puts on the panel once it is anchored — without it the
// menu keeps its closed transform (scale .35, opacity 0) and photographs as nothing.

export const ExternalSources = () => (
  <MegaMenu title="External" className="show">
    <MegaMenuGroup title="Tipiṭaka">
      <SheetRow label="S.4nt.org" description="BJT, CST and Thai editions together" starred />
      <SheetRow label="BJT" description="Sri Lankan Buddha Jayanthi edition" />
      <SheetRow label="CST" description="By VRI at Tipitaka.org" />
      <SheetRow label="MS" description="Mahāsaṅgīti, at SuttaCentral.net" />
    </MegaMenuGroup>
    <MegaMenuGroup title="Collections">
      <SheetRow label="Digital Pali Reader" description="CST and Thai editions" />
      <SheetRow label="Simsapa Pali Reader" description="PC · Mac · Linux" />
      <SheetRow label="Ancient Buddhist Texts" description="By Bhikkhu Ānandajoti" />
      <SheetRow label="Buddhadust.net" description="Translations by Michael Olds" />
    </MegaMenuGroup>
    <MegaMenuGroup title="Pāṭimokkha" divider>
      <SheetRow label="Accesstoinsight.org" description="Translation by Thanissaro Bhikkhu" />
      <SheetRow label="BMC" description="Commentary by Thanissaro Bhikkhu" />
    </MegaMenuGroup>
  </MegaMenu>
);

export const WithChipGroups = () => (
  <MegaMenu title="AI &amp; Dicts" className="show">
    <MegaMenuGroup title="Dict.Dhamma.Gift">
      <SheetRow label="Dict.Dhamma.Gift" description="Multi-dictionary powered by DPD" starred />
      <SheetRow label="DPD offline" description="Works without internet" />
    </MegaMenuGroup>
    <MegaMenuGroup title="Pāḷi dictionaries">
      <SheetRow label="Critical Pali Dict (CPD)" />
      <SheetRow label="R. Davids, W. Stede (PTS)" description="The classic Pali–English dictionary" />
    </MegaMenuGroup>
    <MegaMenuGroup title="AI" layout="chips" divider>
      <SheetRow label="Claude" chip />
      <SheetRow label="ChatGPT" chip />
      <SheetRow label="Gemini" chip />
      <SheetRow label="DeepSeek" chip />
      <SheetRow label="Norbu AI" chip />
    </MegaMenuGroup>
    <MegaMenuGroup title="Translators" layout="chips">
      <SheetRow label="Sujato" chip starred />
      <SheetRow label="Thanissaro" chip />
      <SheetRow label="Bodhi" chip />
    </MegaMenuGroup>
  </MegaMenu>
);

export const Dark = () => (
  // The panel is position:absolute, so the dark ground behind it needs its own box.
  <div data-theme="dark" style={{ background: 'var(--dg-page)', padding: 16, width: 600, height: 400 }}>
    <MegaMenu title="Tools" className="show">
      <MegaMenuGroup title="On site">
        <SheetRow label="TTS" description="Text-to-speech playback" />
        <SheetRow label="Read+" description="Whole books or single chapters" />
      </MegaMenuGroup>
      <MegaMenuGroup title="Converters">
        <SheetRow label="Aksharamukha" description="Convert Pāḷi between ~160 scripts" />
        <SheetRow label="PTS Converter" description="Sutta reference to PTS page" />
      </MegaMenuGroup>
      <MegaMenuGroup title="Editions" layout="chips" divider>
        <SheetRow label="Mahāsaṅgīti" chip />
        <SheetRow label="Buddha Jayanthi" chip />
        <SheetRow label="VRI" chip />
      </MegaMenuGroup>
    </MegaMenu>
  </div>
);
