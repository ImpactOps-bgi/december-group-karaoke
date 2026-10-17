# Battle of the Birth Months

The December Group's gospel karaoke fundraiser — a birth-month showdown with solo and group acts, three rounds, and dollar-vote audience judging.

**Live site (Netlify):** https://december-group-karaoke.netlify.app
**Admin mode:** https://december-group-karaoke.netlify.app/?admin (passcode required — stored as the `ADMIN_KEY` env var on Netlify)
**Backup mirror (GitHub Pages):** https://impactops-bgi.github.io/december-group-karaoke/ — offline-capable, saves in the local browser only

The site includes event details, entry fees, voting rules, the official 50-song playlist, a live tally board for show night, food coordination, and printable registration sheets.

## Architecture

- `docs/index.html` — single-file frontend. On Netlify it reads/writes the shared API; anywhere else it falls back to localStorage with full editing enabled.
- `netlify/functions/` — serverless API (`state`, `claim`, `performance`, `settings`, `food`, `init`, `ping`) under `/api/*` (see `netlify.toml` redirects).
- `netlify/functions/lib/store.js` — data layer: Neon Postgres (production, via `NETLIFY_DB_URL`) or in-memory (tests/dev).
- Admin mutations require the `x-admin-key` header matching the `ADMIN_KEY` env var.
- `tests/api.test.js` — run `npm test` (Node built-in test runner, no deps needed).
- Deploy: `netlify deploy --prod` from the repo root (site is linked via `.netlify/`).
