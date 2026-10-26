#!/usr/bin/env python3
"""Builds dist/worker.js: the whole taxi2.bg site packed into one Cloudflare Worker.

  python3 build.py

Pages live in public/pages/ (index.html -> "/", kontakti.html -> "/kontakti").
Every other file in public/ is served at its own path. Links like
"/site.css?v=0123456789" get the current file hash, so browsers pick up changes.
"""
import base64
import datetime
import hashlib
import json
import re
from pathlib import Path

ROOT = Path(__file__).resolve().parent
PUBLIC = ROOT / 'public'
TEMPLATE = ROOT / 'src' / 'worker.template.js'
OUT = ROOT / 'dist' / 'worker.js'

TYPES = {
    '.html': 'text/html; charset=utf-8',
    '.css': 'text/css; charset=utf-8',
    '.js': 'application/javascript; charset=utf-8',
    '.txt': 'text/plain; charset=utf-8',
    '.xml': 'application/xml; charset=utf-8',
    '.json': 'application/json; charset=utf-8',
    '.svg': 'image/svg+xml',
    '.ico': 'image/x-icon',
    '.png': 'image/png',
    '.jpg': 'image/jpeg',
    '.jpeg': 'image/jpeg',
    '.webp': 'image/webp',
}
TEXT = ('text/', 'application/javascript', 'application/xml', 'application/json')

# Served in this order; anything not listed follows, sorted.
ORDER = ['/site.css', '/site.js', '/favicon.ico', '/apple-touch-icon.png',
         '/img/two-taxi-logo.webp', '/img/two-mark.webp', '/img/icon-192.png',
         '/img/og.jpg', '/robots.txt', '/sitemap.xml']


def short_hash(path):
    return hashlib.sha256(path.read_bytes()).hexdigest()[:10]


def collect():
    pages = sorted((PUBLIC / 'pages').glob('*.html'), key=lambda p: (p.stem != 'index', p.stem))
    files = [('/' if p.stem == 'index' else '/' + p.stem, p) for p in pages]
    assets = {'/' + p.relative_to(PUBLIC).as_posix(): p
              for p in PUBLIC.rglob('*') if p.is_file() and 'pages' not in p.relative_to(PUBLIC).parts}
    for url in ORDER + sorted(set(assets) - set(ORDER)):
        if url in assets:
            files.append((url, assets[url]))
    return files, assets


def stamp_versions(html, assets):
    def repl(m):
        p = assets.get(m.group(1))
        return m.group(1) + '?v=' + (short_hash(p) if p else m.group(2))
    return re.sub(r'(/[\w./-]+)\?v=([0-9a-f]{10})\b', repl, html)


def main():
    files, assets = collect()
    entries = []
    for url, path in files:
        typ = TYPES.get(path.suffix.lower())
        if not typ:
            raise SystemExit('Unknown file type: ' + str(path))
        if typ.startswith(TEXT):
            text = path.read_text(encoding='utf-8')
            if typ.startswith('text/html'):
                text = stamp_versions(text, assets)
            value = 'text: ' + json.dumps(text, ensure_ascii=False)
        else:
            value = 'b64: ' + json.dumps(base64.b64encode(path.read_bytes()).decode())
        entries.append('  %s: { type: %s, %s }' % (json.dumps(url), json.dumps(typ), value))
    out = TEMPLATE.read_text(encoding='utf-8')
    out = out.replace('{{DATE}}', datetime.date.today().isoformat())
    out = out.replace('{{FILES}}', ''.join(e + ',\n' for e in entries).rstrip('\n'))
    OUT.parent.mkdir(exist_ok=True)
    OUT.write_text(out, encoding='utf-8')
    print('Built %s (%d files, %d KB)' % (OUT.relative_to(ROOT), len(entries), OUT.stat().st_size // 1024))


if __name__ == '__main__':
    main()
