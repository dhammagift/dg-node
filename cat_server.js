const express = require('express');
const cors = require('cors');
const { execFile } = require('child_process');
const util = require('util');
const path = require('path');
const fs = require('fs').promises;

const app = express();
app.use(cors());
app.use(express.json());

const execFileAsync = util.promisify(execFile);

// Пути
const HTTP_ROOT = path.resolve(__dirname, '..'); 
const SITE_ROOT = path.resolve(HTTP_ROOT, '..'); 
const OFFLINE_DATA = path.resolve(SITE_ROOT, 'offline-data');
const DHAMMAGIFT_DIR = path.resolve(OFFLINE_DATA, 'dhammagift');
const PALI_DIR = path.resolve(HTTP_ROOT, 'suttacentral.net/sc-data/sc_bilara_data/root/pli/ms');

const DIRS_MAP = {
    'lbl': { path: path.resolve(OFFLINE_DATA, 'lbl'), stripPrefix: OFFLINE_DATA + '/' },
    'ai': { path: path.resolve(DHAMMAGIFT_DIR, 'ai'), stripPrefix: DHAMMAGIFT_DIR + '/' },
    'ru': { path: path.resolve(DHAMMAGIFT_DIR, 'ru'), stripPrefix: DHAMMAGIFT_DIR + '/' },
    'ru_other': { path: path.resolve(DHAMMAGIFT_DIR, 'ru_other'), stripPrefix: DHAMMAGIFT_DIR + '/' },
    'en': { path: path.resolve(DHAMMAGIFT_DIR, 'en'), stripPrefix: DHAMMAGIFT_DIR + '/' },
    'en_other': { path: path.resolve(DHAMMAGIFT_DIR, 'en_other'), stripPrefix: DHAMMAGIFT_DIR + '/' }
};

// Функция расчета схожести двух строк (Коэффициент Дайса по биграммам)
function calculateSimilarity(str1, str2) {
    if (!str1 || !str2) return 0.0;
    const s1 = str1.toLowerCase().replace(/[^\p{L}]/gu, '');
    const s2 = str2.toLowerCase().replace(/[^\p{L}]/gu, '');

    if (s1 === s2) return 1.0;
    if (s1.length < 2 || s2.length < 2) return 0.0;

    const bigrams1 = new Map();
    for (let i = 0; i < s1.length - 1; i++) {
        const bigram = s1.substring(i, i + 2);
        bigrams1.set(bigram, (bigrams1.get(bigram) || 0) + 1);
    }

    let intersection = 0;
    for (let i = 0; i < s2.length - 1; i++) {
        const bigram = s2.substring(i, i + 2);
        const count = bigrams1.get(bigram) || 0;
        if (count > 0) {
            bigrams1.set(bigram, count - 1);
            intersection++;
        }
    }

    return (2.0 * intersection) / ((s1.length - 1) + (s2.length - 1));
}

async function runGrepInFolder(searchQuery, targetDir, isRegex = false) {
    try {
        const stat = await fs.stat(targetDir);
        if (!stat.isDirectory()) return [];
    } catch (e) {
        return [];
    }

    try {
        const flag = isRegex ? '-E' : '-F';
        const args = ['-r', flag, '-i', searchQuery, targetDir];
        const { stdout } = await execFileAsync('grep', args, { maxBuffer: 1024 * 1024 * 20 });
        return stdout.split('\n').filter(l => l.trim() !== '');
    } catch (error) {
        return [];
    }
}

app.post('/api/find-match-stream', async (req, res) => {
    const sourceText = (req.body.text || '').trim();
    const segmentId = (req.body.id || '').trim();
    const requestedLang = req.body.lang || 'ru';

    if (!sourceText && !segmentId) {
        return res.status(400).json({ error: 'Нужен text или id' });
    }

    res.setHeader('Content-Type', 'application/x-ndjson');
    res.setHeader('Transfer-Encoding', 'chunked');
    res.setHeader('Cache-Control', 'no-cache');

    let searchStages = [];
    if (requestedLang === 'ru') {
        searchStages = [
            { folders: ['lbl', 'ru'], name: 'o' },
            { folders: ['ai'], name: 'ai' },
            { folders: ['ru_other'], name: 'other' }
        ];
    } else if (requestedLang === 'en') {
        searchStages = [
            { folders: ['lbl', 'en'], name: 'en_main' },
            { folders: ['en_other'], name: 'en_other' }
        ];
    }

    const sentFiles = new Set();
    let globalSentCount = 0;
    const MAX_RESULTS = 30; 
    const MIN_SCORE_THRESHOLD = 20; 

async function getPaliIdsWithScores(text) {
    const foundScores = new Map();
    if (!text) return foundScores;

    // 1. Очистка и нормализация исходного текста Пали
    const normalizedSource = text
        .replace(/[…\.\,\;\:\-\—\?\"\'\(\)\[\]]/g, ' ')
        .replace(/\s+/g, ' ')
        .trim();

    if (!normalizedSource) return foundScores;

    // 2. Извлечение уникальных значимых слов (длиной от 4 символов)
    const words = Array.from(new Set(
        normalizedSource
            .toLowerCase()
            .replace(/[^\p{L}\s]/gu, '')
            .split(' ')
            .filter(w => w.length >= 4)
    ));

    if (words.length === 0) return foundScores;

    // Выбираем до 10 самых длинных слов для быстрого фильтра grep
    const searchWords = words.sort((a, b) => b.length - a.length).slice(0, 10);
    const regexPattern = searchWords.join('|');

    // 3. Поиск всех строк Пали, содержащих хотя бы одно из ключевых слов
    const matchedLines = await runGrepInFolder(regexPattern, PALI_DIR, true);

    // 4. Расчет коэффициента схожести для каждого найденного сегмента
    const candidates = [];
    for (const line of matchedLines) {
        const match = line.match(/"([^"]+)"\s*:\s*"(.*?)"/);
        if (match) {
            const id = match[1];
            const candidateText = match[2];

            if (foundScores.has(id)) continue;

            const score = Math.round(calculateSimilarity(normalizedSource, candidateText) * 100);
            if (score >= MIN_SCORE_THRESHOLD) {
                candidates.push({ id, score });
            }
        }
    }

    // 5. Сортировка результатов по убыванию схожести
    candidates.sort((a, b) => b.score - a.score);

    // Записываем топ-50 наиболее похожих совпадений
    for (const item of candidates.slice(0, 50)) {
        foundScores.set(item.id, item.score);
    }

    return foundScores;
}

    async function streamStage(stage, idScoresMap, matchType) {
        const idsArray = Array.from(idScoresMap.keys());
        if (idsArray.length === 0 || globalSentCount >= MAX_RESULTS) return;

        const tmpFilePath = path.join(__dirname, `grep_ids_${Date.now()}_${Math.random().toString(36).substring(7)}.txt`);
        const patterns = idsArray.map(id => `"${id}":`).join('\n');
        await fs.writeFile(tmpFilePath, patterns);

        for (const folder of stage.folders) {
            const dirInfo = DIRS_MAP[folder];
            if (!dirInfo) continue;

            try {
                const stat = await fs.stat(dirInfo.path);
                if (!stat.isDirectory()) continue;
            } catch(e) { continue; }

            try {
                const args = ['-r', '-F', '-f', tmpFilePath, dirInfo.path];
                const { stdout } = await execFileAsync('grep', args, { maxBuffer: 1024 * 1024 * 20 });
                const lines = stdout.split('\n').filter(l => l.trim() !== '');

                for (const line of lines) {
                    if (globalSentCount >= MAX_RESULTS) break;

                    const firstColon = line.indexOf(':');
                    if (firstColon === -1) continue;
                    
                    const filePath = line.substring(0, firstColon);
                    const content = line.substring(firstColon + 1).trim();
                    const relativePath = filePath.replace(dirInfo.stripPrefix, '');

                    const idMatch = content.match(/"([^"]+)"\s*:/);
                    const actualId = idMatch ? idMatch[1] : 'unknown';

                    const matchKey = `${actualId}_${relativePath}`;
                    if (!sentFiles.has(matchKey)) {
                        sentFiles.add(matchKey);
                        
                        const score = idScoresMap.has(actualId) ? idScoresMap.get(actualId) : 100;

                        const matchObj = {
                            matchType: matchType,
                            folder: folder,
                            translator: relativePath,
                            content: content,
                            id: actualId,
                            score: score 
                        };
                        
                        res.write(JSON.stringify(matchObj) + '\n');
                        globalSentCount++;
                    }
                }
            } catch (error) {
                // Игнорируем ошибки grep
            }
        }
        
        try {
            await fs.unlink(tmpFilePath);
        } catch(e) {}
    }

    if (segmentId) {
        const idMap = new Map();
        idMap.set(segmentId, 100);
        for (const stage of searchStages) {
            await streamStage(stage, idMap, 'id');
        }
    }

    if (sourceText && globalSentCount < MAX_RESULTS) {
        const foundScoresMap = await getPaliIdsWithScores(sourceText);
        
        if (segmentId && foundScoresMap.has(segmentId)) {
            foundScoresMap.delete(segmentId);
        }

        if (foundScoresMap.size > 0) {
            for (const stage of searchStages) {
                await streamStage(stage, foundScoresMap, 'text');
            }
        }
    }

    res.end();
});

app.listen(3001, () => {
    console.log('Потоковый API поиска запущен (Порт 3001)');
});
