---
slug: /quickmodal
sidebar_position: 6
---

import AppFrame from '@site/src/components/AppFrame';

# Быстрое окно (компас)

Быстрый доступ к избранному, истории, ключевым суттам и заучиванию — из
**любого** места сайта, без перехода на другую страницу.

:::tip[Как открыть]
Значок компаса на панели инструментов или в бургер-меню, либо сочетание
клавиш **Alt+P** (или **Alt+Y** — обе версии работают в любой раскладке
клавиатуры).
:::

:::info[Открыть сразу нужную вкладку]
Каждую вкладку можно открыть прямо отсюда, одним кликом:

- <a href="#" onClick={(e) => { e.preventDefault(); window.dgOpenQuickModal && window.dgOpenQuickModal('tab-fav'); }}>★ Избранное / История</a>
- <a href="#" onClick={(e) => { e.preventDefault(); window.dgOpenQuickModal && window.dgOpenQuickModal('tab-4as'); }}>4 Ariyasaccāni</a>
- <a href="#" onClick={(e) => { e.preventDefault(); window.dgOpenQuickModal && window.dgOpenQuickModal('tab-memo'); }}>Запоминание</a>
- <a href="#" onClick={(e) => { e.preventDefault(); window.dgOpenQuickModal && window.dgOpenQuickModal('tab-dpd'); }}>Словарь</a>
:::

<AppFrame src="/?action=true" title="Быстрое окно" height={550} />

## Вкладки

- **★ Избранное** — ваши закладки и история поиска в одном списке.
  Сортировка по алфавиту или по дате (значок ⇅), переименование и удаление
  закладок, скрытие отдельных записей истории. Синхронизируется с Облаком
  при входе (значок обновления).
- **4 Ariyasaccāni** — подборка ключевых сутт по темам: Четыре Благородные
  Истины (SN 56.11, DN 22, SN 12.2), пять групп цепляния (khandha),
  шесть сфер чувств (āyatana), элементы (dhātu) и связанные с ними сутты.
- **Запоминание** — тот же инструмент, что и на отдельной странице
  [Мемо](/memo), встроен вкладкой для быстрого доступа.
- **Словарь** — [Dict.Dhamma.Gift](https://dict.dhamma.gift) вкладкой, без
  перехода на другой сайт: DPD и другие словари, подробнее — на отдельной
  странице [Словарь](/dictionary).

## Горячие клавиши

| Клавиша | Действие |
|---|---|
| Alt+P, Alt+Y | Открыть/закрыть быстрое окно |
| Esc | Закрыть |
