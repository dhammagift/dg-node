// publish-offline-db.js — раздача офлайн-базы: сжимает dg.db и пишет манифест. База одна — та
// самая, с которой работает сайт; meta лежит в ней с момента сборки (build-search-db.js).
//
// Владелец: "мы просто отдаём человеку сжатую полную базу, он скачал, она распаковалась, и всё
// готово" — вместо урезанной копии (build-mobile-db.js) и вместо сборки индексов на устройстве,
// как это делают другие приложения (полчаса ожидания после скачивания).
//
//   node publish-offline-db.js [--source=dg.db] [--out=siteroot/mobile-data]
//
// Выход:
//   <out>/dg.db.gz            сжатая база (≈215 МБ против 595)
//   <out>/db-manifest.json    build_id, размеры, sha256, имя сжатого файла
//
// Почему meta обязательна: db-worker.js после распаковки читает `SELECT key, value FROM meta` и
// сверяет build_id с именем, под которым сохранил файл. База без этих строк отвергается как
// незавершённое скачивание — то есть человек скачал бы 215 МБ впустую. Раньше таблицу дописывал
// этот скрипт, во временную копию; теперь она приезжает вместе с базой, и копия не нужна.
const fs = require('fs');
const path = require('path');
const crypto = require('crypto');
const { execFileSync } = require('child_process');
const { DatabaseSync } = require('node:sqlite');

function arg(name, fallback) {
    const hit = process.argv.slice(2).find((a) => a.startsWith(`--${name}=`));
    return hit ? hit.slice(name.length + 3) : fallback;
}

const SOURCE = path.resolve(arg('source', path.join(__dirname, 'dg.db')));
const OUT_DIR = path.resolve(arg('out', path.join(__dirname, 'siteroot', 'mobile-data')));
const OUT_GZ = path.join(OUT_DIR, 'dg.db.gz');
const OUT_MANIFEST = path.join(OUT_DIR, 'db-manifest.json');

function sha256File(file) {
    const h = crypto.createHash('sha256');
    const fd = fs.openSync(file, 'r');
    const buf = Buffer.allocUnsafe(1 << 20);
    let n;
    while ((n = fs.readSync(fd, buf, 0, buf.length, null)) > 0) h.update(buf.subarray(0, n));
    fs.closeSync(fd);
    return h.digest('hex');
}

function main() {
    if (!fs.existsSync(SOURCE)) {
        console.error(`нет базы ${SOURCE} — сначала 'npm run build-search-db'`);
        process.exit(1);
    }
    fs.mkdirSync(OUT_DIR, { recursive: true });

    // Никаких копий и дописываний: meta теперь часть самой базы (build-search-db.js writeMeta).
    // Здесь только читаем оттуда build_id — публикация не должна менять то, что публикует.
    const db = new DatabaseSync(`file:${SOURCE}?mode=ro`, { readOnly: true });
    let buildId = null;
    try {
        buildId = db.prepare("SELECT value FROM meta WHERE key = 'build_id'").get()?.value || null;
    } catch (e) { /* нет таблицы meta */ }
    db.close();
    if (!buildId) {
        console.error(`в ${SOURCE} нет meta.build_id — пересоберите базу: npm run build-search-db`);
        process.exit(1);
    }
    // WAL: если рядом лежит непустой -wal, часть данных ещё не в самом файле, и сжимать его
    // рано — получился бы архив без последних записей.
    const wal = `${SOURCE}-wal`;
    if (fs.existsSync(wal) && fs.statSync(wal).size > 0) {
        console.error(`рядом с базой лежит непустой ${path.basename(wal)} — сначала закройте пишущий процесс`);
        process.exit(1);
    }
    console.log(`база ${path.basename(SOURCE)}, build ${buildId}`);

    const bytes = fs.statSync(SOURCE).size;
    const sha256 = sha256File(SOURCE);

    const tg = Date.now();
    const out = fs.openSync(OUT_GZ, 'w');
    try {
        execFileSync('gzip', ['-6', '-c', SOURCE], { stdio: ['ignore', out, 'inherit'] });
    } finally {
        fs.closeSync(out);
    }
    const bytesGz = fs.statSync(OUT_GZ).size;
    console.log(`gzip ${(bytesGz / 1048576).toFixed(1)} МБ из ${(bytes / 1048576).toFixed(1)} ` +
                `(${(bytes / bytesGz).toFixed(1)}x, ${((Date.now() - tg) / 1000).toFixed(0)}с)`);

    // Только file_gz, без file: клиент предпочитает несжатый файл, когда объявлены оба (его можно
    // докачать после обрыва). Здесь выбран вес — 215 МБ против 595, ценой рестарта при обрыве.
    const manifest = {
        schema_version: 1,
        build_id: buildId,
        langs: 'all',
        fts: 'trigram',
        source: path.basename(SOURCE),
        built_at: new Date().toISOString(),
        file_gz: path.basename(OUT_GZ),
        bytes_gz: bytesGz,
        bytes,
        sha256,
    };
    fs.writeFileSync(OUT_MANIFEST, JSON.stringify(manifest, null, 2) + '\n');
    console.log(`${OUT_MANIFEST} записан`);
}

main();
