# Strawberry Matcha Tracker

A strawberry-matcha themed web app for remembering, rating, mapping, and favoriting strawberry matcha drinks.

## Product concept

Each entry captures both the drink and the experience around it. Entries are private by default, with an optional community-share toggle that places the drink on the public community feed/map.

The MVP supports:

- Google sign-in plus guest browsing
- Photo upload with EXIF GPS detection when location data is present
- Current-device location
- Place search and map pin placement
- 1–5 matcha rating with interactive rounded stars
- 1–5 vibe check with a separate icon-based rating
- Price and drink size
- Milk type and sweetness level
- Visit date and notes
- Wait time and would-order-again
- Special add-ons
- Individual entry favorites
- Private-by-default entries with optional community sharing
- Community map powered by Leaflet and OpenStreetMap
- Guided product tour

## Current architecture

- **Frontend:** static HTML/CSS/JavaScript served as Cloudflare Worker assets
- **Backend:** Cloudflare Worker in `src/index.js`
- **Authentication:** Google OAuth 2.0 / OpenID Connect
- **Database:** Cloudflare D1 schema prepared in `migrations/0001_initial.sql`
- **Maps:** Leaflet + OpenStreetMap tiles
- **Location search:** OpenStreetMap Nominatim
- **Photo metadata:** exifr for EXIF/GPS parsing

The app currently falls back to browser local storage if the D1 binding has not been configured yet. This makes the full interface testable while the production database is being connected.

## Repository structure

```text
.
├── migrations/
│   └── 0001_initial.sql
├── public/
│   ├── app.js
│   ├── index.html
│   └── styles.css
├── src/
│   └── index.js
├── package.json
└── wrangler.jsonc
```

## Runtime configuration

Cloudflare must provide these values to the Worker:

- `GOOGLE_CLIENT_ID`
- `GOOGLE_CLIENT_SECRET` — store this as a Cloudflare Secret, never commit it
- `GOOGLE_REDIRECT_URI`

Current callback URL:

```text
https://strawberrymatchatracker.thomaswe.workers.dev/auth/callback
```

## D1 database setup

The API is already written to use a D1 binding named `DB`. To finish cloud persistence:

1. Create a D1 database in Cloudflare named something like `strawberry-matcha-tracker-db`.
2. Copy its database ID.
3. Add a D1 binding named `DB` to `wrangler.jsonc`.
4. Apply `migrations/0001_initial.sql` to the database.
5. Redeploy the Worker.

Once `env.DB` exists, signed-in users will store entries and favorites in D1 instead of browser local storage.

## Local development

Install dependencies:

```bash
npm install
```

Run the Worker locally:

```bash
npm run dev
```

Deploy:

```bash
npm run deploy
```

## Privacy behavior

- New entries are private by default.
- A user must explicitly enable **Share with the community** for an entry to appear on the community map.
- Guest mode can browse and test the experience locally.
- Google credentials and secrets are never stored in the frontend.

## Next development steps

1. Connect the production D1 database.
2. Add durable image storage with Cloudflare R2 so uploaded photos sync across devices.
3. Add entry editing/deletion.
4. Add community feed cards in addition to the map.
5. Improve place lookup and location normalization.
6. Add onboarding/tour persistence so the tour only auto-prompts when appropriate.
