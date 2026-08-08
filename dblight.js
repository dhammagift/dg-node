const fs = require('fs').promises;
const path = require('path');
const fsSync = require('fs');

const isTermux  = fsSync.existsSync('/data/data/com.termux/files/usr');
const isWindows = process.platform === 'win32';

let rootPath, htmlPath, textInfoPath;
if (isTermux) {
    const BASE = '/data/data/com.termux/files/usr/share/apache2/default-site/htdocs';
    rootPath     = `${BASE}/suttacentral.net/sc-data/sc_bilara_data/root/`;
    htmlPath     = `${BASE}/suttacentral.net/sc-data/sc_bilara_data/html/`;
    textInfoPath = `${BASE}/assets/js/textinfo.json`;
} else if (isWindows) {
    rootPath     = 'C:/soft/sc-data/sc_bilara_data/root/';
    htmlPath     = 'C:/soft/sc-data/sc_bilara_data/html/';
    textInfoPath = 'C:/soft/dg/assets/js/textinfo.json';
} else {
    const BASE = '/var/www/html';
    rootPath     = `${BASE}/suttacentral.net/sc-data/sc_bilara_data/root/`;
    htmlPath     = `${BASE}/suttacentral.net/sc-data/sc_bilara_data/html/`;
    textInfoPath = `${BASE}/assets/js/textinfo.json`;
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
        
        // Поиск корневого заголовка
        for (const [segmentId, text] of Object.entries(data)) {
            if (segmentId.match(/:0(?:\.\d+)?$/) || segmentId.match(/:[1-9]/)) {
                if (typeof text === 'string' && text.trim()) {
                    db[suttaId].title = text;
                    break; 
                }
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

