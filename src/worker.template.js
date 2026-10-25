import { EmailMessage } from 'cloudflare:email';
// Two Taxi — taxi2.bg. Single-file Worker: the whole site is inside this file.
// Built by build.py on {{DATE}}. Edit public/ and rebuild.
const FILES = {
{{FILES}}
};

// Where driver applications are sent (the Two Taxi server). Override with the API_ORIGIN variable.
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

// UTF-8 text -> base64 (for the e-mail headers and body).
function b64(s) {
  const bytes = new TextEncoder().encode(s);
  let bin = '';
  for (const b of bytes) bin += String.fromCharCode(b);
  return btoa(bin);
}

const clean = (v, n) => String(v || '').replace(/[\r\n]+/g, ' ').slice(0, n).trim();
const cleanText = (v, n) => String(v || '').replace(/\r/g, '').slice(0, n).trim();

// Sends a plain-text e-mail through the APPLY_MAIL "Send email" binding.
// Without the binding nothing is sent (the driver application still reaches the admin app).
async function sendMail(env, subject, lines, replyTo) {
  if (!env || !env.APPLY_MAIL) return false;
  const from = 'noreply@taxi2.bg';
  const to = env.APPLY_TO || 'damyanov.true@gmail.com';
  const head = [
    'From: Two Taxi <' + from + '>',
    'To: ' + to,
    'Subject: =?UTF-8?B?' + b64(subject) + '?=',
    'Message-ID: <' + crypto.randomUUID() + '@taxi2.bg>',
    'Date: ' + new Date().toUTCString(),
    'MIME-Version: 1.0',
    'Content-Type: text/plain; charset=UTF-8',
    'Content-Transfer-Encoding: base64'
  ];
  if (replyTo && /^[^\s@<>",;]+@[^\s@<>",;]+\.[a-z]{2,}$/i.test(replyTo)) head.push('Reply-To: ' + replyTo);
  const raw = head.concat(['', b64(lines.join('\r\n')).replace(/.{76}/g, '$&\r\n')]).join('\r\n');
  try {
    await env.APPLY_MAIL.send(new EmailMessage(from, to, raw));
    return true;
  } catch (e) {
    console.log('mail failed', String(e));
    return false;
  }
}

const stamp = () => 'Получено: ' + new Date().toLocaleString('bg-BG', { timeZone: 'Europe/Sofia' });

function applyMail(env, d, saved) {
  const exp = { none: 'Нов съм', driver: 'Карал съм', taxi: 'Карам такси сега' }[d.experience] || '-';
  const car = d.own_car === 'yes' ? 'Има кола' : d.own_car === 'no' ? 'Няма кола' : '-';
  const name = clean(d.name, 60), phone = clean(d.phone, 30);
  return sendMail(env, 'Нов кандидат: ' + name + ' ' + phone, [
    'Нов кандидат за шофьор от taxi2.bg',
    '',
    'Име: ' + name,
    'Телефон: ' + phone,
    'Опит: ' + exp,
    'Кола: ' + car,
    'Съобщение: ' + (clean(d.message, 500) || '-'),
    '',
    saved ? 'Кандидатът е записан и в админ приложението.' : 'ВНИМАНИЕ: сървърът не прие заявката — кандидатът е само в този имейл.',
    stamp()
  ]);
}

async function apply(request, env, ctx) {
  const body = await request.text();
  if (body.length > 4000) return json(413, { error: 'Твърде дълго съобщение.' });
  let d = {};
  try { d = JSON.parse(body) || {}; } catch (e) {}
  const real = !d.website && d.name && d.phone;
  const api = (env && env.API_ORIGIN) || DEFAULT_API;
  try {
    const r = await fetch(api + '/api/public/apply', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'X-Forwarded-For': request.headers.get('CF-Connecting-IP') || '' },
      body
    });
    const text = await r.text();
    if (real && r.ok) ctx.waitUntil(applyMail(env, d, true));
    return new Response(text, { status: r.status, headers: { 'Content-Type': 'application/json; charset=utf-8', 'Cache-Control': 'no-store', ...SECURITY } });
  } catch (e) {
    if (real && await applyMail(env, d, false)) return json(200, { ok: true });
    return json(502, { error: 'В момента не можем да приемем заявката. Опитай пак след малко.' });
  }
}

// Contact form and the passenger "notify me" list: e-mail only.
async function contact(request, env) {
  const body = await request.text();
  if (body.length > 4000) return json(413, { error: 'Твърде дълго съобщение.' });
  let d = {};
  try { d = JSON.parse(body) || {}; } catch (e) { return json(400, { error: 'Невалидна заявка.' }); }
  if (d.website) return json(200, { ok: true });
  const name = clean(d.name, 60), phone = clean(d.phone, 30), email = clean(d.email, 80);
  if (phone.replace(/\D/g, '').length < 9 && !/@/.test(email)) return json(400, { error: 'Остави телефон или имейл.' });
  if (!d.consent) return json(400, { error: 'Отбележи съгласието.' });
  const waitlist = d.kind === 'waitlist';
  if (!waitlist && cleanText(d.message, 1500).length < 3) return json(400, { error: 'Напиши съобщение.' });
  const who = name || phone || email;
  const lines = waitlist
    ? ['Пътник иска да бъде уведомен, когато приложението тръгне', '', 'Име: ' + (name || '-'), 'Телефон: ' + (phone || '-'), 'Имейл: ' + (email || '-'), 'Телефонът му е: ' + (clean(d.platform, 20) || '-'), '', stamp()]
    : ['Ново съобщение от контактната форма на taxi2.bg', '', 'Име: ' + (name || '-'), 'Телефон: ' + (phone || '-'), 'Имейл: ' + (email || '-'), '', cleanText(d.message, 1500), '', stamp()];
  const ok = await sendMail(env, (waitlist ? 'Пътник за приложението: ' : 'Съобщение от сайта: ') + who, lines, email);
  if (!ok) return json(502, { error: 'В момента не можем да изпратим съобщението. Пиши ни на office@taxi2.bg.' });
  return json(200, { ok: true });
}

// Short entry points: taxi2.bg/admin, /app, /driver lead to the platform.
const PORTALS = {
  '/admin': 'https://admin.taxi2.bg/',
  '/app': 'https://app.taxi2.bg/',
  '/driver': 'https://driver.taxi2.bg/',
};

export default {
  async fetch(request, env, ctx) {
    const url = new URL(request.url);
    if (url.hostname === 'www.taxi2.bg') {
      url.hostname = 'taxi2.bg';
      return Response.redirect(url.toString(), 301);
    }
    const portal = PORTALS[url.pathname.replace(/\/+$/, '')];
    if (portal) return Response.redirect(portal, 302);
    if (url.pathname === '/api/apply' || url.pathname === '/api/contact') {
      if (request.method !== 'POST') return json(405, { error: 'Method Not Allowed' });
      return url.pathname === '/api/apply' ? apply(request, env, ctx) : contact(request, env);
    }
    if (request.method !== 'GET' && request.method !== 'HEAD') {
      return new Response('Method Not Allowed', { status: 405, headers: { Allow: 'GET, HEAD' } });
    }
    let path = url.pathname;
    if (path === '/index.html') path = '/';
    if (path.length > 1 && path.endsWith('/')) {
      return Response.redirect(url.origin + path.slice(0, -1) + url.search, 301);
    }
    const file = FILES[path];
    if (!file) {
      return new Response(null, { status: 302, headers: { Location: '/' } });
    }
    const headers = new Headers(SECURITY);
    headers.set('Content-Type', file.type);
    const isHtml = file.type.startsWith('text/html');
    headers.set('Cache-Control', isHtml ? 'public, max-age=300' : (url.searchParams.has('v') ? 'public, max-age=31536000, immutable' : 'public, max-age=86400'));
    const body = file.b64 ? decode(file.b64) : file.text;
    return new Response(request.method === 'HEAD' ? null : body, { headers });
  }
};
