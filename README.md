# dg-node

Search and reader for Pāli Canon texts (SuttaCentral Bilara + translations by the DhammaGift project). Node.js (Fastify in production, Express — legacy server).

Architecture and development rules — see [CLAUDE.md](CLAUDE.md).

## Installation and startup

```bash
git pull
npm install
npm run build-search-db   # build dg.db (SQLite/FTS5) from fresh Bilara data
npm start                 # run the production server (dg-fastify.js), port 3000
```

`build-search-db` should be rerun when the source texts/translations change on disk — the server reads the data from disk each time and rebuilds the search index as needed.

Paths to data (`SC_BILARA`, `DG_OFFLINE`, offline mirrors) are determined automatically by environment (Termux / Windows development / local server).

`unused/dg-light.js` / `unused/dblight.js` (`npm run start:express`) — legacy Express + grep server, not used in production (see CLAUDE.md).

## Check after deployment/update

```bash
curl "http://localhost:3000/search?q=kacchapa&scope=dhamma&langs=ru,en"
curl -I "http://localhost:3000/assets/js/datatables/datatables.min.js"   # 200 from public/overrides/js/datatables, not from the legacy repo
curl -I "http://localhost:3000/dn22"                                  # reader via clean URL
curl -I "http://localhost:3000/dn22:10.5"                             # segment link (scroll to 10.5)
```

Visually in the browser:
- `/nodejs/res/?q=kacchapa&scope=dhamma` — search, DataTables, export
- `/dn22` — reader, full text
- Pāli / Russian switch (three modes: Pāli + translation → Pāli only → translation only) — should actually hide/show the content as expected
- `/?q=dn22#12.1` (old format) — should continue to work alongside `/dn22:12.1`

## Important when deploying behind Apache/PHP

If the public dhamma.gift site is currently served by Apache/PHP, while Node is a separate backend proxied only to `/search`, then:
- search requests may go to the Node backend
- static files and reader routes are served by Apache/PHP
- root domain routing may work differently from the local dev build
- `dg-fastify` should be considered the "new" backend, while legacy PHP site pages still coexist as a front layer

## Structure

```text
dg-fastify.js         — production server (Fastify + SQLite/FTS5, dg.db): /search, /api/text/:suttaId,
                         static files (search/, reader/, siteroot/assets/), offline mirrors,
                         clean URLs (/dn22, /dn22:12.1)
unused/dg-light.js    — legacy Express+grep server, not used in production (see CLAUDE.md)
unused/dblight.js     — build script for dg-light.js → dg_db_light.json (legacy, not needed with dg.db)
search/               — search page (DataTables); URL remains /nodejs/res/... (see CLAUDE.md)
reader/               — reader (reader-template.html + megareader.js)
configs/              — project JSON configs (openapi, reader/*, search/*), see CLAUDE.md
docs/                 — project docs not for every session (SPA plans, backward compatibility)
siteroot/             — root-site publication: assets/ (legacy assets), 4nt/config/login/,
                         memo/read (legacy tools), see CLAUDE.md
```
