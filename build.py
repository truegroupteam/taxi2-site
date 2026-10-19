#!/usr/bin/env python3
"""Builds src/worker.js — one-file Cloudflare Worker with the whole site embedded."""
import base64, json, os, datetime
ROOT = os.path.dirname(os.path.abspath(__file__))
PUB = os.path.join(ROOT, 'public')
FILES = {
    '/': ('index.html', 'text/html; charset=utf-8'),
    '/favicon.ico': ('favicon.ico', 'image/x-icon'),
    '/apple-touch-icon.png': ('apple-touch-icon.png', 'image/png'),
    '/img/two-taxi-logo.webp': ('img/two-taxi-logo.webp', 'image/webp'),
    '/img/icon-192.png': ('img/icon-192.png', 'image/png'),
    '/img/og.jpg': ('img/og.jpg', 'image/jpeg'),
    '/robots.txt': ('robots.txt', 'text/plain; charset=utf-8'),
    '/sitemap.xml': ('sitemap.xml', 'application/xml; charset=utf-8'),
}
TEXT = ('text/', 'application/xml', 'application/json')
out = ['// two Taxi — taxi2.bg. Single-file Worker: the whole site is inside this file.',
       '// Built by build.py on ' + datetime.date.today().isoformat() + '. Edit public/ and rebuild.',
       'const FILES = {']
for path, (rel, ctype) in FILES.items():
    data = open(os.path.join(PUB, rel), 'rb').read()
    if ctype.startswith(TEXT):
        out.append(f'  {json.dumps(path)}: {{ type: {json.dumps(ctype)}, text: {json.dumps(data.decode("utf-8"), ensure_ascii=False)} }},')
    else:
        out.append(f'  {json.dumps(path)}: {{ type: {json.dumps(ctype)}, b64: {json.dumps(base64.b64encode(data).decode())} }},')
out.append('};')
out.append(r'''
// Where driver applications are sent (the two Taxi server). Override with the API_ORIGIN variable.
const DEFAULT_API = 'https://116-203-244-23.sslip.io';

const SECURITY = {
  'X-Content-Type-Options': 'nosniff',
  'Referrer-Policy': 'strict-origin-when-cross-origin',
  'X-Frame-Options': 'DENY',
  'Permissions-Policy': 'geolocation=(), camera=(), microphone=()',
  'Strict-Transport-Security': 'max-age=31536000; includeSubDomains'
};

function decode(b64) {
  const bin = atob(b64);
  const out = new Uint8Array(bin.length);
  for (let i = 0; i < bin.length; i++) out[i] = bin.charCodeAt(i);
  return out;
}

function json(status, data) {
  return new Response(JSON.stringify(data), { status, headers: { 'Content-Type': 'application/json; charset=utf-8', 'Cache-Control': 'no-store', ...SECURITY } });
}

async function apply(request, env) {
  const body = await request.text();
  if (body.length > 4000) return json(413, { error: 'Твърде дълго съобщение.' });
  const api = (env && env.API_ORIGIN) || DEFAULT_API;
  try {
    const r = await fetch(api + '/api/public/apply', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'X-Forwarded-For': request.headers.get('CF-Connecting-IP') || '' },
      body
    });
    const text = await r.text();
    return new Response(text, { status: r.status, headers: { 'Content-Type': 'application/json; charset=utf-8', 'Cache-Control': 'no-store', ...SECURITY } });
  } catch (e) {
    return json(502, { error: 'В момента не можем да приемем заявката. Опитай пак след малко.' });
  }
}

export default {
  async fetch(request, env) {
    const url = new URL(request.url);
    if (url.hostname === 'www.taxi2.bg') {
      url.hostname = 'taxi2.bg';
      return Response.redirect(url.toString(), 301);
    }
    if (url.pathname === '/api/apply') {
      if (request.method !== 'POST') return json(405, { error: 'Method Not Allowed' });
      return apply(request, env);
    }
    if (request.method !== 'GET' && request.method !== 'HEAD') {
      return new Response('Method Not Allowed', { status: 405, headers: { Allow: 'GET, HEAD' } });
    }
    let path = url.pathname;
    if (path === '/index.html') path = '/';
    const file = FILES[path];
    if (!file) {
      return new Response(null, { status: 302, headers: { Location: '/' } });
    }
    const headers = new Headers(SECURITY);
    headers.set('Content-Type', file.type);
    headers.set('Cache-Control', path === '/' ? 'public, max-age=300' : 'public, max-age=86400');
    const body = file.b64 ? decode(file.b64) : file.text;
    return new Response(request.method === 'HEAD' ? null : body, { headers });
  }
};
''')
open(os.path.join(ROOT, 'src', 'worker.js'), 'w').write('\n'.join(out))
print('worker.js', os.path.getsize(os.path.join(ROOT, 'src', 'worker.js')), 'bytes')
