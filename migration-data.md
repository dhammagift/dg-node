# Domain Migration: Server Investigation Guide

**Date**: 2026-08-24  
**Status**: Planning phase — ready for server investigation  
**Goal**: Migrate dg-node from `test.dhamma.gift/nodejs/` → `test.dhamma.gift/` (root), then to production `dhamma.gift/`

---

## Current Understanding (from CLAUDE.md and code review)

### Architecture Today
- **Old PHP project** lives at `/var/www/html/` 
- **dg-node (Express)** lives at `/var/www/html/nodejs/`
- **Symlinks in `siteroot/`** point back up: `../../assets`, `../../config`, etc.
- **Apache** proxies requests to port 3000 (Express server)
- **test.dhamma.gift** already works (staging environment)

### URL Routing (Current)
- `/?q=kacchapa` → search results (old PHP or SPA?)
- `/nodejs/res/` → dg-node search UI
- `/assets/...` → resolved via symlinks (legacy assets)
- `/read/` → TTS voice player
- `/4nt/`, `/memo/`, `/login/`, `/config/` → legacy tools

### Migration Goal
```
BEFORE:  dhamma.gift/       = PHP project
         dhamma.gift/nodejs = dg-node

AFTER:   dhamma.gift/       = dg-node (SPA)
         dhamma.gift/old/   = PHP project (archived)
```

---

## Critical Questions to Answer ON SERVER

### 1. Apache Configuration
**Files to find:**
- Apache VirtualHost config for `test.dhamma.gift` (check `/etc/apache2/sites-available/` or `/etc/apache2/conf.d/`)
- How is port 3000 proxied? (ProxyPass? RewriteRule? Load balancer?)
- Current DocumentRoot and Directory settings
- Any `.htaccess` files in `/var/www/html/`

**What to look for:**
- [ ] Where does Apache route `/` requests? PHP script or proxy?
- [ ] Is there a RewriteRule that redirects `/?q=...` to something else?
- [ ] How does `/nodejs` currently work? Direct static serve or proxy?
- [ ] Is `core.symlinks=true` on Linux or do symlinks work natively?

**Commands to run:**
```bash
sudo apachectl configtest
sudo apache2ctl -S  # Show VirtualHosts
grep -r "ProxyPass\|RewriteRule" /etc/apache2/
ls -la /var/www/html/.htaccess  # Check for URL rewriting
cat /var/www/html/nodejs/.htaccess 2>/dev/null || echo "no .htaccess"
```

---

### 2. Current Symlinks in siteroot/

**Location:** `/var/www/html/nodejs/siteroot/`

**What to check:**
```bash
ls -la /var/www/html/nodejs/siteroot/
# For each symlink:
ls -la /var/www/html/nodejs/siteroot/assets
ls -la /var/www/html/nodejs/siteroot/read
ls -la /var/www/html/nodejs/siteroot/config
# etc.
```

**Expected output:**
- `assets -> ../../assets` (points to `/var/www/html/assets`)
- `read -> ../../read` (points to `/var/www/html/read`)
- `config -> ../../config` (points to `/var/www/html/config`)
- Many other symlinks to legacy tools/mirrors

**After migration, these must change to:**
- `assets -> ../old/assets` (points to `/var/www/html/old/assets`)
- `read -> ../old/read` (points to `/var/www/html/old/read`)
- etc.

---

### 3. Old PHP Project Structure

**Location:** `/var/www/html/` (before migration)

**What to check:**
```bash
ls -la /var/www/html/
# Look for:
# - index.php (entry point)
# - .htaccess (URL rewriting rules)
# - /assets/, /read/, /config/, /4nt/, /memo/, /login/
# - PHP source files (maybe index.php searches for /?q=)
```

**Questions:**
- [ ] Does `index.php` handle `/?q=...` search queries?
- [ ] How does it currently serve search results? File-based or API?
- [ ] What's the exact URL pattern for reader (e.g., `/dn22` vs `/?q=dn22`)?
- [ ] Are there hardcoded domain references in PHP code?

---

### 4. dg-node on test.dhamma.gift

**Location:** `/var/www/html/nodejs/`

**What to check:**
```bash
# Is Express server running?
ps aux | grep "node\|dg-light"

# What port is it listening on?
netstat -tlnp | grep -E ":3000|:8000|:9000"

# Test the API
curl -I http://localhost:3000/
curl -I http://localhost:3000/?q=test
curl http://localhost:3000/api/text/dn22 2>/dev/null | head -20

# Check symlinks
cd /var/www/html/nodejs/siteroot && ls -la
```

**Questions:**
- [ ] Is Express server running? On which port?
- [ ] Are symlinks resolving correctly (no 404s for `/assets/...`)?
- [ ] Does `/?q=test` return 301 redirect or 200 response?
- [ ] Can we access legacy tools (`/4nt/`, `/read/`, etc.) through Express?

---

### 5. URL Backward Compatibility

**Test each URL pattern:**
```bash
# Old search format
curl -I "http://test.dhamma.gift/?q=kacchapa"
curl -I "http://test.dhamma.gift/?q=kacchapa&lb=1&la=2"
curl -I "http://test.dhamma.gift/?q=dn22:2.2"

# Check response status (should be 301 or 200?)
# If 301, where does it redirect to?

# Old reader format
curl -I "http://test.dhamma.gift/dn22"
curl -I "http://test.dhamma.gift/dn22:2.2"

# Check if SPA router handles these
curl -s http://test.dhamma.gift/ | grep -o "spa\|router" | head -5
```

**Expected behaviors to verify:**
- [ ] Are old `/?q=...` URLs redirecting (301) or serving (200)?
- [ ] Where do they redirect to? (`/spa/kacchapa`?)
- [ ] Do fragment anchors work? (`#1.1` for segments?)
- [ ] Is there any middleware or .htaccess handling this?

---

### 6. Apache Proxy Configuration

**Critical:** How is the transition from Apache → port 3000?

```bash
# Check if Apache is using ProxyPass
grep -r "ProxyPass.*3000" /etc/apache2/

# Check rewrite rules
grep -r "RewriteRule\|RewriteEngine" /etc/apache2/

# Check Apache modules loaded
apache2ctl -M | grep proxy

# Test if reverse proxy is working
curl -v http://test.dhamma.gift/ 2>&1 | head -30
# Look for "X-Forwarded-For" or "X-Real-IP" headers
```

**Questions:**
- [ ] Is there a ProxyPass rule that sends all requests to port 3000?
- [ ] Or is it more selective (only `/nodejs/*` or specific paths)?
- [ ] Are there any rewrite rules that might interfere with SPA routing?

---

### 7. Offline Data & Mirrors

**Location:** `/var/www/offline-data/` or equivalent

```bash
# Check where offline data is stored
ls -la /var/www/offline-data/ 2>/dev/null || ls -la ~/offline-data/ || echo "not found"

# Check siteroot/data symlink
ls -la /var/www/html/nodejs/siteroot/data

# Check what mirrors are mounted
cd /var/www/html/nodejs/siteroot && ls -la | grep "\->"
```

**Question:**
- [ ] Where exactly are offline mirrors stored?
- [ ] How many symlinks in `siteroot/` need to be updated after migration?

---

## Files to Check in Git

```bash
# Current dg-light.js routing
grep -n "ProxyPass\|readdirSync\|siteroot\|?.q=" /home/user/dg-node/dg-light.js | head -30

# Check if Apache config is in this repo
find /home/user/dg-node -name ".htaccess" -o -name "apache*" -o -name "*.conf"

# Check backward compatibility docs
cat /home/user/dg-node/docs/BACKWARD_COMPAT.md

# Check current SPA router
grep -n "/?q\|window.location" /home/user/dg-node/public/spa/router.js | head -20
```

---

## Action Plan (TO EXECUTE ON SERVER)

### Phase 0: Investigation (No Changes)
1. [ ] Run all "What to check" bash commands above
2. [ ] Verify Apache config and proxy setup
3. [ ] Confirm Express is running and symlinks work
4. [ ] Test backward compatibility of old URLs
5. [ ] Map out exact symlink structure

### Phase 1: Preparation (Test on test.dhamma.gift)
1. [ ] Create `/var/www/html/old/` directory
2. [ ] Copy (not move) all PHP files from `/var/www/html/` → `/var/www/html/old/`
3. [ ] Test PHP still works at `http://test.dhamma.gift/old/index.php`
4. [ ] Verify file permissions are correct

### Phase 2: Symlink Update (Still on test.dhamma.gift)
1. [ ] Backup current siteroot: `cp -r siteroot siteroot.backup`
2. [ ] Update symlinks: `../../{name}` → `../old/{name}`
3. [ ] Create new symlink: `old -> ../old`
4. [ ] Restart Express: check if all symlinks still resolve
5. [ ] Test: `curl http://localhost:3000/assets/...` should still work

### Phase 3: Apache Config Update
1. [ ] Identify which Apache rule routes traffic
2. [ ] If needed, update rule to point to new location (if it's not already dynamic)
3. [ ] Test Apache: `apachectl configtest`
4. [ ] Check if `/old/` is now accessible at `http://test.dhamma.gift/old/`

### Phase 4: Full Test on test.dhamma.gift
1. [ ] Test search/reader on SPA
2. [ ] Test legacy tools: `/4nt/`, `/read/`, `/memo/`, etc.
3. [ ] Test old URL formats: `/?q=...` patterns
4. [ ] Check for any 404 errors in logs
5. [ ] Verify assets load correctly

### Phase 5: Production (dhamma.gift)
- Repeat same steps for production

---

## Risk Mitigation

| Risk | Mitigation |
|------|-----------|
| Symlinks break | Keep backup (`siteroot.backup`) to restore quickly |
| PHP still needed | `/old/` keeps it accessible; can coexist |
| Apache config wrong | Check `.conf` files first; don't guess |
| Existing production breakage | Do all testing on `test.dhamma.gift` first |
| No rollback plan | Simply revert symlinks and restart Express |

---

## Notes for Self (When on Server)

- **Don't assume.** Check actual file structure, not CLAUDE.md.
- **Apache rules matter.** If migration fails, it's likely Apache config.
- **Symlinks are relative.** `../../` and `../old/` must be exact, or everything breaks.
- **Test locally first.** Run commands on `test.dhamma.gift` before touching production.
- **Backward compatibility.** Verify old `/?q=...` URLs work before calling migration done.
- **Offline mirrors.** Don't forget about symlinks to `/var/www/offline-data/` — those might need updates too.

---

## Commands Summary (Quick Reference)

```bash
# On server, run these to understand current state:
sudo apachectl -S
grep -r "ProxyPass" /etc/apache2/
ls -la /var/www/html/nodejs/siteroot/ | grep "\->"
curl -I "http://test.dhamma.gift/?q=kacchapa"
curl -I "http://localhost:3000/assets/..."
ps aux | grep "node"

# After making changes:
sudo systemctl restart apache2
cd /var/www/html/nodejs && npm restart  # or however Express is managed
curl -I "http://test.dhamma.gift/old/"
curl -s "http://test.dhamma.gift/assets/..." | head -1
```

---

## Final Checklist Before Migration

- [ ] Understand Apache config completely
- [ ] Verify all symlinks on test.dhamma.gift
- [ ] Test all URL backward compatibility patterns
- [ ] Confirm Express is stable and serving correctly
- [ ] Have a rollback plan (backup + quick restart)
- [ ] Know exactly which files need Apache config changes (if any)
- [ ] Understand how offline mirrors are set up (might need symlink updates)
- [ ] Document any environment-specific gotchas before touching production
