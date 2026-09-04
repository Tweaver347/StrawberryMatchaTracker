# Quick-Win Product Upgrade

This pass turns five MVP-level ideas into product features without changing the core camera-first logging flow.

## 1. Search and filtering

Home now includes scrapbook-memory filters for:

- cafe, notes, milk, sweetness, add-ons, or location text
- minimum strawberry rating
- milk type
- private vs. published
- favorites
- last 30 days or current year

The filter result count updates live and the same filtered set can be opened in Manage mode.

## 2. Finished-memory management

Expanded memory cards now support:

- shareable image cards
- archive
- permanent delete
- existing in-place photo replacement and detail editing
- existing private/published toggle

Manage mode supports selecting several visible memories and applying:

- Make private
- Publish
- Archive
- Delete

Archived memories move out of active Home, Places, Map, profile statistics, published memories, achievements, and recap calculations. They can be restored or permanently deleted from Profile.

Archive state is stored in the existing synced settings payload so no new database table is required for this pass.

## 3. Shareable matcha cards

A memory can be rendered into a 1080 × 1350 strawberry-scrapbook PNG containing:

- the matcha photo
- cafe/place
- strawberry rating
- visit date
- Strawberry Matcha Scrapbook branding

On supported mobile browsers the Web Share API opens the native share sheet with the generated image. Other browsers download the PNG.

## 4. Monthly and yearly recaps

Profile now includes **Scrapbook Recaps** for the current month and current year. Each recap calculates:

- matchas logged
- average rating
- unique places
- five-strawberry finds
- top-rated place
- most-used milk
- total spend for entries with recorded prices

Each recap can also be rendered to a shareable image.

## 5. Achievement expansion

The original 25 achievements remain, with 10 additional automatically calculated stickers:

26. Rating Rainbow — use every rating from 1 through 5
27. Milk Flight — try four milk choices
28. Sweetness Scientist — log four sweetness levels
29. Price Scout — record price on 10 matchas
30. Critic's Notebook — write notes on 10 matchas
31. Cafe Circuit — return to five different cafes at least twice
32. Pin Collector — log 20 matchas with map coordinates
33. Return Ticket — mark would-order-again on 20 matchas
34. Share a Favorite — publish a five-strawberry matcha
35. Detailed Decade — fully detail 10 scrapbook pages

Achievement rendering already uses the definition count dynamically, so the board now shows progress out of 35 rather than 25 after the app loads.
