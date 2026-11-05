async page => {
  // Usage: playwright-cli -s=par open --mobile about:blank && playwright-cli -s=par --raw run-code --filename=test/packs-parity-browser.js
  // Downloads the default packs on BASE, then compares every case page (local library) vs server, online and offline.
  // Packs parity: download the default packs (root + tr-<ui lang>), then every case through the page (local SQLite via the shim)
  // must equal the server's answer byte for byte - online, then again with the network off.
  const BASE = 'https://dhamma.gift';
  const CASES = [
    '/search?q=kacchapa&langs=ru,en', '/search?q=kacchapa&langs=ru,en&fast=1', '/search?q=kacchapa&langs=ru,en&exact=true',
    '/search?q=kacchapa&langs=ru,en&lb=1&la=2', '/search?q=kacchapa&langs=ru,en&scope=dhamma', '/search?q=kacchapa&langs=ru,en&scope=vinaya',
    '/search?q=%D1%87%D0%B5%D1%80%D0%B5%D0%BF%D0%B0%D1%85%D0%B0&langs=ru,en', '/search?q=kacchap%C4%81na%E1%B9%81&langs=ru,en',
    '/search?q=kacchapanam&langs=ru,en', '/search?q=ka&langs=ru,en', '/search?q=zzzzzz&langs=ru,en',
    '/search?q=anicca&langs=ru,en', '/search?q=anicca&langs=ru,en&scope=dhamma', '/search?q=nibb%C4%81na&langs=ru',
    '/search?q=%D1%81%D1%82%D1%80%D0%B0%D0%B4%D0%B0%D0%BD%D0%B8%D0%B5&langs=ru,en', '/search?q=suffering&langs=en',
    '/search?q=satipa%E1%B9%AD%E1%B9%ADh%C4%81na&langs=ru,en', '/search?q=jh%C4%81na&langs=ru,en&scope=dhamma',
    '/search?q=bhikkhun%C4%AB&langs=ru,en&scope=vinaya', '/search?q=metta&langs=ru,en&lb=2&la=2',
    '/search/enrich?q=kacchapa&ids=dn22&langs=ru,en',
    '/api/text/dn22?mode=single&lang=ru', '/api/text/dn22?mode=single&lang=en', '/api/text/dn22?mode=multi&langs=ru,en',
    '/api/text/dn22?mode=multi&langs=ru&translators=ru_o,ru_khantibalo', '/api/text/dn22?mode=memorize&lang=ru',
    '/api/text/dn22?mode=devanagari&lang=ru', '/api/text/dn1?mode=single', '/api/text/mn1?mode=single&lang=ru',
    '/api/text/mn10?mode=multi&langs=ru,en', '/api/text/sn56.11?mode=single&lang=ru', '/api/text/sn12.2?mode=single&lang=en',
    '/api/text/an3.65?mode=single&lang=ru', '/api/text/an1.1-10?mode=single&lang=ru', '/api/text/dhp1-20?mode=single&lang=ru',
    '/api/text/snp1.8?mode=single&lang=ru', '/api/text/ud1.10?mode=multi&langs=ru,en', '/api/text/thag1.1?mode=single&lang=en',
    '/api/text/pli-tv-bu-vb-pj1?mode=single&lang=ru', '/api/text/pli-tv-bu-vb-sk63?mode=single&lang=ru', '/api/text/nosuchsutta',
    '/api/nav/dn22', '/api/nav/sn56.11', '/api/nav/mn1', '/api/nav/an1.1-10', '/api/nav/dhp1-20', '/api/nav/pli-tv-bu-vb-pj1',
  ];
  await page.goto(BASE + '/ru/');
  await page.goto(BASE + '/ru/#offline-download');
  await page.getByRole('alertdialog').getByRole('button', { name: 'Скачать', exact: true }).click({ timeout: 20000 });
  await page.waitForFunction(() => /готов/i.test(document.body.innerText), null, { timeout: 240000 });
  await page.goto(BASE + '/ru/');
  await page.waitForTimeout(4000);
  const diag = await page.evaluate(() => { try { return JSON.stringify(window.dgOfflineDiagnostics && window.dgOfflineDiagnostics()).slice(0, 400); } catch (e) { return String(e); } });
  const server = {};
  for (const u of CASES) { const r = await page.request.get(BASE + u); server[u] = r.status() + ' ' + (await r.text()); }
  const viaPage = async () => { const out = {}; for (const u of CASES) out[u] = await page.evaluate(async (x) => { try { const r = await fetch(x); return r.status + ' ' + (await r.text()); } catch (e) { return 'ERR ' + e.message; } }, u); return out; };
  const cmp = (got) => CASES.filter((u) => got[u] !== server[u]).map((u) => u + ' :: page ' + got[u].slice(0, 90) + ' || server ' + server[u].slice(0, 90));
  const online = cmp(await viaPage());
  await page.context().setOffline(true);
  await page.reload(); await page.waitForTimeout(6000);
  const offline = cmp(await viaPage());
  await page.context().setOffline(false);
  return JSON.stringify({ diag, total: CASES.length, onlineDiff: online, offlineDiff: offline }, null, 1);
}
