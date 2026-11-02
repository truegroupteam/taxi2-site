import { EmailMessage } from 'cloudflare:email';
// Two Taxi — taxi2.bg. Single-file Worker: the whole site is inside this file.
// Built by build.py on {{DATE}}. Edit public/ and rebuild.
const FILES = {
{{FILES}}
};

// Where driver applications are sent (the Two Taxi server). Override with the API_ORIGIN variable.
const DEFAULT_API = 'https://116-203-244-23.sslip.io';
// The demo for other taxi companies (its own server and database on the same machine). Override with DEMO_ORIGIN.
// demo.taxi2.bg is served through this Worker (wrangler.jsonc routes), so it needs no DNS record of its own.
const DEFAULT_DEMO = 'https://demo.116-203-244-23.sslip.io';

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
async function sendMail(env, subject, lines, replyTo, toAddr) {
  if (!env || !env.APPLY_MAIL) return false;
  const from = 'noreply@taxi2.bg';
  const to = toAddr || env.APPLY_TO || 'damyanov.true@gmail.com';
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
  if (d.kind === 'developer') return developer(env, name, email, cleanText(d.message, 1500));
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

// „За разработчика“ (taxi2.bg/razrabotchik): only by e-mail, straight to the developer (DEV_TO overrides).
async function developer(env, name, email, message) {
  if (!/^[^\s@<>",;]+@[^\s@<>",;]+\.[a-z]{2,}$/i.test(email)) return json(400, { error: 'Въведи имейл, на който да ти отговорим.' });
  if (message.length < 3) return json(400, { error: 'Напиши съобщение.' });
  const ok = await sendMail(env, 'Taxi Labs — съобщение от taxi2.bg: ' + (name || email), [
    'Съобщение до разработчика (Taxi Labs) от taxi2.bg/razrabotchik', '', 'Име: ' + (name || '-'), 'Имейл: ' + email, '', message, '', stamp()
  ], email, env.DEV_TO || 'damyanov.true@gmail.com');
  if (!ok) return json(502, { error: 'В момента не можем да изпратим съобщението. Опитай пак след малко.' });
  return json(200, { ok: true });
}

// „Софтуер“ (taxi2.bg/softuer, /software): a company asks for the demo. The request goes by e-mail to the developer
// (DEV_TO), then the demo server makes a personal sign-in (7 days) that the page shows at once. Only made-up data
// is in the demo; the company's contact details stay in the e-mail.
async function demo(request, env, ctx) {
  const body = await request.text();
  if (body.length > 4000) return json(413, { error: 'Твърде дълго съобщение.' });
  let d = {};
  try { d = JSON.parse(body) || {}; } catch (e) { return json(400, { error: 'Невалидна заявка.' }); }
  const en = d.lang === 'en';
  const t = (bg, e) => (en ? e : bg);
  if (d.website) return json(200, { ok: true, demo: null });
  const name = clean(d.name, 60), company = clean(d.company, 80), city = clean(d.city, 60), phone = clean(d.phone, 30), email = clean(d.email, 80), cars = clean(d.cars, 20);
  if (name.length < 2) return json(400, { error: t('Въведете име.', 'Enter your name.') });
  if (company.length < 2) return json(400, { error: t('Въведете фирмата.', 'Enter your company.') });
  if (phone.replace(/\D/g, '').length < 9 && !/^[^\s@<>",;]+@[^\s@<>",;]+\.[a-z]{2,}$/i.test(email)) return json(400, { error: t('Оставете телефон или имейл.', 'Leave a phone number or an e-mail.') });
  if (!d.consent) return json(400, { error: t('Отбележете съгласието.', 'Tick the consent.') });
  let acc = null;
  try {
    const r = await fetch(((env && env.DEMO_ORIGIN) || DEFAULT_DEMO) + '/api/public/demo/account', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'X-Demo-Client': request.headers.get('CF-Connecting-IP') || '' },
      body: '{}'
    });
    if (r.ok) acc = await r.json();
  } catch (e) {}
  const sent = await sendMail(env, 'Taxi Labs — заявка за демо: ' + company + (city ? ', ' + city : ''), [
    'Заявка за демо достъп от taxi2.bg' + (en ? '/software (EN)' : '/softuer'), '',
    'Име: ' + name, 'Фирма: ' + company, 'Град: ' + (city || '-'), 'Коли: ' + (cars || '-'), 'Телефон: ' + (phone || '-'), 'Имейл: ' + (email || '-'), '',
    acc ? 'Получи демо вход веднага: ' + acc.admin.login + ' (админ), шофьор ' + acc.driver.phone + '. Важи до ' + new Date(acc.until).toLocaleDateString('bg-BG', { timeZone: 'Europe/Sofia' }) + '.'
        : 'ВНИМАНИЕ: демо сървърът не отговори — изпратете му данни за вход ръчно.',
    stamp()
  ], email, env.DEV_TO || 'damyanov.true@gmail.com');
  if (!acc && !sent) return json(502, { error: t('В момента не можем да приемем заявката. Опитайте пак след малко.', 'We cannot take the request right now. Please try again shortly.') });
  return json(200, { ok: true, demo: acc });
}

// demo.taxi2.bg: everything (pages, API, live connection, map tiles) goes to the demo server as it is.
function demoProxy(request, env) {
  const url = new URL(request.url);
  const target = ((env && env.DEMO_ORIGIN) || DEFAULT_DEMO) + url.pathname + url.search;
  const headers = new Headers(request.headers);
  headers.set('X-Forwarded-For', request.headers.get('CF-Connecting-IP') || '');
  const hasBody = request.method !== 'GET' && request.method !== 'HEAD';
  return fetch(target, { method: request.method, headers, body: hasBody ? request.body : undefined, redirect: 'manual' });
}

// The terms and privacy texts come from the platform (the same texts the apps show), cached for 10 minutes.
async function legal(url, env, ctx) {
  const api = (env && env.API_ORIGIN) || DEFAULT_API;
  const q = url.searchParams.get('for') === 'driver' ? '?for=driver' : '';
  const cache = caches.default;
  const key = new Request('https://taxi2.bg/api/legal' + q);
  const hit = await cache.match(key);
  if (hit) return hit;
  try {
    const r = await fetch(api + '/api/legal' + q);
    if (!r.ok) throw new Error(String(r.status));
    const res = new Response(await r.text(), { headers: { 'Content-Type': 'application/json; charset=utf-8', 'Cache-Control': 'public, max-age=600', ...SECURITY } });
    ctx.waitUntil(cache.put(key, res.clone()));
    return res;
  } catch (e) {
    return json(502, { error: 'Текстът не може да се зареди в момента. Опитай пак след малко или пиши на office@taxi2.bg.' });
  }
}

// Short entry points: taxi2.bg/admin, /app, /driver lead to the platform.
const PORTALS = {
  '/admin': 'https://admin.taxi2.bg/',
  '/app': 'https://app.taxi2.bg/',
  '/driver': 'https://app.taxi2.bg/driver',
};

export default {
  async fetch(request, env, ctx) {
    const url = new URL(request.url);
    if (url.hostname === 'demo.taxi2.bg') return demoProxy(request, env);
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
    if (url.pathname === '/api/demo') {
      if (request.method !== 'POST') return json(405, { error: 'Method Not Allowed' });
      return demo(request, env, ctx);
    }
    if (url.pathname === '/api/legal' && request.method === 'GET') return legal(url, env, ctx);
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
