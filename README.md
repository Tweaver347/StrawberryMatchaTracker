# Strawberry Matcha Tracker

A mobile-first strawberry matcha diary for photographing, rating, mapping, and remembering drinks worth ordering again.

## Product concept

Each entry captures both the drink and the experience around it. Entries are private by default. A user can explicitly publish an entry to the community feed and map.

The current MVP includes:

- Google sign-in and guest browsing
- A responsive mobile layout with bottom navigation
- Direct phone-camera capture and camera-roll selection
- Photo preview, compression, and EXIF GPS detection
- Current-device location, place search, and map pin placement
- Interactive 1–5 matcha stars and a separate 1–5 vibe check
- Quick logging after the required photo/place and rating steps
- Optional price, size, milk, sweetness, date, wait time, add-ons, and notes
- Would-order-again tracking
- Individual entry favorites
- Private-by-default entries with optional community publishing
- A community map powered by Leaflet and OpenStreetMap
- A profile page with personal stats and published entries
- Dark mode, text sizing, high contrast, reduced motion, readable type, larger touch targets, and reduced visual clutter
- A first-launch guided tour that can be restarted from Settings
- Installable web-app metadata for phone home screens

## Production architecture

- **Frontend:** static HTML, CSS, and JavaScript served through Cloudflare Worker assets
- **Backend:** Cloudflare Worker in `src/index.js`
- **Authentication:** Google OAuth 2.0 / OpenID Connect with a secure, HTTP-only app session cookie
- **Database:** Supabase PostgreSQL
- **Photo storage:** private Supabase Storage bucket named `matcha-photos`
- **Maps:** Leaflet with OpenStreetMap tiles
- **Location search:** OpenStreetMap Nominatim
- **Photo metadata:** exifr for EXIF/GPS parsing

The browser talks only to same-origin Worker routes. The Worker validates the signed-in session, enforces ownership and publishing rules, then calls Supabase with a server-only secret key. Supabase credentials are never shipped to browser JavaScript.

## Supabase data model

The app uses three server-managed tables:

- `app_users` — Google account identity and synced display/accessibility settings
- `matcha_entries` — drink details, ratings, coordinates, publication state, and private photo references
- `matcha_favorites` — per-user favorites

The `matcha-photos` bucket is private. Photos are returned through `/api/photos/:entryId` only after the Worker verifies that the requester owns the entry or the entry was published.

The production migrations are version-controlled under `supabase/migrations/` and have already been applied to the connected Supabase project.

## Repository structure

```text
.
├── public/
│   ├── app.js
│   ├── cloud-sync.js
│   ├── icon.svg
│   ├── index.html
│   ├── manifest.webmanifest
│   └── styles.css
├── src/
│   └── index.js
├── supabase/
│   └── migrations/
│       ├── 20260904183341_create_cloud_matcha_backend.sql
│       └── 20260904183645_secure_and_index_cloud_matcha_backend.sql
├── package.json
└── wrangler.jsonc
```

## Worker API

```text
GET  /api/me
GET  /api/status
GET  /api/settings
PUT  /api/settings
GET  /api/entries?scope=mine
GET  /api/entries?scope=community
POST /api/entries
POST /api/entries/:id/favorite
GET  /api/photos/:id
```

## Runtime configuration

Cloudflare must provide these values:

- `GOOGLE_CLIENT_ID`
- `GOOGLE_CLIENT_SECRET` — Cloudflare Secret
- `GOOGLE_REDIRECT_URI`
- `SUPABASE_URL`
- `SUPABASE_SECRET_KEY` — Cloudflare Secret; use a current `sb_secret_...` server key

`GOOGLE_CLIENT_ID`, `GOOGLE_REDIRECT_URI`, and `SUPABASE_URL` are defined in `wrangler.jsonc`. Both secret values must remain in Cloudflare and must never be committed.

Current Google callback:

```text
https://strawberrymatchatracker.thomaswe.workers.dev/auth/callback
```

Current Supabase project URL:

```text
https://gpfzqayrzomisolaojku.supabase.co
```

Because `keep_vars` is enabled in `wrangler.jsonc`, normal GitHub deployments preserve secrets already stored in the Cloudflare dashboard.

## Cloud sync behavior

Signed-in users receive durable, cross-device storage for:

- Matcha entries
- Favorites
- Published/community entries
- Photos
- Display and accessibility preferences

Guest entries and guest preferences stay in the current browser. The app can still be explored without signing in.

`public/cloud-sync.js` bridges the existing frontend flow to the Worker by including compressed photo data during entry creation, resolving private cloud photo routes when entries load, and syncing account settings.

## Local development

Install dependencies:

```bash
npm install
```

Create a local `.dev.vars` file with the required secrets. Do not commit that file.

Run the Worker locally:

```bash
npm run dev
```

Deploy:

```bash
npm run deploy
```

## Privacy and security behavior

- New entries are private by default.
- Community publication requires an explicit user toggle.
- Private photos are never given a permanent public URL.
- Database tables have Row Level Security enabled and deny browser roles direct access.
- The Cloudflare Worker performs authorization before using its server-only Supabase key.
- Google and Supabase secret keys never appear in frontend code or Git history.
- Uploaded images are limited by type and size before storage.

## Current testing checklist

1. Sign in with a Google test account.
2. Log one private matcha without a photo.
3. Reload on another device and confirm it appears.
4. Log another matcha using the phone camera.
5. Confirm its photo displays after a full reload.
6. Favorite and unfavorite an entry.
7. Publish an entry with coordinates and confirm it appears on the community map.
8. Change dark mode or text size, then confirm the preference follows the signed-in account to another device.

## Next development steps

1. Add entry editing and deletion, including photo cleanup.
2. Add a card-based community feed alongside the map.
3. Improve cafe search and normalize repeated place records.
4. Add image-loading placeholders and upload progress.
5. Add automated Worker API tests and deployment checks.
