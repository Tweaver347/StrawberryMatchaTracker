"use strict";

function ensurePersonalMap() {
  if (state.personalMap || !window.L) return;
  state.personalMap = L.map("personalMap", { zoomControl: true }).setView([35.8, -78.65], 10);
  L.tileLayer("https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png", {
    maxZoom: 19,
    attribution: '&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a>',
  }).addTo(state.personalMap);
  state.personalMarkerLayer = L.layerGroup().addTo(state.personalMap);
  state.communityMarkerLayer = L.layerGroup().addTo(state.personalMap);
}

function renderMapMarkers() {
  ensurePersonalMap();
  if (!state.personalMap) return;
  state.personalMarkerLayer.clearLayers();
  state.communityMarkerLayer.clearLayers();

  const bounds = [];
  const personalPlaces = state.placeGroups.map((place) => {
    const located = place.entries.filter(hasCoordinates);
    if (!located.length) return null;
    const latitude = located.reduce((sum, entry) => sum + Number(entry.latitude), 0) / located.length;
    const longitude = located.reduce((sum, entry) => sum + Number(entry.longitude), 0) / located.length;
    return { ...place, latitude, longitude };
  }).filter(Boolean);

  personalPlaces.forEach((place) => {
    const size = Math.min(62, 38 + Math.max(0, place.visits - 1) * 5);
    const icon = L.divIcon({
      className: "map-marker-wrap",
      html: `<div class="scrapbook-map-pin" style="width:${size}px;height:${size}px"><span>🍓</span>${place.visits > 1 ? `<b class="pin-count">${place.visits}</b>` : ""}</div>`,
      iconSize: [size, size],
      iconAnchor: [size / 2, size],
      popupAnchor: [0, -size + 6],
    });
    const marker = L.marker([place.latitude, place.longitude], { icon }).addTo(state.personalMarkerLayer);
    marker.bindPopup(`<strong>${escapeHtml(place.name)}</strong><br>${place.visits} ${place.visits === 1 ? "visit" : "visits"} · ${place.average.toFixed(1)} 🍓`);
    marker.on("click", () => {
      setTimeout(() => {
        const popup = marker.getPopup()?.getElement();
        popup?.addEventListener("dblclick", () => openPlaceDialog(place.key), { once: true });
      }, 0);
    });
    bounds.push([place.latitude, place.longitude]);
  });

  if (state.showCommunityLayer) {
    const ownIds = new Set(state.entries.map((entry) => entry.id));
    state.communityEntries.filter((entry) => !ownIds.has(entry.id) && hasCoordinates(entry)).forEach((entry) => {
      const size = 33;
      const icon = L.divIcon({
        className: "map-marker-wrap",
        html: `<div class="scrapbook-map-pin community-pin" style="width:${size}px;height:${size}px"><span>🍵</span></div>`,
        iconSize: [size, size],
        iconAnchor: [size / 2, size],
        popupAnchor: [0, -size + 5],
      });
      const marker = L.marker([Number(entry.latitude), Number(entry.longitude)], { icon }).addTo(state.communityMarkerLayer);
      marker.bindPopup(`<strong>${escapeHtml(entry.placeName || "Community matcha")}</strong><br>${Number(entry.rating || 0)} 🍓`);
      bounds.push([Number(entry.latitude), Number(entry.longitude)]);
    });
  }

  if (bounds.length === 1) state.personalMap.setView(bounds[0], 15);
  else if (bounds.length > 1) state.personalMap.fitBounds(bounds, { padding: [45, 45], maxZoom: 14 });
}

function centerMapOnUser() {
  ensurePersonalMap();
  if (!navigator.geolocation) {
    showToast("Location is not available in this browser.");
    return;
  }
  navigator.geolocation.getCurrentPosition(({ coords }) => {
    const latlng = [coords.latitude, coords.longitude];
    state.personalMap.setView(latlng, 14);
    state.userMarker?.remove();
    state.userMarker = L.circleMarker(latlng, {
      radius: 8,
      color: "#fff",
      weight: 3,
      fillColor: "#e75e84",
      fillOpacity: 1,
    }).addTo(state.personalMap).bindPopup("You are here");
  }, () => showToast("Allow location access to center the map."), {
    enableHighAccuracy: true,
    timeout: 12000,
    maximumAge: 60000,
  });
}

function renderProfile() {
  const favoritePlace = chooseProfileFavoritePlace();
  renderFavoritePlaceFeature(favoritePlace);

  $("profileTotalMatchas").textContent = String(state.entries.length);
  $("profilePlacesVisited").textContent = String(state.placeGroups.length);
  $("profileAverageRating").textContent = state.entries.length
    ? (state.entries.reduce((sum, entry) => sum + Number(entry.rating || 0), 0) / state.entries.length).toFixed(1)
    : "—";

  renderAchievements();
  renderDrafts();
  renderPublished();
}

function chooseProfileFavoritePlace() {
  const favorites = state.placeGroups.filter((place) => place.status === "favorite");
  if (favorites.length) return [...favorites].sort((a, b) => b.average - a.average || b.visits - a.visits)[0];
  if (!state.placeGroups.length) return null;
  return [...state.placeGroups].sort((a, b) => (b.average * Math.log2(b.visits + 1)) - (a.average * Math.log2(a.visits + 1)))[0];
}

function renderFavoritePlaceFeature(place) {
  if (!place) {
    $("favoritePlaceFeature").innerHTML = `<div class="empty-paper"><span class="empty-sticker" aria-hidden="true">♡</span><h3>Your favorite is still waiting to be found.</h3><p>Repeated high ratings and “would order again” answers help the app learn which place belongs here.</p></div>`;
    return;
  }

  const photo = getEntryPhoto(place.latest);
  const label = place.status === "favorite" ? "suggested favorite place" : "leading favorite so far";
  $("favoritePlaceFeature").innerHTML = `
    <article class="favorite-place-card">
      <div class="favorite-place-photo">${photo ? `<img src="${escapeHtml(photo)}" alt="Latest matcha from ${escapeHtml(place.name)}" />` : `<div class="memory-photo-fallback" aria-hidden="true">🍓🍵</div>`}</div>
      <div class="favorite-place-copy">
        <span class="hand-label">${escapeHtml(label)}</span>
        <h3>${escapeHtml(place.name)}</h3>
        <p>${place.status === "favorite" ? "Repeated strong visits and repeat-order answers put this place at the top of your scrapbook." : "This is your strongest place so far. Add repeat-order thoughts to help the app make a firmer recommendation."}</p>
        <div class="favorite-evidence"><span class="evidence-pill">${place.visits} visits</span><span class="evidence-pill">${place.average.toFixed(1)} / 5 average</span><span class="evidence-pill">${place.repeatKnown ? `${place.repeatYes}/${place.repeatKnown} order again` : "Still learning"}</span></div>
        <span class="hand-label">every matcha from here</span>
        <div class="favorite-place-track">${place.entries.map(miniMemoryHtml).join("")}</div>
      </div>
    </article>`;
}

function miniMemoryHtml(entry) {
  const photo = getEntryPhoto(entry);
  return `<button class="mini-memory-card" type="button" data-mini-entry-id="${escapeHtml(entry.id)}">${photo ? `<img src="${escapeHtml(photo)}" alt="Matcha at ${escapeHtml(entry.placeName)}" />` : `<span class="mini-memory-fallback" aria-hidden="true">🍓🍵</span>`}<span class="mini-memory-copy"><strong>${Number(entry.rating || 0)} strawberries</strong><small>${escapeHtml(formatEntryDate(entry))}</small></span></button>`;
}

function handleProfileFavoriteAction(event) {
  const card = event.target.closest("[data-mini-entry-id]");
  if (!card) return;
  openMemoryDialog(card.dataset.miniEntryId);
}

function renderAchievements() {
  const context = buildAchievementContext();
  const existingEarned = state.settings.earnedAchievements && typeof state.settings.earnedAchievements === "object"
    ? { ...state.settings.earnedAchievements }
    : {};

  let changed = false;
  let otherEarned = ACHIEVEMENT_DEFINITIONS.filter((definition) => definition.id !== "strawberry-matcha-master").reduce((count, definition) => {
    const unlocked = Boolean(existingEarned[definition.id]) || definition.metric(context) >= definition.target;
    return count + (unlocked ? 1 : 0);
  }, 0);
  context.otherEarned = otherEarned;

  const achievements = ACHIEVEMENT_DEFINITIONS.map((definition) => {
    const currentlyUnlocked = definition.metric(context) >= definition.target;
    const earned = Boolean(existingEarned[definition.id]) || currentlyUnlocked;
    if (earned && !existingEarned[definition.id]) {
      existingEarned[definition.id] = new Date().toISOString();
      changed = true;
    }
    return { ...definition, earned, earnedAt: existingEarned[definition.id] || null };
  });

  if (changed) {
    state.settings.earnedAchievements = existingEarned;
    persistSettings();
  }

  const earnedCount = achievements.filter((achievement) => achievement.earned).length;
  $("achievementCount").textContent = `${earnedCount} / ${achievements.length} earned`;
  $("achievementBoard").innerHTML = achievements.map((achievement) => `
    <button class="achievement-sticker ${achievement.earned ? "is-earned" : "is-locked"}" type="button" data-achievement-id="${achievement.id}" title="${escapeHtml(achievement.description)}">
      <span class="sticker-face" aria-hidden="true">${achievement.icon}</span>
      <span class="achievement-name">${escapeHtml(achievement.name)}</span>
      <span class="achievement-progress">${achievement.earned ? `earned${achievement.earnedAt ? ` · ${formatDate(achievement.earnedAt)}` : ""}` : escapeHtml(achievement.progress(context))}</span>
    </button>`).join("");
}

function buildAchievementContext() {
  const entries = [...state.entries].sort(sortEntriesOldest);
  const total = entries.length;
  const average = total ? entries.reduce((sum, entry) => sum + Number(entry.rating || 0), 0) / total : 0;
  let currentStreak = 0;
  let highRatingStreak = 0;
  for (const entry of entries) {
    if (Number(entry.rating) >= 4) {
      currentStreak += 1;
      highRatingStreak = Math.max(highRatingStreak, currentStreak);
    } else {
      currentStreak = 0;
    }
  }

  const firstByPlace = new Map();
  entries.forEach((entry) => {
    const key = normalizePlaceKey(entry.placeName);
    const date = new Date(entry.visitDate || entry.createdAt || 0);
    if (!key || Number.isNaN(date.getTime())) return;
    if (!firstByPlace.has(key) || date < firstByPlace.get(key)) firstByPlace.set(key, date);
  });
  const thirtyDaysAgo = Date.now() - 30 * 24 * 60 * 60 * 1000;
  const freshPlaceCount = [...firstByPlace.values()].filter((date) => date.getTime() >= thirtyDaysAgo).length;

  return {
    total,
    average,
    placeCount: state.placeGroups.length,
    maxVisits: state.placeGroups.reduce((max, place) => Math.max(max, place.visits), 0),
    favoritePlaceCount: state.placeGroups.filter((place) => place.status === "favorite").length,
    avoidPlaceCount: state.placeGroups.filter((place) => place.status === "avoid").length,
    fiveRatings: entries.filter((entry) => Number(entry.rating) === 5).length,
    highRatingStreak,
    orderAgainYes: entries.filter((entry) => entry.wouldOrderAgain === true).length,
    enrichedCount: entries.filter(hasOptionalDetails).length,
    fullDetailCount: entries.filter(hasFullDetails).length,
    photoCount: entries.filter((entry) => Boolean(getEntryPhoto(entry))).length,
    freshPlaceCount,
    publishedCount: entries.filter((entry) => entry.shareCommunity).length,
    otherEarned: 0,
  };
}

function handleAchievementClick(event) {
  const button = event.target.closest("[data-achievement-id]");
  if (!button) return;
  const definition = ACHIEVEMENT_DEFINITIONS.find((item) => item.id === button.dataset.achievementId);
  if (!definition) return;
  const earnedAt = state.settings.earnedAchievements?.[definition.id];
  showToast(`${definition.name}: ${definition.description}${earnedAt ? ` Earned ${formatDate(earnedAt)}.` : ` ${definition.progress(buildAchievementContext())}.`}`);
}

function renderDrafts() {
  const drafts = [...state.drafts].sort((a, b) => new Date(b.updatedAt || b.createdAt || 0) - new Date(a.updatedAt || a.createdAt || 0));
  $("draftList").innerHTML = drafts.map((draft) => {
    const photo = getEntryPhoto(draft);
    const missing = draftMissingLabel(draft);
    return `<article class="draft-row"><div class="draft-thumb">${photo ? `<img src="${escapeHtml(photo)}" alt="Draft matcha photo" />` : "📷"}</div><div class="draft-copy"><strong>${escapeHtml(draft.placeName || "Place not chosen")}</strong><span>${escapeHtml(missing)}</span><small>Last edited ${escapeHtml(formatRelativeTime(draft.updatedAt || draft.createdAt))}</small></div><div class="draft-actions"><button class="secondary-button" type="button" data-draft-action="continue" data-draft-id="${escapeHtml(draft.id)}">Continue</button><button class="text-button danger-text" type="button" data-draft-action="delete" data-draft-id="${escapeHtml(draft.id)}">Delete</button></div></article>`;
  }).join("");
  $("draftEmpty").hidden = drafts.length > 0;
}

function draftMissingLabel(draft) {
  const missing = [];
  if (!getEntryPhoto(draft)) missing.push("photo");
  if (!draft.placeName) missing.push("place");
  if (!draft.rating) missing.push("rating");
  return missing.length ? `Needs ${missing.join(" + ")}` : "Ready to finish";
}

function handleDraftAction(event) {
  const button = event.target.closest("[data-draft-action]");
  if (!button) return;
  const draft = state.drafts.find((item) => item.id === button.dataset.draftId);
  if (!draft) return;
  if (button.dataset.draftAction === "continue") continueDraft(draft);
  if (button.dataset.draftAction === "delete") deleteDraft(draft);
}
