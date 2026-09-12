// publish-offline-db.js — готовит прод-базу к раздаче офлайн-клиентам: дописывает в неё таблицу
// meta, сжимает и пишет манифест. Никакой второй базы больше не строится.
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
// незавершённое скачивание — то есть человек скачал бы 215 МБ впустую.
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

    // build_id считаем по содержимому базы ДО того, как допишем meta: иначе id зависел бы сам от
    // себя. Одинаковый корпус — одинаковый id, и клиент не станет перекачивать то же самое.
    const t0 = Date.now();
    const buildId = crypto.createHash('sha256')
        .update('v1|all|').update(fs.readFileSync(SOURCE, { flag: 'r' }))
        .digest('hex').slice(0, 16);

    // Работаем на копии: dg.db может быть тем самым файлом, который прямо сейчас открыт рабочим
    // сервером (в тест-репо это вообще симлинк на прод-базу). Дописывать таблицу в живой файл
    // ради артефакта — не та цена; копия стоит 10 секунд и ничем не рискует.
    const staged = path.join(OUT_DIR, '.staged-' + process.pid + '.db');
    fs.copyFileSync(SOURCE, staged);
    const db = new DatabaseSync(staged);
    db.exec('CREATE TABLE IF NOT EXISTS meta (key TEXT PRIMARY KEY, value TEXT) WITHOUT ROWID');
    const ins = db.prepare('INSERT OR REPLACE INTO meta (key, value) VALUES (?, ?)');
    for (const [k, v] of [
        ['schema_version', '1'],
        ['build_id', buildId],
        ['langs', 'all'],
        ['fts', 'trigram'],
        ['source', path.basename(SOURCE)],
        ['built_at', new Date().toISOString()],
    ]) ins.run(k, v);
    db.close();
    console.log(`meta записана, build ${buildId} (${Date.now() - t0}ms)`);

    const bytes = fs.statSync(staged).size;
    const sha256 = sha256File(staged);

    const tg = Date.now();
    const out = fs.openSync(OUT_GZ, 'w');
    try {
        execFileSync('gzip', ['-6', '-c', staged], { stdio: ['ignore', out, 'inherit'] });
    } finally {
        fs.closeSync(out);
        fs.rmSync(staged, { force: true });   // распакованная копия нужна была только под gzip
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
