# taxi2.bg — two Taxi

One-page site for two Taxi (Plovdiv), served by a single Cloudflare Worker (`taxi2-site`, account Truegroupteam).

- `worker.js` — the whole site: HTML, logo, favicon, share image, robots.txt and sitemap are embedded.
- `www.taxi2.bg` redirects (301) to `taxi2.bg`.
- Deploy: `npx wrangler deploy`
