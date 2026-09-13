#!/usr/bin/env node
// build-sutta-words.js — собирает /assets/texts/sutta_words.txt для ЭТОГО репо (override-копия,
// public/overrides/texts/), из таблицы `vocab` в dg.db. `npm run build-sutta-words`.
//
// Зачем: легаси-файл в старом репо (его же читает PHP-сайт) знает 89 197 словоформ, а корпус —
// 156 650. Половины реальных форм в нём просто нет, плюс мусор токенизации (`abandhanan”ti`:
// закрывающая кавычка приклеена к слову). Из-за этого поле подсказывало не то, что потом находил
// поиск. Здесь список берётся из той же базы, по которой поиск и работает.
//
// Старый файл НЕ трогается: dg-node отдаёт свою копию первым (public/overrides → /assets).
const fs = require('fs');
const path = require('path');
const { DatabaseSync } = require('node:sqlite');

const DB = path.join(__dirname, '..', 'dg.db');
const LEGACY = '/var/www/html/assets/texts/sutta_words.txt';
const OUT = path.join(__dirname, '..', 'public', 'overrides', 'texts', 'sutta_words.txt');

// Файл состоит из трёх блоков: кураторские фразы (37 факторов пробуждения, четыре истины),
// словарь, и id текстов с названиями ("kd20 Bhikkhunikkhandhaka", "ja547"). Из корпуса выводится
// только средний — два других берём из легаси-файла как есть, они написаны руками.
const WORD_LINE = /^\S+ \d+$/;
const legacy = fs.readFileSync(LEGACY, 'utf8').split('\n');
const firstWord = legacy.findIndex(l => WORD_LINE.test(l));
const lastWord = legacy.length - 1 - [...legacy].reverse().findIndex(l => WORD_LINE.test(l));
if (firstWord < 0) throw new Error(`${LEGACY}: не нашёл ни одной словарной строки "слово N"`);
const head = legacy.slice(0, firstWord);
const tail = legacy.slice(lastWord + 1);

const db = new DatabaseSync(DB, { readOnly: true });
let rows;
try {
    rows = db.prepare('SELECT word, df FROM vocab').all();
} catch {
    throw new Error('в dg.db нет таблицы vocab — соберите базу (npm run build-search-db)');
}
if (!rows.length) throw new Error('таблица vocab пуста');

/* Порядок строк = порядок подсказок: autopali.js отдаёт совпадения в порядке файла.
   Легаси-файл был по алфавиту, и пока слов было 85 тысяч это сходило; на 157 тысячах алфавит
   топит нужное: на "satipa" первыми шли satipaññañca (1 вхождение) и satiparibandhānaṁ (2), а
   satipaṭṭhānā (213) уезжала вниз списка. Поэтому частота вперёд — то, что человек ищет, почти
   всегда частотнее того, чего он не ищет. Внутри одинаковой частоты — по алфавиту без
   диакритики (чтобы ā стояла рядом с a, а не после z, куда её отправила бы сортировка по кодам). */
const bare = w => w.normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLowerCase();
rows.sort((a, b) => {
    if (a.df !== b.df) return b.df - a.df;
    const ba = bare(a.word), bb = bare(b.word);
    return ba < bb ? -1 : ba > bb ? 1 : (a.word < b.word ? -1 : a.word > b.word ? 1 : 0);
});

const body = rows.map(r => `${r.word} ${r.df}`);
const out = head.concat(body, tail).join('\n');
fs.mkdirSync(path.dirname(OUT), { recursive: true });
fs.writeFileSync(OUT, out);

const legacyWords = legacy.filter(l => WORD_LINE.test(l)).length;
const gz = require('zlib').gzipSync(out).length;
console.log(`${path.relative(process.cwd(), OUT)}: ${(Buffer.byteLength(out) / 1048576).toFixed(1)} МБ, в gzip ${(gz / 1048576).toFixed(2)} МБ (столько и едет по сети)`);
console.log(`  ${head.length} строк фраз + ${body.length} словоформ + ${tail.length} id текстов`);
console.log(`  было в легаси-файле: ${legacyWords} словоформ (+${body.length - legacyWords})`);
