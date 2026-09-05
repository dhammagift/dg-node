// Dhamma.gift design system — public surface.
//
// Every component here emits the same DOM the dhamma.gift app ships, styled by the app's own
// CSS (see dist/dg-ui.css, generated from search/css/home.css, reader/css/*.css and the
// vendored Bootstrap build). A design composed from these parts maps onto real markup.

export { Icon } from './icons/Icon';
export type { IconProps, IconName } from './icons/Icon';
export { brandArt } from './icons/generated';

export { Brand } from './shell/Brand';
export type { BrandProps } from './shell/Brand';
export { IconButton } from './shell/IconButton';
export type { IconButtonProps } from './shell/IconButton';
export { SearchShell } from './shell/SearchShell';
export type { SearchShellProps } from './shell/SearchShell';
export { Toolbar, ToolbarButton } from './shell/Toolbar';
export type { ToolbarProps, ToolbarButtonProps } from './shell/Toolbar';
export { BusyIndicator } from './shell/BusyIndicator';
export type { BusyIndicatorProps } from './shell/BusyIndicator';

export { Tile, TileGrid } from './home/Tile';
export type { TileProps, TileGridProps } from './home/Tile';
export { Segmented } from './home/Segmented';
export type { SegmentedProps, SegmentedOption } from './home/Segmented';
export { ScopeSummary } from './home/ScopeSummary';
export type { ScopeSummaryProps, ScopeGroup } from './home/ScopeSummary';
export { PaliQuote } from './home/PaliQuote';
export type { PaliQuoteProps } from './home/PaliQuote';
export { AnnounceBox } from './home/AnnounceBox';
export type { AnnounceBoxProps } from './home/AnnounceBox';
export { CtaButton, ContactButton } from './home/CtaButton';
export type { CtaButtonProps, ContactButtonProps } from './home/CtaButton';

export { Sheet, SheetRow } from './overlays/Sheet';
export type { SheetProps, SheetRowProps, SheetTab } from './overlays/Sheet';
export { Drawer, DrawerRow, DrawerGroup } from './overlays/Drawer';
export type { DrawerProps, DrawerRowProps, DrawerGroupProps } from './overlays/Drawer';
export { ToggleRow } from './overlays/ToggleRow';
export type { ToggleRowProps } from './overlays/ToggleRow';
export { MegaMenu, MegaMenuGroup } from './overlays/MegaMenu';
export type { MegaMenuProps, MegaMenuGroupProps } from './overlays/MegaMenu';

export { ResultsTable, ResultRow } from './results/ResultsTable';
export type { ResultsTableProps, ResultRowProps } from './results/ResultsTable';
export { QuoteSegment, Match } from './results/QuoteSegment';
export type { QuoteSegmentProps, MatchProps, SegmentTranslation } from './results/QuoteSegment';
export { ExternalLinks } from './results/ExternalLinks';
export type { ExternalLinksProps, ExternalLink } from './results/ExternalLinks';

export { ReaderHero } from './reader/ReaderHero';
export type { ReaderHeroProps } from './reader/ReaderHero';
export { ReaderSegment } from './reader/ReaderSegment';
export type { ReaderSegmentProps, ReaderTranslation } from './reader/ReaderSegment';
export { ModeSwitchPanel } from './reader/ModeSwitchPanel';
export type { ModeSwitchPanelProps, ReaderMode } from './reader/ModeSwitchPanel';
export { TocItem } from './reader/TocItem';
export type { TocItemProps } from './reader/TocItem';
export { SmartButton } from './reader/SmartButton';
export type { SmartButtonProps } from './reader/SmartButton';
