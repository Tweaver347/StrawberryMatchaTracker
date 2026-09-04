# Strawberry Matcha Tracker — Product & Experience Design Specification

## North star

The app should feel like opening a handmade strawberry-matcha scrapbook that invites the user to log today's drink while reminding them where they have been, what they loved, and which places are worth revisiting.

The product is a personal tracker first. Community information adds context but never competes with the user's own memories.

## User and context

The primary user is on a phone during a real cafe visit and may only have a few seconds of attention at a time. They may interact while waiting in line, after ordering, when the drink arrives, after the first taste, or after finishing it.

The app must capture first and allow depth later. It should never require a detailed review just to preserve a matcha memory.

## Minimum complete matcha

A finished matcha log requires only:

1. A photo
2. A place
3. A 1–5 strawberry rating

Everything else is optional and can be added later.

## Logging flow

1. Tapping **Log a Matcha** opens the camera immediately.
2. The user can retake the photo or keep it.
3. The app detects a likely place from photo GPS or current phone location.
4. It shows one strong place suggestion with **Use this place** and **Choose another**.
5. The user rates the drink with 1–5 strawberries.
6. The final action is **Log Matcha**.
7. A short success moment offers **View Matcha**, **Add More Details**, and **Done**.

Entries are private by default. Community sharing is an optional action after the personal memory is saved.

## Draft behavior

Drafts auto-save after a photo or other progress exists. They do not appear in the finished scrapbook until photo, place, and rating are complete.

Drafts live under **Profile → Drafts** as a simple task list showing the thumbnail, known place, missing information, last edit time, Continue, and Delete.

The app sends no reminders or notifications about drafts.

## Home

Home has only two priorities:

1. A large, unmistakable **Log a Matcha** action
2. **Recent Matchas**

Recent matchas appear as large horizontal swipe cards. Each card feels like a scrapbook memory with a large photo, place, strawberry rating, date, and a small amount of supporting context.

Tapping a card expands it in place. Expanded sections are:

- **Drink** — size, milk, sweetness, add-ons, price
- **Visit** — date, wait time, location
- **Thoughts** — notes, would-order-again, sharing

Editing happens inside the expanded scrapbook card instead of on a separate screen.

## Places

The Places screen answers: **Where should I go back, and where should I avoid?**

It prioritizes:

1. Suggested Favorite Places
2. Suggested Do Not Visit places
3. All visited places

Place guidance is automatically inferred from rating, repeat visits, and would-order-again history. The app explains its reasoning with visit count, average rating, and repeat-order responses.

The visual layout is a scrapbook pinboard. Personal guidance stays separate from a smaller community pulse.

## Map

The map is personal first. It opens showing places the user has visited. Community places are an optional layer that is off by default.

Pins are custom strawberry/matcha scrapbook pins. Pin prominence communicates visit count: frequently visited places are larger and show a count.

The map should answer **Where have I been, and what did I think?** before it answers **Where could I go next?**

## Profile

Profile tells the story of the user's matcha journey first and quantifies it second.

Order:

1. Personal scrapbook cover/header
2. Favorite Place feature with all logged matchas from that place
3. Total matchas, places visited, and average rating
4. Achievement sticker board
5. Drafts
6. Published matcha photo grid

Published matchas use a clean square photo grid. Tapping a photo opens the same full scrapbook memory used elsewhere.

## Achievements

Achievements appear as a scrapbook sticker board. Earned badges are colorful stickers; locked badges are faded. Every locked badge shows progress.

The 25 achievements are:

1. First Sip — log 1 matcha
2. Getting Started — log 5 matchas
3. Matcha Regular — log 10 matchas
4. Strawberry Scholar — log 25 matchas
5. Matcha Historian — log 50 matchas
6. The Archive — log 100 matchas
7. First Stop — visit 1 place
8. Neighborhood Explorer — visit 5 places
9. Cafe Hopper — visit 10 places
10. Matcha Cartographer — visit 25 places
11. Frequent Flyer — visit one place 5 times
12. House Regular — visit one place 10 times
13. Found a Keeper — earn a Favorite Place suggestion
14. Not Going Back — earn a Do Not Visit suggestion
15. Five-Strawberry Find — give a 5-strawberry rating
16. Three in a Row — rate 3 consecutive matchas 4+ strawberries
17. Golden Streak — rate 5 consecutive matchas 4+ strawberries
18. Worth Another Sip — mark would-order-again on 10 matchas
19. Reliable Taste — maintain a 4.0+ average across at least 20 matchas
20. Memory Keeper — enrich 10 entries with optional details
21. Full Scrapbook Page — fully complete the optional details on one entry
22. Documentarian — log 25 matchas with photos
23. Fresh Finds — log 3 first-time places within 30 days
24. Community Contributor — publish 10 matchas
25. Strawberry Matcha Master — log 100 matchas, visit 25 places, and earn 15 other achievements

## Settings

Settings is one clean, calm page inside Profile. It contains:

- **Account**
- **Matcha Defaults**
- **Appearance**
- **Accessibility**
- **Privacy & Community**
- **App & Tour**

Matcha defaults include milk, sweetness, size, and common add-ons. They auto-fill silently during logging and remain easy to change on an individual entry.

Light mode is the default. Dark mode is a nighttime scrapbook with deep berry/plum surfaces, warm paper cards, muted strawberry pink, and matcha accents.

Accessibility controls include text size, high contrast, reduced motion, readable type, larger touch targets, and reduced visual clutter.

## Community sharing

A shared matcha exposes only:

- Photo
- Place
- Strawberry rating

Optional personal details remain private. Community is contextual, not an endless social feed.

## Visual language

- Soft pink scrapbook background
- Warm cream paper cards
- Rounded playful typography throughout
- Selective handwritten-style labels and annotations
- Medium decoration: tape, stickers, doodles, slight card angles, and paper shadows
- Matcha green used as a supporting accent
- Tactile motion: cards lift, unfold, slide, and settle; strawberry ratings bounce
- Reduced-motion mode replaces tactile movement with simple state changes

## Navigation

Mobile navigation:

**Home · Places · Log Matcha · Map · Profile**

The center Log Matcha action is visually dominant. Settings lives inside Profile.
