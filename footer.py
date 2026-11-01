#!/usr/bin/env python3
"""Footer of every page: the „Общи условия“ link and the social buttons.

  python footer.py

Fill in the addresses in SOCIAL and RATE and run it again; an empty one stays hidden.
"""
import re, sys
from pathlib import Path
P = Path(__file__).resolve().parent / 'public'
pages = P / 'pages'

# Social profiles: fill in the real addresses. An empty one is left out of the footer.
SOCIAL = [
  ('Facebook', '', '<path d="M13.5 21v-7.5H16l.4-3H13.5V8.6c0-.9.3-1.5 1.5-1.5h1.6V4.4c-.3 0-1.2-.1-2.3-.1-2.3 0-3.8 1.4-3.8 3.9v2.3H8v3h2.5V21h3z" fill="currentColor"/>'),
  ('Instagram', '', '<rect x="3.5" y="3.5" width="17" height="17" rx="5" fill="none" stroke="currentColor" stroke-width="2"/><circle cx="12" cy="12" r="4" fill="none" stroke="currentColor" stroke-width="2"/><circle cx="17.3" cy="6.7" r="1.2" fill="currentColor"/>'),
  ('TikTok', '', '<path d="M16.2 3c.3 2.2 1.6 3.6 3.8 3.8v3c-1.4.1-2.7-.3-3.8-1.1v6.1a5.7 5.7 0 1 1-5.7-5.7h.6v3.1a2.6 2.6 0 1 0 2 2.6V3h3.1z" fill="currentColor"/>'),
]
# Later: Google („Оцени ни“) and Tripadvisor. Same shape, shown as a button with text.
RATE = [
  ('Оцени ни в Google', '', '<path d="M12 3.5l2.6 5.3 5.9.9-4.3 4.1 1 5.8L12 16.9l-5.2 2.7 1-5.8-4.3-4.1 5.9-.9z" fill="currentColor"/>'),
  ('Tripadvisor', '', '<circle cx="7.5" cy="13" r="3.5" fill="none" stroke="currentColor" stroke-width="2"/><circle cx="16.5" cy="13" r="3.5" fill="none" stroke="currentColor" stroke-width="2"/><path d="M3 9.5c2.5-2.6 5.6-3.5 9-3.5s6.5.9 9 3.5" fill="none" stroke="currentColor" stroke-width="2"/>'),
]

def social_html():
    icons = ''.join('<a href="%s" target="_blank" rel="noopener" aria-label="Two Taxi в %s"><svg viewBox="0 0 24 24" aria-hidden="true">%s</svg></a>' % (u, n, s) for n, u, s in SOCIAL if u)
    rates = ''.join('<a class="rate" href="%s" target="_blank" rel="noopener"><svg viewBox="0 0 24 24" aria-hidden="true">%s</svg>%s</a>' % (u, s, n) for n, u, s in RATE if u)
    if not icons and not rates:
        return ''
    return '\n      <div class="social">%s%s</div>' % (icons, rates)

for f in pages.glob('*.html'):
    t = f.read_text(encoding='utf-8')
    # 1) „Общи условия“ after „Поверителност“ in the footer
    if 'href="/obshti-usloviya"' not in t:
        cur = ' aria-current="page"' if f.stem == 'obshti-usloviya' else ''
        t = re.sub(r'(<li><a href="/poveritelnost"[^>]*>Поверителност</a></li>)', lambda m: m.group(1) + '<li><a href="/obshti-usloviya"%s>Общи условия</a></li>' % cur, t, count=1)
    # 2) social row under the footer text (rebuilt each run)
    t = re.sub(r'\n      <div class="social">.*?</div>(?=\n    </div>\n    <div class="cols">)', '', t)
    t = re.sub(r'(<p style="margin:18px 0 0;max-width:36ch">[^<]*</p>)(?=\n    </div>\n    <div class="cols">)', lambda m: m.group(1) + social_html(), t, count=1)
    f.write_text(t, encoding='utf-8')
    print(f.name, 'href="/obshti-usloviya"' in t)
