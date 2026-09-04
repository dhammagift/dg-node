import { SmartButton, Icon } from '@dhammagift/dg-ui';

export const FloatingPanel = () => (
  <div style={{ width: 190 }}>
    <SmartButton label="Theme" title="Light / dark"><Icon name="circleHalfStroke" size={22} /></SmartButton>
    <SmartButton label="Columns" title="Column layout"><Icon name="alignLeft" size={22} /></SmartButton>
    <SmartButton label="Variants" title="Show variant readings"><Icon name="eye" size={22} /></SmartButton>
    <SmartButton label="Dictionary" title="Pali dictionary on tap"><Icon name="comment" size={22} /></SmartButton>
    <SmartButton label="Multi-select" title="Select several segments"><Icon name="selectSlash" size={22} /></SmartButton>
    <SmartButton label="Favourite" title="Add to favourites"><Icon name="star" size={22} /></SmartButton>
    <SmartButton label="History" title="Reading history"><Icon name="compass" size={22} /></SmartButton>
    <SmartButton label="Memo" title="Memo"><Icon name="memo" size={22} /></SmartButton>
    <SmartButton label="Settings" title="Reader settings"><Icon name="gear" size={22} /></SmartButton>
  </div>
);

export const RussianLabels = () => (
  <div style={{ width: 190 }}>
    <SmartButton label="Тема" title="Светлая / тёмная"><Icon name="circleHalfStroke" size={22} /></SmartButton>
    <SmartButton label="Колонки" title="Раскладка колонок"><Icon name="alignLeft" size={22} /></SmartButton>
    <SmartButton label="Варианты" title="Показать варианты чтения"><Icon name="eye" size={22} /></SmartButton>
    <SmartButton label="Словарь" title="Палийский словарь по клику"><Icon name="comment" size={22} /></SmartButton>
    <SmartButton label="История" title="История чтения"><Icon name="compass" size={22} /></SmartButton>
  </div>
);

export const SingleControl = () => (
  <div style={{ width: 190 }}>
    <SmartButton label="Variants" title="Show variant readings"><Icon name="eye" size={22} /></SmartButton>
  </div>
);
