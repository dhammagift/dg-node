import { MegaMenu, MegaMenuGroup, SheetRow } from '@dhammagift/dg-ui';

// The group's styling comes from the `#dg-mega` panel around it, so every story is shown
// inside one; `show` is the class the app adds once the panel is anchored to its tile.

export const Rows = () => (
  <MegaMenu title="Materials" className="show">
    <MegaMenuGroup title="Grammar">
      <SheetRow label="Cases" description="Noun and adjective endings" />
      <SheetRow label="Conjugations" description="Verb endings by tense and person" />
    </MegaMenuGroup>
    <MegaMenuGroup title="Textbooks">
      <SheetRow label="A.K. Warder — Introduction to Pali" />
      <SheetRow label="J.W. Gair — Pali Course" description="Academic reference grammar" />
    </MegaMenuGroup>
  </MegaMenu>
);

export const Chips = () => (
  <MegaMenu title="AI &amp; Dicts" className="show">
    <MegaMenuGroup title="AI" layout="chips">
      <SheetRow label="Claude" chip />
      <SheetRow label="ChatGPT" chip />
      <SheetRow label="Gemini" chip />
      <SheetRow label="DeepSeek" chip />
      <SheetRow label="Norbu AI" chip />
    </MegaMenuGroup>
    <MegaMenuGroup title="Editions" layout="chips">
      <SheetRow label="Mahāsaṅgīti" chip starred />
      <SheetRow label="Buddha Jayanthi" chip />
      <SheetRow label="VRI" chip />
      <SheetRow label="PTS" chip />
    </MegaMenuGroup>
  </MegaMenu>
);

export const SeveralGroups = () => (
  <MegaMenu title="Collections" className="show">
    <MegaMenuGroup title="Readers">
      <SheetRow label="Digital Pali Reader" description="CST and Thai editions" />
      <SheetRow label="Simsapa Pali Reader" description="PC · Mac · Linux" />
    </MegaMenuGroup>
    <MegaMenuGroup title="SuttaCentral" divider>
      <SheetRow label="SuttaCentral.net" />
      <SheetRow label="Vinaya" />
      <SheetRow label="Voice" />
      <SheetRow label="Legacy" />
    </MegaMenuGroup>
    <MegaMenuGroup title="Memorization" divider>
      <SheetRow label="sn56.11" description="Dhammacakkappavattana" />
      <SheetRow label="dn22" description="Mahāsatipaṭṭhāna" />
      <SheetRow label="sn12.2" description="Paṭiccasamuppāda­vibhaṅga" />
    </MegaMenuGroup>
  </MegaMenu>
);
