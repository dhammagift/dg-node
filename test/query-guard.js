#!/usr/bin/env node
// query-guard.js — проверка гейта "это вообще запрос?" перед AI-поиском (dg-node issue #29).
// `npm run test-query-guard`. Локальная проверка, без сети и без базы.
//
// Главное, что тут защищается — обе стороны: мусор с краулеров не должен доходить ни до DPD, ни
// до LLM (в issue попали живые строки из прод-лога), а НАСТОЯЩИЕ запросы не должны блокироваться
// вместе с ним. Вторая половина важнее первой: гейт, который режет живые запросы, дороже токенов.
const assert = require('assert');
const { nonQueryReason, looksLikeId } = require('../core/query-guard.js');

// Живые строки из прод-лога в issue #29 — все должны быть отбиты.
for (const [query, reason] of [
    ['lzh-mg-bi-pm_pc127', 'tipitaka_id'],
    ['lzh-mg-bi-pm_np3', 'tipitaka_id'],
    ['lzh-mg-bi-pm_sk75', 'tipitaka_id'],
    ['lzh-sarv-bi-pm_sk32', 'tipitaka_id'],
    ['lzh-mi-bu-pm_sk29', 'tipitaka_id'],
    ['skt-mu-bu-pm-gbm2_pc52', 'tipitaka_id'],
    ['bu-vb-sk7', 'tipitaka_id'],
    ['thi16', 'tipitaka_id'],
    ['tha5', 'tipitaka_id'],
    ['an10.76', 'tipitaka_id'],
    ['dn22:2.2', 'tipitaka_id'],
    ['an10.76@1@   L烗      ,', 'junk_chars'],
    ['sn56.50@1@ 0 0 b橪  博橪', 'junk_chars'],
    ['0 0', 'no_letters'],
    ['sdfghjkl', 'consonant_soup'],
    ['w.php', 'url_path'],
    ['thi16.html', 'url_path'],
]) {
    assert.strictEqual(nonQueryReason(query), reason, `${query} → ожидали ${reason}, получили ${nonQueryReason(query)}`);
}
assert.strictEqual(nonQueryReason('  '), 'empty');

// А это — реальные запросы, и они обязаны пройти насквозь: дефис и подчёркивание сами по себе
// не признак id (см. looksLikeId), кириллица, китайский, пали, опечатки, описание своими словами.
// Пунктирные английские фразы из трёх частей тут стоят специально: первая версия гейта резала их
// как id, потому что считала признаком id "три и более частей" и без цифры.
for (const query of [
    'non-self', 'not-self', 'sutta-pitaka', 'one-pointed-ness', 'self-made-man',
    'kamma-kamma-kamma', 'kacchapa', 'satipaṭṭhāna', 'satipattana', 'kachcapxyz',
    'притча про слепую черепаху', 'сострадание', 'что такое nibbana?', '四念处', 'धम्म',
    'an 10.72', 'dvipadako', 'dhammacakkappavattana', 'the raft simile',
]) {
    assert.strictEqual(nonQueryReason(query), null, `${query} НЕ должен блокироваться (получили ${nonQueryReason(query)})`);
}

// Отдельно: то, что "похоже на id", но id не является — иначе гейт сломает живые запросы.
assert.strictEqual(looksLikeId('non-self'), false);
assert.strictEqual(looksLikeId('sutta-pitaka'), false);
assert.strictEqual(looksLikeId('one-pointed-ness'), false);
assert.strictEqual(looksLikeId('lzh-mg-bi-pm'), false); // id без цифры намеренно проходит — см. query-guard.js
assert.strictEqual(looksLikeId('bu-vb-sk7'), true);

console.log('query-guard: ok');
