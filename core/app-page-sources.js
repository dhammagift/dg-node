// The apps' pages as their sources on disk (Sippa 2026-11-12, Trello AZlccNPc: «отвязать от сборок»). dg-apps takes the site's
// page and makes its own edits to it (app scripts, no service worker, viewport), so it needs the file itself, not the page as
// dg-fastify serves it (comments stripped, critical CSS, versioned URLs). Served at /app-src/<key> (dg-fastify.js) and listed
// with the hash of those bytes in the signed /app-site-manifest.json (scripts/site-manifest.js). A fixed list: nothing else is
// read through that path.
module.exports = {
    'search/index.html': 'search/index.html',
    'settings/index.html': 'settings/index.html',
    'memo/index.html': 'siteroot/memo/index.html',
};
