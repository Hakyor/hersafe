# HerSafe — Community Safety Platform

HerSafe is a privacy-first platform for anonymously reporting harassment,
viewing aggregated community safety data, and staying informed with safety
guidance. It is **not** a naming-and-shaming tool: the product is designed so
that no name, photo, or other identifying detail of any person — reporter or
subject — has a field to go into.

**Current service area: Egypt only.** Arabic is the default interface
language (English is available via the language toggle). The report form,
safety map, and Worker API all reject or flag locations outside Egypt's
borders (see `EGYPT_BOUNDS` in `js/report.js`, `js/map.js`, and
`worker/src/index.js` if you need to expand or adjust the coverage area).

## Features

- Anonymous incident reporting (no account required)
- Optional GPS or map-based location picker (Leaflet + OpenStreetMap)
- Optional Google Drive evidence links (links only — files are never hosted)
- Community safety map with green/amber/red aggregated markers
- **Safe Places** — admin-curated police stations, hospitals, pharmacies,
  and other trusted points, shown on the map with category icons
- **Street Rating System** — anyone can rate a street on lighting, crowd
  level, security presence, camera coverage, transit access, and general
  feeling of safety; ratings roll up into a 0–100 Safety Score
- **Safer Route planner** — choose shortest vs. safer routing, re-ranked
  using street ratings and recent report density (via OSRM)
- **Community Alerts** — anonymous, area-level warnings when multiple
  reports land in the same place in a short window; never exposes report
  content or identities
- **"What to do after harassment"** support page — calm, practical
  guidance, FAQs, evidence tips, and privacy advice
- Aggregated statistics (by area, by month, by incident type)
- Bilingual: Arabic (RTL, default) and English (LTR), switchable,
  JSON-driven — no hardcoded UI strings
- Light and dark themes
- Native-app-style mobile navigation: bottom tab bar with a center
  "New Report" FAB and a slide-out drawer for secondary pages
- Password-protected admin panel: reports, Safe Places CRUD, street
  rating moderation, community alerts, and dashboard statistics
- Mobile-first, responsive, accessible (keyboard nav, ARIA labels, focus
  states, skeleton loading states, `prefers-reduced-motion` support)
- Scoped to Egypt only (adjustable via `EGYPT_BOUNDS` in the frontend and Worker)

## Tech stack

| Layer     | Technology                              |
|-----------|------------------------------------------|
| Frontend  | HTML5, CSS3, vanilla JavaScript (ES6)    |
| Backend   | Cloudflare Workers                       |
| Database  | Cloudflare D1 (SQLite)                   |
| Hosting   | GitHub Pages                             |
| Maps      | Leaflet + OpenStreetMap tiles            |

No frameworks, no paid services, no Firebase/Supabase/Vercel/Netlify.

## Project structure

```
hersafe/
├── index.html, report.html, map.html, statistics.html,
│   guide.html, about.html, privacy.html, terms.html,
│   admin-login.html, admin.html
├── css/
│   ├── themes.css       # design tokens, light/dark variables
│   └── styles.css       # mobile-first layout & components
├── js/
│   ├── i18n.js           # loads translations/*.json, sets dir/lang
│   ├── theme.js           # light/dark toggle
│   ├── api.js              # fetch wrapper around the Worker API
│   ├── main.js              # nav, toasts, home page dynamic sections
│   ├── report.js             # report form, GPS, map picker, evidence links
│   ├── map.js                  # safety map rendering + filters
│   ├── statistics.js            # dependency-free canvas charts
│   └── admin.js                   # admin login + dashboard
├── translations/
│   ├── en.json
│   └── ar.json
├── assets/icons/          # favicon.svg + PWA icons (add icon-192.png,
│                            icon-512.png, og-cover.png)
├── worker/
│   ├── src/index.js        # Cloudflare Worker API
│   └── wrangler.toml
├── sql/
│   ├── schema.sql            # D1 schema
│   └── seed.sql                # incident types + default settings
├── manifest.json
├── robots.txt
└── sitemap.xml
```

## Cloudflare D1 setup

1. Install Wrangler and log in:
   ```bash
   npm install -g wrangler
   wrangler login
   ```
2. Create the database:
   ```bash
   wrangler d1 create hersafe-db
   ```
   Copy the returned `database_id` into `worker/wrangler.toml`.
3. Apply the schema and seed data:
   ```bash
   wrangler d1 execute hersafe-db --file=./sql/schema.sql
   wrangler d1 execute hersafe-db --file=./sql/seed.sql
   ```
4. Create your first admin account. Passwords are stored as
   `SHA-256(salt || password)`, never in plain text. Generate the insert
   statement in a Node/browser console:
   ```js
   const salt = crypto.randomUUID();
   const hash = [...new Uint8Array(
     await crypto.subtle.digest("SHA-256", new TextEncoder().encode(salt + "your-password"))
   )].map(b => b.toString(16).padStart(2, "0")).join("");
   console.log(`INSERT INTO admin_users (username, password_hash, password_salt) VALUES ('admin', '${hash}', '${salt}');`);
   ```
   Then run:
   ```bash
   wrangler d1 execute hersafe-db --command="<paste the generated INSERT>"
   ```

## Cloudflare Worker setup

1. From `worker/`, set the signing secret used for admin session tokens:
   ```bash
   wrangler secret put TOKEN_SECRET
   ```
2. Update `ALLOWED_ORIGIN` in `worker/wrangler.toml` to your GitHub Pages URL.
3. Deploy:
   ```bash
   cd worker
   wrangler deploy
   ```
4. Note the deployed Worker URL (e.g. `https://hersafe-api.yourname.workers.dev`).

## Frontend configuration

Set the Worker URL the frontend should call. Add this **before** `js/api.js`
loads on every page (simplest: create `js/config.js` and include it first):

```html
<script>window.HERSAFE_API_BASE = "https://hersafe-api.yourname.workers.dev";</script>
<script src="js/api.js"></script>
```

## GitHub Pages deployment

1. Push this repository to GitHub.
2. In **Settings → Pages**, set the source to the `main` branch, root folder.
3. Your site will be live at `https://yourusername.github.io/hersafe/`.
4. Update `robots.txt`, `sitemap.xml`, and Open Graph URLs to match your
   actual GitHub Pages URL.

## Database migrations

Schema changes go in new files under `sql/`, e.g. `sql/0002_add_column.sql`,
and are applied with:
```bash
wrangler d1 execute hersafe-db --file=./sql/0002_add_column.sql
```

This project already includes `sql/0002_features.sql`, which adds the
`safe_places`, `street_ratings`, `community_alerts`, and `safe_routes_cache`
tables for the features below. Apply it the same way:
```bash
wrangler d1 execute hersafe-db --remote --file=./sql/0002_features.sql --config=worker/wrangler.toml
```

## Configuration reference

| Setting                     | Where                         | Purpose                          |
|------------------------------|--------------------------------|-----------------------------------|
| `ALLOWED_ORIGIN`              | `worker/wrangler.toml`          | CORS allow-list                    |
| `TOKEN_SECRET`                  | Wrangler secret                  | Signs admin session tokens          |
| `rate_limit_per_hour`             | `settings` table (D1)             | Reports allowed per IP per hour      |
| `window.HERSAFE_API_BASE`           | frontend config                     | Worker base URL the frontend calls    |

## Security notes

- All report inputs are validated and HTML-escaped server-side.
- Evidence links are restricted to `https://drive.google.com/` and
  `https://docs.google.com/` URLs; nothing else is accepted.
- Basic anti-abuse rate limiting is enforced per hashed IP, per hour.
- Admin routes require a signed, short-lived bearer token; the token is
  re-verified on every admin request.
- No table in the schema is designed to hold a name, photo, or other
  identifying detail of any individual.

## Future roadmap

The schema and API are structured so the following can be added without
breaking the current database:

- **React** frontend (the JSON translation files and REST API are already
  framework-agnostic)
- **Cloudflare R2** for optional direct evidence uploads (would add a
  `storage_key` column to `evidence_links` rather than replacing it)
- **Push notifications** for new reports in a followed area
- **PWA** installability (manifest.json is already in place; add a service
  worker for offline support)
- **Real authentication** for reporters who want to track their own
  submissions (the `users` table is reserved for this)
- **Native mobile app** consuming the same Worker API

## Going live: what's left to do

This repository is a complete, working implementation, but three things
require *your* credentials and can't be done on your behalf:

1. **Create the D1 database and deploy the Worker** (`wrangler login` uses
   your own Cloudflare account — see "Cloudflare D1 setup" and "Cloudflare
   Worker setup" above).
2. **Point the frontend at your deployed Worker URL** by editing
   `js/config.js`.
3. **Add real icon files** to `assets/icons/`: `icon-192.png`, `icon-512.png`,
   and `og-cover.png` (only an SVG favicon is included).

Once those three steps are done and the site is pushed to GitHub Pages, all
flows — anonymous reporting, the safety map, statistics, and the admin panel
— are fully wired end to end.

## License

MIT — see LICENSE (add your preferred license file).
