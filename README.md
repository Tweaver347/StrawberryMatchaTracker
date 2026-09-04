# Strawberry Matcha Tracker

A mobile-first digital scrapbook for remembering every strawberry matcha, the place it came from, and whether that cafe deserves another visit.

The product is a **personal tracker first**. Community information adds context, but the user's own photos, history, place guidance, map, and memories remain the main experience.

## Product north star

> The app should feel like opening a handmade strawberry-matcha scrapbook that invites the user to log today's drink while reminding them where they have been, what they loved, and which places are worth revisiting.

The complete product and UX decisions are documented in [`docs/DESIGN-SPEC.md`](docs/DESIGN-SPEC.md).

## Core experience

A finished matcha requires only:

1. A photo
2. A place
3. A 1–5 strawberry rating

Everything else is optional and can be added later.

The camera-first flow is:

```text
Log a Matcha
→ take or choose a photo
→ retake or keep it
→ confirm the most likely place
→ rate with 1–5 strawberries
→ Log Matcha
```

After saving, the app offers **View Matcha**, **Add More Details**, and **Done**. New entries are private by default.

## Current features

### Personal scrapbook

- Large horizontal swipe cards for recent matchas
- Handmade paper, tape, sticker, and handwritten-note details
- Expand-in-place entry details
- Optional sections for **Drink**, **Visit**, and **Thoughts**
- In-place editing rather than a separate edit screen
- Individual entry favorites
- Private-by-default entries

### Fast mobile logging

- Opens the rear camera directly from the main action when the browser supports it
- Separate camera-roll picker
- Photo retakes and replacements
- EXIF GPS detection from photos
- Current phone location
- One likely place suggestion with a manual search/pin fallback
- 1–5 strawberry rating interaction
- Silent matcha defaults for milk, sweetness, size, and common add-ons

### Drafts

- Drafts auto-save after meaningful progress begins
- Drafts stay out of the finished scrapbook until photo, place, and rating are present
- Drafts appear only under Profile
- Draft list shows what is missing, last edit time, Continue, and Delete
- No reminder notifications

### Places

- Personal Favorite Place suggestions
- Personal Do Not Visit suggestions
- Suggestions use rating, repeat visits, and would-order-again history
- Separate community pulse so public sentiment never replaces the user's own history
- Full visited-place list and place history

### Map

- Personal visited-place map by default
- Visit count controls marker prominence
- Optional community layer, off by default
- Custom strawberry and matcha markers

### Profile

- Personal scrapbook cover
- Favorite Place feature with every logged matcha from that cafe
- Total matchas, places visited, and average rating
- 25-achievement scrapbook sticker board with visible progress
- Drafts
- Clean square grid of published matcha photos

### Settings and accessibility

- Light mode by default
- Nighttime berry/plum scrapbook dark mode
- Standard, large, and extra-large text
- High contrast
- Reduced motion
- Readable font
- Larger touch targets
- Reduced visual clutter
- Synced matcha defaults
- Restartable first-launch tour

### Community privacy

When a user chooses to publish an entry, the public response contains only:

- Photo
- Place
- Strawberry rating

Optional drink details, visit details, notes, vibe, repeat-order decision, account identity, and other personal fields remain out of the community payload.

## Architecture

```text
Mobile or desktop browser
        ↓
Cloudflare Worker
  ├─ Google OAuth and signed session cookie
  ├─ ownership and privacy checks
  ├─ matcha/draft/settings APIs
  ├─ private photo proxy
  └─ static application assets
        ↓
Supabase
  ├─ PostgreSQL
  └─ private Storage bucket
```

### Frontend

Static HTML, CSS, and classic JavaScript modules served as Cloudflare Worker assets.

The browser communicates with same-origin Worker endpoints. Supabase credentials are never shipped to the browser.

### Backend

A Cloudflare Worker in `src/index.js` handles:

- Google OAuth 2.0 / OpenID Connect
- HTTP-only signed sessions
- user ownership checks
- private and community entry queries
- draft lifecycle
- settings synchronization
- private Supabase Storage access

### Supabase

The connected Supabase project uses:

- `app_users` — Google identity plus synced settings/defaults/achievement dates
- `matcha_entries` — complete memories and drafts
- `matcha_favorites` — per-user favorites
- private `matcha-photos` bucket

RLS is enabled on the application tables, direct `anon` and `authenticated` table privileges are revoked, and the Worker is the trusted server boundary.

## API

```text
GET    /api/me
GET    /api/status
GET    /api/settings
PUT    /api/settings
GET    /api/entries?scope=mine
GET    /api/entries?scope=drafts
GET    /api/entries?scope=community
POST   /api/entries
DELETE /api/entries/:id
POST   /api/entries/:id/favorite
GET    /api/photos/:id
HEAD   /api/photos/:id
```

`POST /api/entries` accepts either:

```json
{ "status": "draft" }
```

or:

```json
{ "status": "complete" }
```

A complete entry requires a stored photo, place name, and rating. A draft may be partial and is always forced private.

## Repository structure

```text
.
├── docs/
│   └── DESIGN-SPEC.md
├── public/
│   ├── app.js
│   ├── app-events.js
│   ├── app-data.js
│   ├── app-memories.js
│   ├── app-places.js
│   ├── app-profile.js
│   ├── app-drafts.js
│   ├── app-capture.js
│   ├── app-log-save.js
│   ├── app-settings.js
│   ├── app-utils.js
│   ├── icon.svg
│   ├── index.html
│   ├── manifest.webmanifest
│   └── styles.css
├── src/
│   └── index.js
├── supabase/
│   └── migrations/
│       ├── 20260904183341_create_cloud_matcha_backend.sql
│       ├── 20260904183645_secure_and_index_cloud_matcha_backend.sql
│       └── 20260904190000_add_draft_lifecycle.sql
├── package.json
└── wrangler.jsonc
```

## Runtime configuration

Cloudflare provides:

- `GOOGLE_CLIENT_ID`
- `GOOGLE_CLIENT_SECRET` — Cloudflare Secret
- `GOOGLE_REDIRECT_URI`
- `SUPABASE_URL`
- `SUPABASE_SECRET_KEY` — Cloudflare Secret using a current server-side Supabase secret key

The public Google client ID, redirect URI, and Supabase URL are defined in `wrangler.jsonc`. Secret values must remain in Cloudflare and must never be committed.

Current Google callback:

```text
https://strawberrymatchatracker.thomaswe.workers.dev/auth/callback
```

Current Supabase project URL:

```text
https://gpfzqayrzomisolaojku.supabase.co
```

`keep_vars` is enabled, so GitHub-triggered Wrangler deployments preserve Dashboard secrets.

## Local development

Install dependencies:

```bash
npm install
```

Run locally:

```bash
npm run dev
```

Deploy:

```bash
npm run deploy
```

For local authenticated cloud testing, use a `.dev.vars` file. It is ignored by Git and must never be committed.

## Verification checklist

After a deployment:

1. Open `/api/status` and confirm database, storage, provider, and drafts are enabled.
2. Sign in with Google.
3. Tap **Log a Matcha** on a phone and confirm the camera opens.
4. Retake or keep the photo.
5. Confirm or correct the suggested place.
6. Select a strawberry rating and log the matcha.
7. Refresh and confirm the memory and photo remain.
8. Start another log, close it early, and confirm it appears under Profile → Drafts rather than Home.
9. Edit a finished card in place.
10. Publish one entry and confirm the community response exposes only photo, place, and rating.
11. Test light/dark mode and accessibility controls.
12. Open the same account on another device and confirm entries, drafts, settings, defaults, favorites, and achievements sync.

## Next product work

- Validate place suggestion quality on real mobile visits
- Add stronger place identity normalization so variations of the same cafe merge reliably
- Add offline upload retry for poor cafe Wi-Fi
- Add entry/photo deletion for finished memories
- Test achievement thresholds with real usage
- Add automated API and browser tests
