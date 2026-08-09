const fs = require('fs').promises;
const path = require('path');
const fsSync = require('fs');

const isTermux  = fsSync.existsSync('/data/data/com.termux/files/usr');
const isWindows = process.platform === 'win32';

// SC bilara root/html — единый кроссплатформенный путь через siteroot/data/ (git-tracked
// symlink на реальные данные, тот же принцип, что и siteroot/assets — см. dg-light.js). Раньше
// было 3 разных platform-conditional хардкода абсолютных путей, унифицировано в этом раунде.
const SC_BILARA_ROOT = path.join(__dirname, 'siteroot', 'data', 'suttacentral.net', 'sc-data', 'sc_bilara_data');
const rootPath = path.join(SC_BILARA_ROOT, 'root') + '/';
const htmlPath = path.join(SC_BILARA_ROOT, 'html') + '/';

// textInfoPath — отдельный легаси-путь (не sc_bilara_data/не dhammagift), вне скоупа этой
// миграции, остаётся platform-conditional как было.
let textInfoPath;
if (isTermux) {
    textInfoPath = '/data/data/com.termux/files/usr/share/apache2/default-site/htdocs/assets/js/textinfo.json';
} else if (isWindows) {
    textInfoPath = 'C:/soft/dg/assets/js/textinfo.json';
} else {
    textInfoPath = '/var/www/html/assets/js/textinfo.json';
}

const outputFile = path.join(__dirname, 'dg_db_light.json');

const excludePatterns = [
    /xplayground/i,
    /name/i, 
    /site/i,       
    /blurbs/i,
    /dukkh/i,
    /subjects/i,
    /terminology/i,
    /similes/i,
    /-guide-/i,        
    /an-introduction/i 
];

async function loadTextInfo(filePath) {
    try {
        const content = await fs.readFile(filePath, 'utf8');
        const jsonString = content.replace(/^(var|let|const)\s+\w+\s*=\s*/, '').replace(/;[\s]*$/, '');
        return JSON.parse(jsonString);
    } catch (error) {
        console.warn(`File textinfo.js not found or parsing error:`, error.message);
        return {};
    }
}

async function walkDirectory(currentDir, callback) {
    let items;
    try {
        items = await fs.readdir(currentDir);
    } catch (error) {
        return;
    }
    for (const item of items) {
        if (excludePatterns.some(pattern => pattern.test(item))) {
            continue;
        }
        
        const fullPath = path.join(currentDir, item);
        try {
            const stat = await fs.stat(fullPath);
            
            if (stat.isDirectory()) {
                await walkDirectory(fullPath, callback);
            } else if (stat.isFile() && fullPath.endsWith('.json')) {
                await callback(fullPath, item);
            }
        } catch (err) {
            // Игнорируем ошибки доступа
        }
    }
}

async function readJson(filePath) {
    try {
        const content = await fs.readFile(filePath, 'utf8');
        return JSON.parse(content);
    } catch (e) {
        return {};
    }
}

async function compileLightSkeleton() {
    const db = {}; 
    const textInfoData = await loadTextInfo(textInfoPath);

    console.log('1. Parsing Root texts for paths and metadata...');
    await walkDirectory(rootPath, async (fullPath, fileName) => {
        const suttaId = fileName.split('_')[0];
        
        if (!db[suttaId]) {
            const relativeFilePath = path.relative(rootPath, fullPath).replace(/\\/g, '/');
            const dirPath = path.dirname(relativeFilePath); // Папка, например: pli/ms/sutta/dn

            db[suttaId] = {
                category: 'other',
                dir_path: dirPath,
                title: '',
                mr: 0
            };
            
            if (textInfoData[suttaId] && textInfoData[suttaId].mtph) {
                db[suttaId].mr = parseInt(textInfoData[suttaId].mtph, 10) || 0;
            }
        }

        // path.join даёт обратные слэши на Windows — нормализуем перед проверкой сегментов пути
        const normalizedPath = fullPath.replace(/\\/g, '/');
        if (normalizedPath.includes('/vinaya/')) db[suttaId].category = 'vinaya';
        else if (normalizedPath.includes('/sutta/kn/')) db[suttaId].category = 'khudakka';
        else if (normalizedPath.includes('/sutta/')) db[suttaId].category = 'dhamma';
        else if (normalizedPath.includes('/abhidhamma/')) db[suttaId].category = 'abhi';

        const data = await readJson(fullPath);

        // Поиск корневого заголовка — тот же паттерн, что и findTitleSegmentIdRecursive в
        // dg-light.js (grep для /search/enrich): bilara-файлы кладут НЕСКОЛЬКО ":0.N"
        // front-matter сегментов подряд (название канона, книги, вагги, и только ПОСЛЕДНИМ —
        // само название сутты) перед первым реальным сегментом текста (":1..."). Раньше здесь
        // был break на ПЕРВОМ ":0.N" — брал "Aṅguttara Nikāya" вместо реального названия сутты
        // (видно в /search?fast=1 до догрузки через /search/enrich, которая вызывала ту же
        // grep-функцию и молча "исправляла" заголовок вторым сетевым заходом).
        for (const [segmentId, text] of Object.entries(data)) {
            if (segmentId.match(/:0(?:\.\d+)?$/)) {
                if (typeof text === 'string' && text.trim()) {
                    db[suttaId].title = text;
                }
            } else if (segmentId.match(/:[1-9]/)) {
                break;
            }
        }
    });

    console.log('2. Scanning HTML presence...');
    // Html-контент больше не хранится в скелете (читается по запросу в dg-light.js,
    // getHtmlPath()/getFullTextData() — см. TODO.md, ридер п.5). Здесь нужен только сам факт
    // наличия html-файла у сутты — это исторически было условием включения в финальный
    // скелет (см. шаг 3 ниже), парсить содержимое незачем.
    const htmlSuttaIds = new Set();
    await walkDirectory(htmlPath, async (fullPath, fileName) => {
        htmlSuttaIds.add(fileName.split('_')[0]);
    });

    console.log('3. Formatting and sorting Skeleton...');
    const finalSkeleton = {};
    const sortedSuttas = Object.keys(db).sort((a, b) => 
        a.localeCompare(b, undefined, { numeric: true, sensitivity: 'base' })
    );

    for (const suttaId of sortedSuttas) {
        if (htmlSuttaIds.has(suttaId)) {
            finalSkeleton[suttaId] = db[suttaId];
        }
    }

    console.log(`Saving Skeleton into ${outputFile}...`);
    await fs.writeFile(outputFile, JSON.stringify(finalSkeleton), 'utf8');
    console.log('Build done!');
}

compileLightSkeleton().catch(err => console.error('Critical error:', err));

