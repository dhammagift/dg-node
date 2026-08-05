# Backward Compatibility & URL Redirect Requirements

## Status: Documentation Phase (Needs Server Testing)

This document collects all backward compatibility requirements, questions, and incomplete items for SPA migration.

---

## Old URL Formats to Support

### Legacy Search Links
```
/?q=kacchapa                      → /spa/kacchapa
/?q=kacchapa&lb=1&la=2            → /spa/kacchapa (+ preserve context params)
/?q=kacchapa&scope=dhamma&langs=ru,en  → /spa/kacchapa (+ preserve filters)
/?q=dn22:2.2                      → /spa/dn22:2.2
/?q=dn22:2.2&s=kacchapa           → /spa/dn22:2.2/kacchapa
```

### Legacy Reader Links
```
/?q=dn22:2.2                      → /spa/dn22:2.2
/?q=dn22:2.2#12.1                 → /spa/dn22:2.2 (+ navigate to segment 12.1)
/?q=dn22#12.1                     → /spa/dn22 (+ navigate to segment 12.1)
/dn22                             → /spa/dn22 (direct reader URL)
/dn22:2.2                         → /spa/dn22:2.2
```

### Legacy Direct Links (External Sites)
```
https://dhamma.gift/?q=kacchapa
https://dhamma.gift/?q=dn22:2.2
https://dhamma.gift/dn22:2.2
https://dhamma.gift/?q=dn22:2.2&s=kacchapa
https://dhamma.gift/?q=dn22:2.2#12.1
```

---

## Redirect Strategy

### 301 vs Soft Redirect

**Decision Needed:**
- [ ] Use **server-side 301 redirects** (Express middleware in dg-light.js)?
  - Pro: Search engines reindex, old links get SEO credit
  - Con: Old links break immediately if not configured right
  
- [ ] Use **client-side redirects** (router.js handles it)?
  - Pro: Simpler, SPA handles it transparently
  - Con: Old links still point to old URL in browser bar, SEO crawlers see redirect

**Recommendation:** Mix both
- Server does 301 for direct `/` and `/?q=...` requests
- SPA router handles `/spa/*` internal routing

### Required Middleware (To Implement)

```javascript
// Redirect /?q=... → /spa/... (with 301)
app.get('/', (req, res) => {
  if (req.query.q) {
    const cleanUrl = buildSpaUrl(req.query.q, req.query);
    return res.redirect(301, cleanUrl);  // ← 301 permanent redirect
  }
  res.sendFile(path.join(__dirname, 'public', 'spa', 'index.html'));
});

// Redirect /dn22, /mn1, etc → /spa/dn22, /spa/mn1 (if not reader template)
// Need to check: does current code serve reader template at /dn22 or redirect?
```

---

## Questions to Answer (Via Server Testing)

### Current Behavior
- [ ] What does `http://localhost:3000/?q=kacchapa` currently do?
- [ ] What does `http://localhost:3000/?q=dn22:2.2` currently do?
- [ ] What does `http://localhost:3000/dn22` currently do?
- [ ] What does `http://localhost:3000/dn22:2.2` currently do?
- [ ] Does `/?q=dn22:2.2&s=kacchapa` currently work? How?
- [ ] How are anchor fragments handled? `/?q=dn22#12.1`

### Search Parameters
- [ ] Are `lb`, `la`, `scope`, `langs` parameters currently used in UI?
- [ ] Should they be preserved when redirecting to SPA?
- [ ] Should they be stored in state when user opens SPA via old link?

### Reader Segments
- [ ] How does current reader handle segment IDs like `12.1`?
- [ ] Is it via URL fragment `#12.1` or query param?
- [ ] Does current code scroll to segment automatically?
- [ ] Should SPA do the same?

### External Links
- [ ] Which external sites link to dhamma.gift?
- [ ] What URL formats do they use?
- [ ] Do they use direct links or via redirects?

---

## Implementation Checklist

### Server-Side Redirects (dg-light.js)

- [ ] Detect `/?q=...` requests
- [ ] Parse query string params (`q`, `s`, `lb`, `la`, `scope`, `langs`)
- [ ] Build clean SPA URL with `router.js::buildUrl()`
- [ ] Return `301 Moved Permanently` redirect
- [ ] Test with curl:
  ```bash
  curl -i http://localhost:3000/?q=kacchapa
  curl -i http://localhost:3000/?q=dn22:2.2&s=kacchapa
  ```

### Client-Side Router Enhancements (router.js)

- [ ] Parse URL fragments (anchors) for segment navigation
- [ ] Handle encoded query params in clean URLs
- [ ] Store `lb`, `la`, `scope`, `langs` in state when navigating from old URL
- [ ] Pass context params to search API

### State Integration (state.js)

- [ ] Add `preservedParams` object to search state
- [ ] Store `lb`, `la`, `scope`, `langs` when opening old links
- [ ] Apply params to next search

### Views Integration (views.js)

- [ ] Read `state.search.lb`, `state.search.la`, etc when rendering
- [ ] Apply context params to API call
- [ ] Show preserved filters in UI

---

## Testing Plan

### Manual Testing (After Implementation)

```
Browser: http://localhost:3000

1. Test search redirects:
   /?q=kacchapa → should redirect to /spa/kacchapa
   /?q=dn22:2.2 → should redirect to /spa/dn22:2.2
   /?q=dn22:2.2&s=kacchapa → should redirect to /spa/dn22:2.2/kacchapa
   /?q=kacchapa&lb=1&la=2&scope=dhamma → check if params preserved

2. Test reader redirects:
   /?q=dn22:2.2 → should redirect to /spa/dn22:2.2
   /dn22 → should redirect to /spa/dn22 (if not already serving reader)
   /dn22:2.2 → should redirect to /spa/dn22:2.2 (if needed)

3. Test anchors:
   /?q=dn22:2.2#12.1 → redirect to /spa/dn22:2.2, scroll to 12.1
   /spa/dn22:2.2#12.1 → should auto-scroll to 12.1

4. Test deep links:
   Copy /spa/kacchapa URL → share → open in new tab → works
   Copy /spa/dn22:2.2 URL → share → open in new tab → works

5. Test browser history:
   Start at /spa/ → search → /spa/kacchapa → click dn22 → /spa/dn22:2.2
   Click browser back → /spa/kacchapa
   Click browser back → /spa/
   Click forward → /spa/kacchapa
```

### Automated Testing (To Create)

```javascript
// router.test.js or similar
test('redirectLegacyUrl: /?q=kacchapa', () => {
  const url = router.redirectLegacyUrl('/', '?q=kacchapa');
  expect(url).toBe('/spa/kacchapa');
});

test('redirectLegacyUrl: /?q=dn22:2.2&s=kacchapa', () => {
  const url = router.redirectLegacyUrl('/', '?q=dn22:2.2&s=kacchapa');
  expect(url).toBe('/spa/dn22:2.2/kacchapa');
});
```

---

## Search Engine Optimization (SEO)

### Old URLs Should Return 301

**Why:** Google and other search engines will transfer ranking to new URLs

```
Old URL: http://dhamma.gift/?q=kacchapa
Status Code: 301 Moved Permanently
Location: http://dhamma.gift/spa/kacchapa
```

### Check Current Indexing

- [ ] Google Search Console — see what URLs are indexed
- [ ] Verify old links get 301 redirects (not soft 302)
- [ ] Monitor for crawl errors after redirect

### Sitemap

- [ ] Update `sitemap.xml` if exists
- [ ] Add `/spa/` paths to sitemap
- [ ] Remove `/?q=...` paths from sitemap (or mark as redirected)

---

## Edge Cases & Special Handling

### Query String Encoding

**Question:** How are non-ASCII characters handled?
- `/?q=पाली` (Devanagari) → `/spa/पाली` or `/spa/%E0%A4%AA%E0%A4%BE%E0%A4%B2%E0%A5%80`
- `/?q=กัมพูชา` (Thai) → encoded properly?

**To Test:**
```bash
curl "http://localhost:3000/?q=%E0%A4%AA%E0%A4%BE%E0%A4%B2%E0%A5%80"
```

### Malformed URLs

**Question:** What if user opens:
- `/?q=` (empty query)
- `/?q=!!!invalid!!!`
- `/?q=dn22&s=&lb=xyz`

**To Handle:**
- [ ] Sanitize inputs
- [ ] Show error page gracefully
- [ ] Don't crash server

### Multiple Values

**Question:** Does current code support multiple values?
- `/?q=kacchapa&q=sujato` (rare, but possible)
- `/?langs=ru&langs=en` (multiple languages)

**To Check:** See if this is even used

---

## Links to Verify on Server

**When you have server access, check these pages:**

- [ ] Home page search form — what URL does it generate?
- [ ] Search results page — how are results linked? `/dn22` or `/?q=dn22` or clean URL?
- [ ] Reader page — how does it handle back-to-search?
- [ ] Share buttons — what URL format do they use?
- [ ] Footer links — any hardcoded links to old format?
- [ ] Mobile version — does it work correctly with redirects?

---

## Timeline & Priorities

### Phase 2 (Current)
- ✅ SPA framework works
- ❌ Backward compat layer not yet implemented

### Phase 2b (Next) — MUST HAVE
- [ ] Server-side 301 redirects for `/?q=...`
- [ ] Client-side handling of old URLs in SPA
- [ ] Test all old link formats
- [ ] Preserve search parameters (`lb`, `la`, `scope`, `langs`)

### Phase 3 (Nice to Have)
- [ ] Analytics for old link usage (how many people use old URLs?)
- [ ] Upgrade notice ("This link is redirecting, bookmark the new format")
- [ ] Auto-update old links in database (if stored somewhere)

### Phase 4 (Future)
- [ ] Remove `/nodejs/res/?q=` support (after SPA is stable)
- [ ] Archive old URL patterns in docs

---

## Notes

- **Current Issue:** router.js has `redirectLegacyUrl()` method but it's not being called
  - Need to wire it up in `app.js` or `dg-light.js`
  - Need to decide: server-side (301) or client-side (soft)

- **Current Issue:** No handling of URL fragments (`#12.1`) yet
  - Need to parse and pass to views
  - Need to implement segment navigation in reader

- **Recommendation:** Test old URL behavior FIRST before implementing
  - Inspect actual requests on server
  - Understand current flow completely
  - Then implement redirects based on findings

---

## Documents to Create Later

- [ ] User migration guide (for people to update bookmarks)
- [ ] Developer guide (how to handle old links in plugins/extensions)
- [ ] 301 redirect checklist (for deployment)
- [ ] SEO migration guide (for monitoring ranking changes)
