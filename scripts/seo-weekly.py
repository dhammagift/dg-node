#!/usr/bin/env python3
"""Weekly SEO check of dhamma.gift, run by cron on the box that serves it (f3), report to the admin Telegram chat.

What it checks, every URL of the live sitemap (fetched from this box as Googlebot, no redirects followed):
  status 200, one canonical equal to the URL, no noindex, title and description present, hreflang targets listed
  in the sitemap; plus Google Search Console: index state of every docs page and a random sample per text sitemap,
  clicks/impressions of the last 7 days against the 7 before. Numbers are compared with last week's run.
It reports whether or not anything is wrong: silence means the job itself did not run.

Usage: python3 -I scripts/seo-weekly.py [--no-send]       (cron: 0 4 * * 1, i.e. Monday 09:00 Almaty)
State and reports: /var/lib/dg-seo/ (state.json, report-YYYY-MM-DD.txt, audit-YYYY-MM-DD.json).
"""
import base64, concurrent.futures as cf, http.client, json, os, random, re, socket, ssl, subprocess, sys, tempfile, time
import urllib.parse, urllib.request
from collections import Counter, defaultdict
from datetime import date, timedelta

SITE = 'https://dhamma.gift'
IP = os.environ.get('DG_SEO_IP', '127.0.0.1')          # this box serves dhamma.gift itself
STATE_DIR = os.environ.get('DG_SEO_DIR', '/var/lib/dg-seo')
GSC_KEY = '/root/.secrets/gsc.json'
BOT_CONFIG = '/var/www/telegram_bot/config.dgift_bot.json'
UA = 'Mozilla/5.0 (compatible; Googlebot/2.1; +http://www.google.com/bot.html)'
SAMPLE = 40                                            # URL Inspection quota is 2000/day; ~220 per run
ctx = ssl.create_default_context()


def fetch(path):
    c = http.client.HTTPSConnection(IP, 443, timeout=60, context=ctx)
    c.sock = ctx.wrap_socket(socket.create_connection((IP, 443), 60), server_hostname='dhamma.gift')
    c.request('GET', path, headers={'Host': 'dhamma.gift', 'User-Agent': UA, 'Accept-Encoding': 'identity'})
    r = c.getresponse()
    body = r.read().decode('utf8', 'replace') if r.status == 200 else ''
    return r.status, {k.lower(): v for k, v in r.getheaders()}, body


def attr(tag, name):
    m = re.search(name + r'=(?:"([^"]*)"|\'([^\']*)\'|([^\s>]+))', tag)
    return (m.group(1) or m.group(2) or m.group(3)) if m else None


def check(url):
    try:
        st, h, b = fetch(url.replace(SITE, '') or '/')
    except Exception as e:
        return url, ['fetch-error ' + str(e)[:60]], {}
    if st != 200:
        return url, [f'status-{st}'], {}
    head = b.split('</head>')[0]
    links, metas = re.findall(r'<link\b[^>]*>', head), re.findall(r'<meta\b[^>]*>', head)
    issues, info = [], {}
    can = [attr(l, 'href') for l in links if re.search(r'rel=["\']?canonical', l)]
    if len(can) != 1:
        issues.append(f'canonical-count-{len(can)}')
    elif urllib.parse.unquote(can[0]) != urllib.parse.unquote(url):
        issues.append('canonical-elsewhere')
    if any('noindex' in (attr(m, 'content') or '') for m in metas if re.search(r'name=["\']?robots', m)) or 'noindex' in h.get('x-robots-tag', ''):
        issues.append('noindex')
    t = re.search(r'<title[^>]*>([^<]*)</title>', head)
    info['title'] = t.group(1).strip() if t else ''
    if not info['title']:
        issues.append('no-title')
    if not [m for m in metas if re.search(r'name=["\']?description', m) and attr(m, 'content')]:
        issues.append('no-description')
    info['hreflang'] = [attr(l, 'href') for l in links if 'hreflang' in l]
    return url, issues, info


def site_audit():
    st, _, idx = fetch('/sitemap.xml')
    if st != 200:
        raise RuntimeError(f'/sitemap.xml answered {st}')
    locs = re.findall(r'<loc>([^<]+)</loc>', idx)
    if '<sitemapindex' in idx:
        locs = [l for c in locs for l in re.findall(r'<loc>([^<]+)</loc>', fetch(c.replace(SITE, ''))[2])]
    # grouped by kind here, not by sitemap file: the report reads the same whatever the sitemap's layout
    parts = defaultdict(list)
    for u in (l.replace('&amp;', '&') for l in locs):
        p = u.replace(SITE, '')
        lang = (re.search(r'[?&]lang=([\w-]+)', p) or [None, 'en'])[1]
        kind = 'docs' if '/docs/' in p else 'texts' if re.match(r'^/[a-z]+(-[a-z]+)*\d', p) else 'pages'
        parts[kind if kind != 'texts' else 'texts-' + (lang if lang in ('en', 'ru') else 'other')].append(u)
    urls = [u for us in parts.values() for u in us]
    res = {}
    with cf.ThreadPoolExecutor(6) as ex:
        for u, iss, info in ex.map(check, urls):
            res[u] = {'issues': iss, **info}
    listed = set(urls)
    for u, r in res.items():
        if any(h and h != u and h not in listed for h in r.get('hreflang', [])):
            r['issues'].append('hreflang-not-in-sitemap')
    titles = defaultdict(list)
    for u, r in res.items():
        if r.get('title'):
            titles[r['title']].append(u)
    for us in titles.values():
        if len(us) > 1:
            for u in us:
                res[u]['issues'].append('duplicate-title')
    return parts, res


def gsc_token():
    k = json.load(open(GSC_KEY))
    b = lambda d: base64.urlsafe_b64encode(d).rstrip(b'=')
    now = int(time.time())
    h = b(json.dumps({'alg': 'RS256', 'typ': 'JWT'}).encode())
    c = b(json.dumps({'iss': k['client_email'], 'scope': 'https://www.googleapis.com/auth/webmasters',
                      'aud': k['token_uri'], 'iat': now, 'exp': now + 3600}).encode())
    with tempfile.NamedTemporaryFile('w', suffix='.pem', delete=True) as f:
        os.chmod(f.name, 0o600)
        f.write(k['private_key']); f.flush()
        sig = subprocess.run(['openssl', 'dgst', '-sha256', '-sign', f.name], input=h + b'.' + c, capture_output=True, check=True).stdout
    data = urllib.parse.urlencode({'grant_type': 'urn:ietf:params:oauth:grant-type:jwt-bearer',
                                   'assertion': (h + b'.' + c + b'.' + b(sig)).decode()}).encode()
    return json.load(urllib.request.urlopen(k['token_uri'], data))['access_token']


def gsc(tok, url, body=None):
    if not url.startswith('http'):
        url = 'https://www.googleapis.com/webmasters/v3/' + url
    req = urllib.request.Request(url, json.dumps(body).encode() if body else None,
                                 {'Authorization': 'Bearer ' + tok, 'Content-Type': 'application/json'})
    return json.load(urllib.request.urlopen(req, timeout=60))


def gsc_report(parts):
    tok = gsc_token()
    site = urllib.parse.quote('sc-domain:dhamma.gift', safe='')
    today = date.today()
    perf = {}
    for name, start, end in (('week', today - timedelta(9), today - timedelta(3)), ('prev', today - timedelta(16), today - timedelta(10))):
        r = gsc(tok, f'sites/{site}/searchAnalytics/query', {'startDate': str(start), 'endDate': str(end), 'dimensions': ['page'], 'rowLimit': 25000})
        rows = r.get('rows', [])
        perf[name] = {'clicks': sum(x['clicks'] for x in rows), 'impressions': sum(x['impressions'] for x in rows), 'pages': len(rows)}
    random.seed(str(today))
    groups = {'docs': parts.get('docs', [])}
    for name, us in parts.items():
        if name.startswith('texts'):
            groups[name] = random.sample(us, min(SAMPLE, len(us)))
    inspected = {}
    for g, us in groups.items():
        c, examples = Counter(), {}
        for u in us:
            try:
                st = gsc(tok, 'https://searchconsole.googleapis.com/v1/urlInspection/index:inspect',
                         {'inspectionUrl': u, 'siteUrl': 'sc-domain:dhamma.gift'})['inspectionResult']['indexStatusResult']
                cs = st.get('coverageState', '?')
            except Exception as e:
                cs = 'inspect-error'
            c[cs] += 1
            examples.setdefault(cs, u)
        inspected[g] = {'n': len(us), 'states': dict(c), 'examples': examples}
    return perf, inspected


ISSUE_TEXT = {  # what each finding means, in plain words (the owner reads it, and so does an English-only helper)
    'status': "don't open (error {code})",
    'fetch-error': 'the server did not answer',
    'noindex': 'are closed to search engines, yet listed in the sitemap',
    'canonical-elsewhere': 'name another URL as the main one, so Google will not take them',
    'canonical-count-0': 'have no main URL (canonical)',
    'canonical-count-2': 'have two main URLs (canonical)',
    'no-title': 'have no title',
    'no-description': 'have no search description',
    'duplicate-title': 'share their title with another page',
    'hreflang-not-in-sitemap': 'link to their translations, which are missing from the sitemap, so Google does not find them',
}
# per finding: 🔴 the page is broken, 🟠 it keeps pages out of Google, 🟡 it weakens them in results
SEVERITY = {'status': '🔴', 'fetch-error': '🔴', 'noindex': '🟠', 'canonical-elsewhere': '🟠', 'canonical-count-0': '🟠',
            'canonical-count-2': '🟠', 'hreflang-not-in-sitemap': '🟠', 'no-title': '🟡', 'no-description': '🟡', 'duplicate-title': '🟡'}
STATE_TEXT = {
    'Discovered - currently not indexed': 'found but not crawled yet',
    'Crawled - currently not indexed': 'crawled but not indexed',
    'URL is unknown to Google': 'unknown to Google',
    'Page with redirect': 'redirects',
    'Alternate page with proper canonical tag': 'duplicates',
    'Duplicate, Google chose different canonical than user': 'duplicates',
    'Duplicate without user-selected canonical': 'duplicates',
}
GROUP_TEXT = {'docs': 'docs', 'texts-en': 'texts, English', 'texts-ru': 'texts, Russian', 'texts-other': 'texts, other languages'}
MONTHS = 'Jan Feb Mar Apr May Jun Jul Aug Sep Oct Nov Dec'.split()


def num(n):
    return (f'{n / 1000:.1f}'.replace('.0', '') + 'k') if n >= 1000 else str(n)


def s_(n, word):
    return f'{num(n)} {word}{"" if n == 1 else "s"}'


def render(run, prev):
    """Telegram text: the verdict first, then plain words. Details stay in the files."""
    kinds, perf, inspected = run['issues'], run['perf'], run['inspected']
    st, en = date.fromisoformat(run['period'][0]), date.fromisoformat(run['period'][1])
    period = f'{MONTHS[st.month - 1]} {st.day}–{en.day}' if st.month == en.month else f'{MONTHS[st.month - 1]} {st.day} – {MONTHS[en.month - 1]} {en.day}'
    findings = []
    rank = {'🔴': 0, '🟠': 1, '🟡': 2}
    base_of = lambda k: 'status' if k.startswith('status-') else k
    for k, n in sorted(kinds.items(), key=lambda x: (rank[SEVERITY.get(base_of(x[0]), '🟡')], -x[1])):
        base, code = k.split('-', 1) if k.startswith('status-') else (k, '')
        findings.append((SEVERITY.get(base, '🟡'), f'• {s_(n, "page")} ' + ISSUE_TEXT.get(base, k).format(code=code)))
    drops = [g for g, r in inspected.items() if prev.get('indexed', {}).get(g, 0) - r['pct'] >= 10]
    w, p = perf['week'], perf['prev']
    halved = p['clicks'] >= 20 and w['clicks'] < p['clicks'] / 2
    # the headline: the worst severity present, then how many of each; an index or traffic collapse is critical too
    count = Counter(m for m, _ in findings)
    alarms = [('index dropped: ' + ', '.join(GROUP_TEXT.get(g, g) for g in drops)) if drops else '', 'clicks from Google halved' if halved else '']
    alarms = [a for a in alarms if a]
    if not findings and not alarms:
        head = '🟢 All good'
    else:
        worst = '🔴' if alarms or count['🔴'] else '🟠' if count['🟠'] else '🟡'
        head = worst + ' ' + ' · '.join(filter(None, alarms + [f'{count[m]} {name}' for m, name in (('🔴', 'critical'), ('🟠', 'medium'), ('🟡', 'minor')) if count[m]]))
    out = [head, f'SEO dhamma.gift · {period}', '',
           f'From Google this week: {s_(w["clicks"], "click")} (week before: {num(p["clicks"])}), '
           f'{s_(w["impressions"], "impression")} in search (before: {num(p["impressions"])})', '', 'Indexed by Google:']
    for g, r in inspected.items():
        was = prev.get('indexed', {}).get(g)
        trend = '' if was is None or was == r['pct'] else f', was {was}%'
        sample = '' if g == 'docs' else ' sampled'
        out.append(f'• {GROUP_TEXT.get(g, g)}: {r["pct"]}% ({r["ok"]} of {r["n"]}{sample}{trend})')
    why = Counter()
    for g, r in inspected.items():
        for cs, n in r['states'].items():
            if cs != 'Submitted and indexed':
                why[STATE_TEXT.get(cs, cs)] += n
    if why:
        out.append('The rest: ' + ', '.join(f'{t} {n}' for t, n in why.most_common()))
    out += ['', f'Site check ({num(run["urls"])} URLs in the sitemap):']
    for mark, title in (('🔴', 'Critical: pages broken'), ('🟠', 'Medium: keeps pages out of Google'), ('🟡', 'Minor: weakens pages in results')):
        group = [t for m, t in findings if m == mark]
        if group:
            out += [f'{mark} {title}'] + group
    if not findings:
        out.append('🟢 no errors')
    out += ['', f'Details: {STATE_DIR}/report-{run["date"]}.txt']
    return '\n'.join(out)


def details(run, res):
    lines = [f'SEO dhamma.gift {run["date"]}, all findings with examples', '']
    for k, n in sorted(run['issues'].items(), key=lambda x: -x[1]):
        ex = [u.replace(SITE, '') for u, r in res.items() if k in r['issues']][:10]
        lines.append(f'{k}: {n}\n    ' + '\n    '.join(ex))
    for g, r in run['inspected'].items():
        lines.append(f'\nGSC {g}: {r["ok"]}/{r["n"]}')
        for cs, n in r['states'].items():
            lines.append(f'    {cs}: {n}, e.g. {r["examples"][cs].replace(SITE, "")}')
    return '\n'.join(lines)


def main():
    os.makedirs(STATE_DIR, exist_ok=True)
    state_file = os.path.join(STATE_DIR, 'state.json')
    prev = json.load(open(state_file)) if os.path.exists(state_file) else {}
    if '--render' in sys.argv:            # re-render the last run's message, no checks
        run = json.load(open(os.path.join(STATE_DIR, 'last-run.json')))
        return print(render(run, json.load(open(os.path.join(STATE_DIR, 'prev-state.json'))) if os.path.exists(os.path.join(STATE_DIR, 'prev-state.json')) else {}))
    parts, res = site_audit()
    perf, inspected = gsc_report(parts)
    for r in inspected.values():
        r['ok'] = r['states'].get('Submitted and indexed', 0)
        r['pct'] = r['ok'] * 100 // max(r['n'], 1)
    today = date.today()
    run = {'date': str(today), 'period': [str(today - timedelta(9)), str(today - timedelta(3))], 'urls': len(res),
           'issues': dict(Counter(i for r in res.values() for i in r['issues'])), 'perf': perf, 'inspected': inspected}
    msg = render(run, prev)
    print(msg)
    open(os.path.join(STATE_DIR, f'report-{today}.txt'), 'w').write(msg + '\n\n' + details(run, res) + '\n')
    json.dump(res, open(os.path.join(STATE_DIR, f'audit-{today}.json'), 'w'), ensure_ascii=False)
    json.dump(run, open(os.path.join(STATE_DIR, 'last-run.json'), 'w'), ensure_ascii=False)
    if prev:
        json.dump(prev, open(os.path.join(STATE_DIR, 'prev-state.json'), 'w'))
    json.dump({'date': str(today), 'indexed': {g: r['pct'] for g, r in inspected.items()}}, open(state_file, 'w'))
    if '--no-send' not in sys.argv:
        send(msg)


def send(text):
    c = json.load(open(BOT_CONFIG))
    admin = c['ADMIN_ID'][0] if isinstance(c['ADMIN_ID'], list) else c['ADMIN_ID']
    for i in range(0, len(text), 3900):
        urllib.request.urlopen(f'https://api.telegram.org/bot{c["TOKEN"]}/sendMessage',
                               urllib.parse.urlencode({'chat_id': admin, 'text': text[i:i + 3900]}).encode(), timeout=30)


if __name__ == '__main__':
    try:
        main()
    except Exception as e:
        msg = f'🔴 SEO dhamma.gift: the weekly check itself failed: {type(e).__name__}: {e}'
        print(msg, file=sys.stderr)
        if '--no-send' not in sys.argv:
            send(msg)
        sys.exit(1)
