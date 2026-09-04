"use strict";

function renderPlaces() {
  const favorites = state.placeGroups.filter((place) => place.status === "favorite");
  const avoid = state.placeGroups.filter((place) => place.status === "avoid");

  $("favoritePlacesBoard").innerHTML = favorites.length
    ? favorites.map((place) => placePinHtml(place, "favorite")).join("")
    : `<div class="pinboard-empty">Keep logging honest ratings and “would order again” thoughts. A favorite suggestion appears after repeated strong visits.</div>`;

  $("avoidPlacesBoard").innerHTML = avoid.length
    ? avoid.map((place) => placePinHtml(place, "avoid")).join("")
    : `<div class="pinboard-empty">No places have earned a pause yet. Repeated low ratings and “would not order again” answers will surface here.</div>`;

  renderAllPlaces();
}

function placePinHtml(place, type) {
  const pulse = getCommunityPulse(place.key);
  const label = type === "favorite" ? "suggested favorite" : "wait before revisiting";
  const repeatText = place.repeatKnown
    ? `${place.repeatYes}/${place.repeatKnown} would order again`
    : "Add closing thoughts to strengthen this suggestion";
  return `
    <button class="pin-note" type="button" data-place-key="${escapeHtml(place.key)}">
      <span class="pin-label">${escapeHtml(label)}</span>
      <h3>${escapeHtml(place.name)}</h3>
      <div class="pin-evidence"><span>${place.visits} ${place.visits === 1 ? "visit" : "visits"}</span><span>${place.average.toFixed(1)} / 5 average</span><span>${escapeHtml(repeatText)}</span></div>
      ${pulse ? `<div class="community-pulse">Community pulse: ${pulse.average.toFixed(1)} / 5 from ${pulse.count}</div>` : `<div class="community-pulse">No community pulse yet</div>`}
    </button>`;
}

function renderAllPlaces() {
  const query = ($("placeFilterInput")?.value || "").trim().toLowerCase();
  const places = state.placeGroups.filter((place) => !query || place.name.toLowerCase().includes(query));
  $("allPlacesList").innerHTML = places.length
    ? places.map((place) => {
        const photo = getEntryPhoto(place.latest);
        return `<button class="visited-place-row" type="button" data-place-key="${escapeHtml(place.key)}"><span class="place-thumb">${photo ? `<img src="${escapeHtml(photo)}" alt="" />` : "🍓"}</span><span class="place-row-copy"><strong>${escapeHtml(place.name)}</strong><small>${place.visits} ${place.visits === 1 ? "visit" : "visits"} · ${place.repeatKnown ? `${place.repeatYes}/${place.repeatKnown} order again` : "still learning"}</small></span><span class="place-row-score">${place.average.toFixed(1)} 🍓</span></button>`;
      }).join("")
    : `<div class="empty-inline">${query ? "No visited places match that search." : "Your visited places will collect here."}</div>`;
}

function handlePlaceCardClick(event) {
  const button = event.target.closest("[data-place-key]");
  if (!button) return;
  openPlaceDialog(button.dataset.placeKey);
}

function openPlaceDialogByEntry(entry) {
  openPlaceDialog(normalizePlaceKey(entry.placeName));
}

function openPlaceDialog(placeKey) {
  const place = state.placeGroups.find((item) => item.key === placeKey);
  if (!place) return;
  const pulse = getCommunityPulse(place.key);
  const photo = getEntryPhoto(place.latest);
  const statusCopy = place.status === "favorite"
    ? "This place currently qualifies as a Favorite Place suggestion."
    : place.status === "avoid"
      ? "Your history suggests waiting until you hear something has changed."
      : "The app is still learning from your visits here.";

  $("placeDialogContent").innerHTML = `
    <div class="place-dialog-hero">
      <div class="place-dialog-photo">${photo ? `<img src="${escapeHtml(photo)}" alt="Latest matcha from ${escapeHtml(place.name)}" />` : "🍓🍵"}</div>
      <div><span class="hand-label">place history</span><h2 id="placeDialogTitle">${escapeHtml(place.name)}</h2><p>${escapeHtml(statusCopy)}</p><div class="place-dialog-stats"><span class="evidence-pill">${place.visits} visits</span><span class="evidence-pill">${place.average.toFixed(1)} / 5 average</span><span class="evidence-pill">${place.repeatKnown ? `${place.repeatYes}/${place.repeatKnown} order again` : "No repeat decision yet"}</span></div>${pulse ? `<p class="community-pulse">Community: ${pulse.average.toFixed(1)} / 5 across ${pulse.count} public ${pulse.count === 1 ? "memory" : "memories"}</p>` : ""}</div>
    </div>
    <span class="hand-label">every matcha from this place</span>
    <div class="favorite-place-track">${place.entries.map(miniMemoryHtml).join("")}</div>`;
  $("placeDialog").showModal();
}

function handlePlaceDialogAction(event) {
  const card = event.target.closest("[data-mini-entry-id]");
  if (!card) return;
  $("placeDialog").close();
  openMemoryDialog(card.dataset.miniEntryId);
}

function buildPlaceGroups(entries) {
  const groups = new Map();
  entries.filter(isCompleteEntry).forEach((entry) => {
    const key = normalizePlaceKey(entry.placeName);
    if (!key) return;
    if (!groups.has(key)) groups.set(key, { key, name: entry.placeName, entries: [] });
    groups.get(key).entries.push(entry);
  });

  return [...groups.values()].map((place) => {
    place.entries.sort(sortEntriesNewest);
    place.latest = place.entries[0];
    place.visits = place.entries.length;
    place.average = place.entries.reduce((sum, entry) => sum + Number(entry.rating || 0), 0) / Math.max(place.visits, 1);
    const repeatEntries = place.entries.filter((entry) => typeof entry.wouldOrderAgain === "boolean");
    place.repeatKnown = repeatEntries.length;
    place.repeatYes = repeatEntries.filter((entry) => entry.wouldOrderAgain).length;
    place.repeatRate = place.repeatKnown ? place.repeatYes / place.repeatKnown : null;
    place.status = inferPlaceStatus(place);
    return place;
  }).sort((a, b) => b.visits - a.visits || b.average - a.average || a.name.localeCompare(b.name));
}

function inferPlaceStatus(place) {
  if (place.visits >= 2 && place.average >= 4.2 && place.repeatKnown >= 2 && place.repeatRate >= 0.75) return "favorite";
  if (place.visits >= 2 && place.average <= 2.6 && place.repeatKnown >= 2 && place.repeatRate <= 0.25) return "avoid";
  return "learning";
}

function getCommunityPulse(placeKey) {
  const matches = state.communityEntries.filter((entry) => normalizePlaceKey(entry.placeName) === placeKey && Number(entry.rating));
  if (!matches.length) return null;
  return {
    count: matches.length,
    average: matches.reduce((sum, entry) => sum + Number(entry.rating), 0) / matches.length,
  };
}
