# taxi2.bg — сайтът на Two Taxi

Целият сайт е един Cloudflare Worker (`taxi2-site`, акаунт Truegroupteam).

## Структура

- `public/pages/` — страниците (`index.html` → `/`, `kontakti.html` → `/kontakti` и т.н.).
- `public/` — стилове, скрипт, картинки, `robots.txt`, `sitemap.xml`.
- `src/worker.template.js` — логиката на Worker-а: формите (`/api/apply`, `/api/contact`),
  имейлите през Cloudflare Email, пренасочванията и заглавките за сигурност.
- `build.py` — сглобява всичко в един файл `dist/worker.js`.

## Промяна и качване

1. Промени файловете в `public/` (или `src/worker.template.js`).
2. `python3 build.py` → получава се `dist/worker.js`.
3. Cloudflare → Workers → `taxi2-site` → Edit code → замени съдържанието с `dist/worker.js` → Deploy.

Връзките към `site.css`, `site.js` и картинките с `?v=…` получават нов хеш автоматично при сглобяване.

## Настройки на Worker-а (в Cloudflare, не тук)

- `APPLY_MAIL` — връзка „Send email“ (Cloudflare Email Routing), през нея идват имейлите от формите.
- `APPLY_TO` — по желание, накъде да отиват имейлите.
- `API_ORIGIN` — по желание, адрес на сървъра за кандидатурите (по подразбиране сървърът на Two Taxi).

Кодът е изваден от работещия Worker на 25.10.2026 и сглобяването дава същия файл.

## server/

Скриптове за сървъра на платформата (`setup.sh`, `platform.sh`). Не са част от сайта;
`platform.sh` се тегли директно от `main`, затова не го местете.
