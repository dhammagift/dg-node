# dg-node

Node.js backend for searching and reading Pāli Canon texts using SuttaCentral Bilara and DhammaGift translations.

This project powers the search index, reader endpoints, static assets, and compatibility layer for the legacy Dhamma.Gift stack. The production server runs on Fastify; the older Express-based implementation is kept only for legacy support.

Architecture and development rules: [CLAUDE.md](CLAUDE.md)

## Features

- Search across the Pāli Canon with SQLite/FTS5
- Reader routes for clean URLs such as `/dn22` and `/dn22:12.1`
- Segment-aware links and scroll targets
- Support for offline mirror data and environment-based path resolution
- Legacy compatibility with older PHP/Apache frontends

## Quick start

```bash
git pull
npm install
npm run build-search-db   # build dg.db (SQLite/FTS5) from fresh Bilara data
npm start                 # run the production server (dg-fastify.js), port 3000
```

`build-search-db` should be rerun whenever source texts or translations change on disk. The server reads data directly from disk and rebuilds the search index as needed.

Data paths such as `SC_BILARA`, `DG_OFFLINE`, and offline mirrors are resolved automatically based on the runtime environment (Termux, Windows development, local server, etc.).

`unused/dg-light.js` and `unused/dblight.js` (`npm run start:express`) are legacy Express + grep services and are not used in production. See [CLAUDE.md](CLAUDE.md) for details.

## Deployment checks

```bash
curl "http://localhost:3000/search?q=kacchapa&scope=dhamma&langs=ru,en"
curl -I "http://localhost:3000/assets/js/datatables/datatables.min.js"   # 200 from public/overrides/js/datatables, not from the legacy repo
curl -I "http://localhost:3000/dn22"                                  # reader via clean URL
curl -I "http://localhost:3000/dn22:10.5"                             # segment link (scroll to 10.5)
```

Manual browser checks:

- `/nodejs/res/?q=kacchapa&scope=dhamma` — search, DataTables, export
- `/dn22` — full-text reader
- Pāli / Russian toggle (three modes: Pāli + translation → Pāli only → translation only) — should actually hide/show content correctly
- `/?q=dn22#12.1` (legacy format) — should continue to work alongside `/dn22:12.1`

## Deployment notes for Apache/PHP

If the public Dhamma.Gift site is currently hosted by Apache/PHP while Node runs as a separate backend proxied only to `/search`, note the following:

- search requests may route to the Node backend
- static files and reader routes may still be served by Apache/PHP
- root-domain routing can differ from the local development environment
- `dg-fastify` is the modern backend, while legacy PHP pages remain in parallel for compatibility

## Project structure

```text
dg-fastify.js         — production server (Fastify + SQLite/FTS5, dg.db): /search, /api/text/:suttaId,
                         static files (search/, reader/, siteroot/assets/), offline mirrors,
                         clean URLs (/dn22, /dn22:12.1)
unused/dg-light.js    — legacy Express + grep server, not used in production (see CLAUDE.md)
unused/dblight.js     — build script for dg-light.js → dg_db_light.json (legacy, not needed with dg.db)
search/               — search page (DataTables); legacy URL remains /nodejs/res/... (see CLAUDE.md)
reader/               — reader frontend (reader-template.html + megareader.js)
configs/              — project JSON configs (openapi, reader/*, search/*), see CLAUDE.md
docs/                 — project documentation and compatibility notes (SPA plans, backward compatibility)
siteroot/             — root-site publication: assets/ (legacy assets), 4nt/config/login/,
                         memo/read (legacy tools), see CLAUDE.md
```

## License

See the repository license and project-specific notes in the root of the project.
