const STORAGE_KEY = "smt.entries.v1";
const PHOTO_KEY = "smt.photos.v1";

const state = {
  user: null,
  cloudAvailable: false,
  entries: [],
  communityEntries: [],
  filter: "all",
  photoData: null,
  communityMap: null,
  communityMarkers: [],
  pinMap: null,
  pinMarker: null,
  tourIndex: 0,
};

const starLabels = ["Skip it", "Okay", "Good", "Great", "Obsessed"];
const vibeLabels = ["Not the vibe", "Cozy enough", "Cute", "Love it", "Perfect energy"];
const vibeIcons = ["☁", "◡", "✦", "♡", "🍓"];
const tourSteps = [
  { icon: "📷", title: "Snap the matcha", body: "Upload a photo and we’ll check it for GPS information. You can also use your phone location, search, or drop a pin." },
  { icon: "★", title: "Rate the drink", body: "Give the matcha 1–5 stars for the drink itself, then give the cafe a separate vibe check so great drinks and great spaces don’t get mixed together." },
  { icon: "♥", title: "Keep your favorites", body: "Save individual entries as favorites, record the milk, sweetness, price, add-ons, wait time, notes, and whether you’d order it again." },
  { icon: "⌖", title: "Share only when you want", body: "Entries are private by default. Turn on community sharing when you want a spot to appear on the public feed and strawberry matcha map." },
];

const $ = (id) => document.getElementById(id);

init();

async function init() {
  buildRatings();
  bindEvents();
  $("visitDate").value = new Date().toISOString().slice(0, 10);
  await loadIdentity();
  await loadEntries();
  renderAll();
}

function bindEvents() {
  document.querySelectorAll("[data-view]").forEach((button) => {
    button.addEventListener("click", () => switchView(button.dataset.view));
  });
  document.querySelectorAll("[data-filter]").forEach((button) => {
    button.addEventListener("click", () => {
      state.filter = button.dataset.filter;
      document.querySelectorAll("[data-filter]").forEach((chip) => chip.classList.toggle("is-active", chip === button));
      renderEntries();
    });
  });
  $("addMatchaButton").addEventListener("click", openEntryDialog);
  $("emptyAddButton").addEventListener("click", openEntryDialog);
  $("closeEntryDialog").addEventListener("click", closeEntryDialog);
  $("entryForm").addEventListener("submit", saveEntry);
  $("photoInput").addEventListener("change", handlePhoto);
  $("currentLocationButton").addEventListener("click", () => useCurrentLocation("current"));
  $("useLocationHeroButton").addEventListener("click", async () => { switchView("map"); await centerCommunityMapOnUser(); });
  $("mapLocateButton").addEventListener("click", centerCommunityMapOnUser);
  $("searchLocationButton").addEventListener("click", () => {
    $("locationSearchPanel").hidden = !$("locationSearchPanel").hidden;
    if (!$("locationSearchPanel").hidden) $("locationSearchInput").focus();
  });
  $("runLocationSearch").addEventListener("click", searchLocation);
  $("locationSearchInput").addEventListener("keydown", (event) => {
    if (event.key === "Enter") { event.preventDefault(); searchLocation(); }
  });
  $("togglePinMapButton").addEventListener("click", togglePinMap);
  $("tourButton").addEventListener("click", openTour);
  $("closeTour").addEventListener("click", () => $("tourDialog").close());
  $("tourBack").addEventListener("click", () => setTourStep(state.tourIndex - 1));
  $("tourNext").addEventListener("click", () => {
    if (state.tourIndex === tourSteps.length - 1) { $("tourDialog").close(); openEntryDialog(); return; }
    setTourStep(state.tourIndex + 1);
  });
}

async function loadIdentity() {
  try {
    const response = await fetch("/api/me", { headers: { accept: "application/json" } });
    if (response.ok) {
      const data = await response.json();
      if (data.authenticated) state.user = data.user;
    }
  } catch {}
  renderAccount();
}

async function loadEntries() {
  state.cloudAvailable = false;
  if (state.user) {
    try {
      const response = await fetch("/api/entries?scope=mine", { headers: { accept: "application/json" } });
      if (response.ok) {
        const data = await response.json();
        state.entries = data.entries || [];
        state.cloudAvailable = true;
      } else state.entries = loadLocalEntries();
    } catch { state.entries = loadLocalEntries(); }
  } else state.entries = loadLocalEntries();

  try {
    const response = await fetch("/api/entries?scope=community", { headers: { accept: "application/json" } });
    if (response.ok) {
      const data = await response.json();
      state.communityEntries = data.entries || [];
    } else state.communityEntries = state.entries.filter((entry) => entry.shareCommunity);
  } catch { state.communityEntries = state.entries.filter((entry) => entry.shareCommunity); }

  $("syncBanner").hidden = Boolean(state.cloudAvailable);
  if (!state.user) {
    $("syncBanner").hidden = false;
    $("syncBanner").querySelector("strong").textContent = "Guest browsing mode";
    $("syncBanner").querySelector("p").textContent = "You can explore and test entries on this device. Sign in with Google to sync once cloud storage is connected.";
  }
}

function renderAccount() {
  if (!state.user) {
    $("accountArea").innerHTML = `<a class="google-button" href="/auth/google"><span class="google-g" aria-hidden="true">G</span><span>Continue with Google</span></a>`;
    return;
  }
  const picture = state.user.picture
    ? `<img src="${escapeHtml(state.user.picture)}" alt="" referrerpolicy="no-referrer" />`
    : `<span class="google-g">${escapeHtml((state.user.name || "U").slice(0, 1).toUpperCase())}</span>`;
  $("accountArea").innerHTML = `<div class="profile-pill">${picture}<span class="profile-copy"><strong>${escapeHtml(state.user.name || "Matcha fan")}</strong><small>${escapeHtml(state.user.email || "")}</small></span><a class="logout-link" href="/auth/logout">Sign out</a></div>`;
}

function renderAll() { renderStats(); renderEntries(); renderCommunityList(); }

function renderStats() {
  const entries = state.entries;
  $("loggedCount").textContent = String(entries.length);
  $("favoriteCount").textContent = String(entries.filter((entry) => entry.favorite).length);
  if (entries.length) {
    const average = entries.reduce((sum, entry) => sum + Number(entry.rating || 0), 0) / entries.length;
    $("averageRating").textContent = average.toFixed(1);
    $("orderAgainPercent").textContent = `${Math.round((entries.filter((entry) => entry.wouldOrderAgain).length / entries.length) * 100)}%`;
  } else { $("averageRating").textContent = "—"; $("orderAgainPercent").textContent = "—"; }
}

function renderEntries() {
  let entries = [...state.entries].sort((a, b) => new Date(b.visitDate || b.createdAt || 0) - new Date(a.visitDate || a.createdAt || 0));
  if (state.filter === "favorites") entries = entries.filter((entry) => entry.favorite);
  if (state.filter === "shared") entries = entries.filter((entry) => entry.shareCommunity);
  $("entryGrid").innerHTML = entries.map(entryCard).join("");
  $("emptyState").hidden = entries.length > 0;
  $("entryGrid").querySelectorAll("[data-favorite-id]").forEach((button) => button.addEventListener("click", () => toggleFavorite(button.dataset.favoriteId)));
}

function entryCard(entry) {
  const photo = entry.photoData || getPhoto(entry.id);
  const chips = [entry.drinkSize, entry.milkType, entry.sweetness, ...(entry.addOns || [])].filter(Boolean);
  const location = entry.locationLabel || (entry.latitude ? `${Number(entry.latitude).toFixed(4)}, ${Number(entry.longitude).toFixed(4)}` : "Location not saved");
  return `<article class="entry-card"><div class="entry-photo">${photo ? `<img src="${photo}" alt="Strawberry matcha from ${escapeHtml(entry.placeName)}" />` : `<div class="entry-photo-fallback" aria-hidden="true">🍓🍵</div>`}${entry.shareCommunity ? `<span class="shared-badge">Shared</span>` : ""}<button class="favorite-button ${entry.favorite ? "is-favorite" : ""}" type="button" data-favorite-id="${escapeHtml(entry.id)}" title="${entry.favorite ? "Remove from favorites" : "Save as favorite"}" aria-label="${entry.favorite ? "Remove from favorites" : "Save as favorite"}">${entry.favorite ? "♥" : "♡"}</button></div><div class="entry-content"><div class="entry-title-row"><div><h3>${escapeHtml(entry.placeName)}</h3><div class="entry-location">${escapeHtml(location)}</div></div>${entry.priceCents != null ? `<span class="entry-price">$${(Number(entry.priceCents) / 100).toFixed(2)}</span>` : ""}</div><div class="entry-ratings"><span class="rating-pill" title="Matcha rating">★ ${entry.rating}/5</span><span class="rating-pill vibe" title="Vibe check">${vibeIcons[Math.max(0, Number(entry.vibe) - 1)] || "✦"} Vibe ${entry.vibe}/5</span>${entry.wouldOrderAgain ? `<span class="rating-pill vibe" title="Would order again">↻ Again</span>` : ""}</div>${chips.length ? `<div class="entry-meta">${chips.map((chip) => `<span class="meta-chip">${escapeHtml(chip)}</span>`).join("")}</div>` : ""}${entry.notes ? `<p class="entry-notes">${escapeHtml(entry.notes)}</p>` : ""}</div></article>`;
}

async function toggleFavorite(id) {
  const entry = state.entries.find((item) => item.id === id);
  if (!entry) return;
  const nextValue = !entry.favorite;
  entry.favorite = nextValue;
  if (state.user && state.cloudAvailable) {
    try {
      const response = await fetch(`/api/entries/${encodeURIComponent(id)}/favorite`, { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ favorite: nextValue }) });
      if (!response.ok) throw new Error();
    } catch { entry.favorite = !nextValue; showToast("Couldn’t update that favorite. Try again."); }
  } else saveLocalEntries();
  renderStats(); renderEntries();
}

function buildRatings() {
  $("starRating").innerHTML = starLabels.map((label, index) => `<button class="star-button" type="button" role="radio" aria-checked="false" data-rating="${index + 1}" title="${index + 1}/5 — ${label}" aria-label="${index + 1} out of 5: ${label}"><svg viewBox="0 0 24 24" aria-hidden="true"><path stroke-linejoin="round" stroke-linecap="round" d="M12 2.7l2.83 5.73 6.32.92-4.57 4.45 1.08 6.29L12 17.12l-5.66 2.97 1.08-6.29-4.57-4.45 6.32-.92L12 2.7z"/></svg></button>`).join("");
  $("vibeRating").innerHTML = vibeLabels.map((label, index) => `<button class="vibe-button" type="button" role="radio" aria-checked="false" data-vibe="${index + 1}" title="${index + 1}/5 — ${label}" aria-label="${index + 1} out of 5: ${label}">${vibeIcons[index]}</button>`).join("");
  $("starRating").querySelectorAll("button").forEach((button) => button.addEventListener("click", () => setStarRating(Number(button.dataset.rating))));
  $("vibeRating").querySelectorAll("button").forEach((button) => button.addEventListener("click", () => setVibeRating(Number(button.dataset.vibe))));
}

function setStarRating(value) {
  $("ratingValue").value = value ? String(value) : "";
  if (value) $("starRatingLabel").textContent = `${value}/5 — ${starLabels[value - 1]}`;
  $("starRating").querySelectorAll("button").forEach((button) => {
    const active = Number(button.dataset.rating) <= value;
    button.classList.toggle("is-on", active);
    button.setAttribute("aria-checked", String(Number(button.dataset.rating) === value));
  });
}

function setVibeRating(value) {
  $("vibeValue").value = value ? String(value) : "";
  if (value) $("vibeRatingLabel").textContent = `${value}/5 — ${vibeLabels[value - 1]}`;
  $("vibeRating").querySelectorAll("button").forEach((button) => {
    const selected = Number(button.dataset.vibe) === value;
    button.classList.toggle("is-on", selected);
    button.setAttribute("aria-checked", String(selected));
  });
}

function openEntryDialog() { resetEntryForm(); $("entryDialog").showModal(); }
function closeEntryDialog() { $("entryDialog").close(); resetEntryForm(); }

function resetEntryForm() {
  $("entryForm").reset();
  $("visitDate").value = new Date().toISOString().slice(0, 10);
  $("photoPreview").hidden = true; $("photoPreview").removeAttribute("src"); $("photoPlaceholder").hidden = false;
  $("photoStatus").textContent = ""; $("photoStatus").className = "photo-status";
  $("locationSearchPanel").hidden = true; $("locationSearchResults").innerHTML = ""; $("pinMap").hidden = true;
  $("locationSourceBadge").textContent = "No location yet"; $("locationSourceBadge").className = "location-source-badge";
  state.photoData = null; setStarRating(0); setVibeRating(0); $("starRatingLabel").textContent = "Tap a star"; $("vibeRatingLabel").textContent = "Tap the vibe";
  if (state.pinMarker && state.pinMap) { state.pinMap.removeLayer(state.pinMarker); state.pinMarker = null; }
}

async function handlePhoto(event) {
  const file = event.target.files?.[0];
  if (!file) return;
  $("photoStatus").className = "photo-status"; $("photoStatus").textContent = "Reading photo and checking for location…";
  try {
    state.photoData = await compressPhoto(file);
    if (state.photoData) { $("photoPreview").src = state.photoData; $("photoPreview").hidden = false; $("photoPlaceholder").hidden = true; }
  } catch { $("photoStatus").textContent = "Photo selected. Preview isn’t available in this browser."; }
  try {
    if (!window.exifr?.gps) throw new Error();
    const gps = await window.exifr.gps(file);
    if (gps?.latitude != null && gps?.longitude != null) {
      await setLocation(gps.latitude, gps.longitude, "photo");
      $("photoStatus").className = "photo-status is-success"; $("photoStatus").textContent = "Found GPS coordinates in the photo and added the location."; return;
    }
    $("photoStatus").className = "photo-status is-warning"; $("photoStatus").textContent = "Photo added, but it doesn’t contain GPS data. Use current location, search, or drop a pin below.";
  } catch { $("photoStatus").className = "photo-status is-warning"; $("photoStatus").textContent = "Photo added. We couldn’t read GPS data from this file, so choose a location below."; }
}

function compressPhoto(file) {
  return new Promise((resolve, reject) => {
    const reader = new FileReader(); reader.onerror = reject;
    reader.onload = () => {
      const image = new Image(); image.onerror = reject;
      image.onload = () => {
        const maxSide = 1000; const scale = Math.min(1, maxSide / Math.max(image.width, image.height));
        const canvas = document.createElement("canvas"); canvas.width = Math.round(image.width * scale); canvas.height = Math.round(image.height * scale);
        canvas.getContext("2d").drawImage(image, 0, 0, canvas.width, canvas.height); resolve(canvas.toDataURL("image/jpeg", 0.76));
      };
      image.src = reader.result;
    };
    reader.readAsDataURL(file);
  });
}

function useCurrentLocation(source = "current") {
  if (!navigator.geolocation) { showToast("Location isn’t available in this browser."); return; }
  $("locationSourceBadge").textContent = "Finding you…";
  navigator.geolocation.getCurrentPosition(async ({ coords }) => { await setLocation(coords.latitude, coords.longitude, source); showToast("Current location added."); }, () => { $("locationSourceBadge").textContent = "Location permission needed"; showToast("Allow location access or use search / drop a pin."); }, { enableHighAccuracy: true, timeout: 12000, maximumAge: 60000 });
}

async function setLocation(latitude, longitude, source, label = "") {
  $("latitude").value = String(latitude); $("longitude").value = String(longitude); $("locationSource").value = source;
  $("locationSourceBadge").className = "location-source-badge has-location";
  $("locationSourceBadge").textContent = source === "photo" ? "From photo GPS" : source === "pin" ? "Pinned location" : source === "search" ? "Searched location" : "Current location";
  if (label) $("locationLabel").value = label;
  updatePin(latitude, longitude);
  if (!label) { const reverse = await reverseGeocode(latitude, longitude); if (reverse) $("locationLabel").value = reverse; }
}

async function reverseGeocode(latitude, longitude) {
  try {
    const params = new URLSearchParams({ format: "jsonv2", lat: String(latitude), lon: String(longitude), zoom: "18", "accept-language": "en" });
    const response = await fetch(`https://nominatim.openstreetmap.org/reverse?${params}`); if (!response.ok) return "";
    const data = await response.json(); return data.display_name || "";
  } catch { return ""; }
}

async function searchLocation() {
  const query = $("locationSearchInput").value.trim(); if (!query) return;
  $("locationSearchResults").innerHTML = `<div class="search-result">Searching…</div>`;
  try {
    const params = new URLSearchParams({ format: "jsonv2", q: query, limit: "5", "accept-language": "en" });
    const response = await fetch(`https://nominatim.openstreetmap.org/search?${params}`); if (!response.ok) throw new Error();
    const results = await response.json();
    if (!results.length) { $("locationSearchResults").innerHTML = `<div class="search-result">No places found. Try another search.</div>`; return; }
    $("locationSearchResults").innerHTML = results.map((result, index) => `<button type="button" class="search-result" data-result-index="${index}">${escapeHtml(result.display_name)}</button>`).join("");
    $("locationSearchResults").querySelectorAll("[data-result-index]").forEach((button) => button.addEventListener("click", async () => {
      const result = results[Number(button.dataset.resultIndex)]; const displayName = result.display_name || "";
      if (!$("placeName").value.trim()) $("placeName").value = displayName.split(",")[0] || query;
      await setLocation(Number(result.lat), Number(result.lon), "search", displayName); $("locationSearchPanel").hidden = true;
    }));
  } catch { $("locationSearchResults").innerHTML = `<div class="search-result">Search is unavailable right now. You can still use current location or drop a pin.</div>`; }
}

function togglePinMap() { $("pinMap").hidden = !$("pinMap").hidden; if ($("pinMap").hidden) return; ensurePinMap(); setTimeout(() => state.pinMap?.invalidateSize(), 50); }

function ensurePinMap() {
  if (state.pinMap || !window.L) return;
  const startLat = Number($("latitude").value) || 39.5; const startLng = Number($("longitude").value) || -98.35; const zoom = $("latitude").value ? 15 : 4;
  state.pinMap = L.map("pinMap").setView([startLat, startLng], zoom);
  L.tileLayer("https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png", { maxZoom: 19, attribution: '&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a>' }).addTo(state.pinMap);
  state.pinMap.on("click", async (event) => { await setLocation(event.latlng.lat, event.latlng.lng, "pin"); });
  if ($("latitude").value) updatePin(startLat, startLng);
}

function updatePin(latitude, longitude) {
  if (!state.pinMap) return;
  if (state.pinMarker) state.pinMarker.setLatLng([latitude, longitude]); else state.pinMarker = L.marker([latitude, longitude]).addTo(state.pinMap);
  state.pinMap.setView([latitude, longitude], Math.max(state.pinMap.getZoom(), 15));
}

async function saveEntry(event) {
  event.preventDefault(); if (!$("entryForm").reportValidity()) return;
  const rating = Number($("ratingValue").value); const vibe = Number($("vibeValue").value);
  if (!rating || !vibe) { showToast("Add both a matcha rating and a vibe check."); return; }
  const entry = {
    id: crypto.randomUUID(), placeName: $("placeName").value.trim(), locationLabel: $("locationLabel").value.trim(), latitude: numberOrNull($("latitude").value), longitude: numberOrNull($("longitude").value), locationSource: $("locationSource").value || null,
    rating, vibe, priceCents: priceToCents($("price").value), drinkSize: $("drinkSize").value || null, milkType: $("milkType").value || null, sweetness: $("sweetness").value || null, visitDate: $("visitDate").value || null, waitMinutes: numberOrNull($("waitTime").value),
    addOns: $("addOns").value.split(",").map((item) => item.trim()).filter(Boolean).slice(0, 12), notes: $("notes").value.trim(), wouldOrderAgain: $("orderAgain").checked, shareCommunity: $("shareCommunity").checked, favorite: false, createdAt: new Date().toISOString(), photoData: state.photoData,
  };
  $("saveEntryButton").disabled = true; $("saveEntryButton").textContent = "Saving…";
  let saved = entry; let savedToCloud = false;
  if (state.user && state.cloudAvailable) {
    try {
      const payload = { ...entry }; delete payload.photoData;
      const response = await fetch("/api/entries", { method: "POST", headers: { "content-type": "application/json", accept: "application/json" }, body: JSON.stringify(payload) });
      if (!response.ok) throw new Error();
      const data = await response.json(); saved = { ...data.entry, photoData: state.photoData }; savedToCloud = true;
    } catch { showToast("Cloud save wasn’t available, so this entry was kept on this device."); }
  }
  state.entries.unshift(saved);
  if (!savedToCloud) saveLocalEntries();
  if (state.photoData) setPhoto(saved.id, state.photoData);
  if (saved.shareCommunity) state.communityEntries.unshift(saved);
  $("saveEntryButton").disabled = false; $("saveEntryButton").textContent = "Save matcha"; closeEntryDialog(); renderAll();
  showToast(saved.shareCommunity ? "Matcha saved and shared to the map." : "Matcha saved privately.");
}

function switchView(view) {
  $("collectionView").hidden = view !== "collection"; $("mapView").hidden = view !== "map";
  document.querySelectorAll("[data-view]").forEach((button) => button.classList.toggle("is-active", button.dataset.view === view));
  if (view === "map") { ensureCommunityMap(); setTimeout(() => state.communityMap?.invalidateSize(), 60); renderCommunityMap(); }
}

function ensureCommunityMap() {
  if (state.communityMap || !window.L) return;
  state.communityMap = L.map("communityMap").setView([39.5, -98.35], 4);
  L.tileLayer("https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png", { maxZoom: 19, attribution: '&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a>' }).addTo(state.communityMap);
}

function renderCommunityList() {
  const entries = state.communityEntries.filter(hasCoordinates); $("communityCount").textContent = `${entries.length} ${entries.length === 1 ? "place" : "places"}`;
  if (!entries.length) { $("communityList").innerHTML = `<div class="map-empty">No shared matchas with locations yet. Share one of yours and it’ll be the first pin here.</div>`; if (state.communityMap) renderCommunityMap(); return; }
  $("communityList").innerHTML = entries.map((entry) => `<button class="community-item" type="button" data-map-entry="${escapeHtml(entry.id)}"><strong>${escapeHtml(entry.placeName)}</strong><span>★ ${entry.rating}/5 · ${escapeHtml(entry.locationLabel || "Pinned location")}</span></button>`).join("");
  $("communityList").querySelectorAll("[data-map-entry]").forEach((button) => button.addEventListener("click", () => focusCommunityEntry(button.dataset.mapEntry)));
  if (state.communityMap) renderCommunityMap();
}

function renderCommunityMap() {
  ensureCommunityMap(); if (!state.communityMap) return;
  state.communityMarkers.forEach((marker) => marker.remove()); state.communityMarkers = [];
  const entries = state.communityEntries.filter(hasCoordinates); const bounds = [];
  entries.forEach((entry) => {
    const marker = L.marker([Number(entry.latitude), Number(entry.longitude)]).addTo(state.communityMap);
    marker.bindPopup(`<strong>${escapeHtml(entry.placeName)}</strong><br>★ ${entry.rating}/5 · Vibe ${entry.vibe}/5`); marker.__entryId = entry.id; state.communityMarkers.push(marker); bounds.push([Number(entry.latitude), Number(entry.longitude)]);
  });
  if (bounds.length === 1) state.communityMap.setView(bounds[0], 14); else if (bounds.length > 1) state.communityMap.fitBounds(bounds, { padding: [40, 40], maxZoom: 14 });
}

function focusCommunityEntry(id) {
  const entry = state.communityEntries.find((item) => item.id === id); if (!entry || !hasCoordinates(entry)) return;
  switchView("map"); state.communityMap.setView([Number(entry.latitude), Number(entry.longitude)], 16); const marker = state.communityMarkers.find((item) => item.__entryId === id); marker?.openPopup();
}

function centerCommunityMapOnUser() {
  ensureCommunityMap(); if (!navigator.geolocation) return showToast("Location isn’t available in this browser.");
  navigator.geolocation.getCurrentPosition(({ coords }) => { state.communityMap?.setView([coords.latitude, coords.longitude], 14); L.circleMarker([coords.latitude, coords.longitude], { radius: 7, weight: 3, fillOpacity: 1 }).addTo(state.communityMap).bindPopup("You are here"); }, () => showToast("Allow location access to center the map on you."), { enableHighAccuracy: true, timeout: 12000, maximumAge: 60000 });
}

function openTour() { setTourStep(0); $("tourDialog").showModal(); }
function setTourStep(index) {
  state.tourIndex = Math.max(0, Math.min(tourSteps.length - 1, index)); const step = tourSteps[state.tourIndex];
  $("tourIllustration").textContent = step.icon; $("tourStepLabel").textContent = `Step ${state.tourIndex + 1} of ${tourSteps.length}`; $("tourTitle").textContent = step.title; $("tourBody").textContent = step.body;
  $("tourBack").disabled = state.tourIndex === 0; $("tourNext").textContent = state.tourIndex === tourSteps.length - 1 ? "Add a matcha" : "Next";
  $("tourDots").innerHTML = tourSteps.map((_, i) => `<span class="tour-dot ${i === state.tourIndex ? "is-active" : ""}"></span>`).join("");
}

function loadLocalEntries() { try { const parsed = JSON.parse(localStorage.getItem(STORAGE_KEY) || "[]"); return Array.isArray(parsed) ? parsed : []; } catch { return []; } }
function saveLocalEntries() {
  try {
    const trimmed = state.entries.map(({ photoData, ...entry }) => entry); localStorage.setItem(STORAGE_KEY, JSON.stringify(trimmed));
    state.entries.forEach((entry) => { if (entry.photoData) setPhoto(entry.id, entry.photoData); });
  } catch { showToast("This browser is low on local storage. Your newest photo may not persist."); }
}
function getPhoto(id) { try { return JSON.parse(localStorage.getItem(PHOTO_KEY) || "{}")[id] || null; } catch { return null; } }
function setPhoto(id, data) {
  if (!data) return;
  try { const photos = JSON.parse(localStorage.getItem(PHOTO_KEY) || "{}"); photos[id] = data; const keys = Object.keys(photos); while (keys.length > 10) delete photos[keys.shift()]; localStorage.setItem(PHOTO_KEY, JSON.stringify(photos)); } catch {}
}
function hasCoordinates(entry) { return entry.latitude != null && entry.longitude != null && Number.isFinite(Number(entry.latitude)) && Number.isFinite(Number(entry.longitude)); }
function priceToCents(value) { const price = Number.parseFloat(String(value).replace(/[^0-9.]/g, "")); return Number.isFinite(price) ? Math.round(price * 100) : null; }
function numberOrNull(value) { if (value === "" || value == null) return null; const number = Number(value); return Number.isFinite(number) ? number : null; }
function escapeHtml(value) { return String(value ?? "").replaceAll("&", "&amp;").replaceAll("<", "&lt;").replaceAll(">", "&gt;").replaceAll('"', "&quot;").replaceAll("'", "&#039;"); }
let toastTimer;
function showToast(message) { clearTimeout(toastTimer); $("toast").textContent = message; $("toast").classList.add("is-visible"); toastTimer = setTimeout(() => $("toast").classList.remove("is-visible"), 3200); }
