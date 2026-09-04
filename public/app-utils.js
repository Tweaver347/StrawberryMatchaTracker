"use strict";

async function reverseGeocodePlace(latitude, longitude) {
  try {
    const params = new URLSearchParams({
      format: "jsonv2",
      lat: String(latitude),
      lon: String(longitude),
      zoom: "18",
      addressdetails: "1",
      namedetails: "1",
      "accept-language": "en",
    });
    const response = await fetch(`https://nominatim.openstreetmap.org/reverse?${params.toString()}`);
    if (!response.ok) throw new Error();
    const data = await response.json();
    const address = data.address || {};
    const name = data.namedetails?.name
      || data.name
      || address.cafe
      || address.restaurant
      || address.amenity
      || address.shop
      || address.building
      || address.road
      || address.neighbourhood
      || address.suburb
      || "Current location";
    return { name, address: data.display_name || "" };
  } catch {
    return { name: "Current location", address: "" };
  }
}

function getCurrentPosition() {
  return new Promise((resolve, reject) => {
    if (!navigator.geolocation) {
      reject(new Error("geolocation_unavailable"));
      return;
    }
    navigator.geolocation.getCurrentPosition(
      ({ coords }) => resolve({ latitude: coords.latitude, longitude: coords.longitude }),
      reject,
      { enableHighAccuracy: true, timeout: 12000, maximumAge: 60000 },
    );
  });
}

async function extractPhotoGps(file) {
  try {
    if (!window.exifr?.gps) return null;
    const gps = await window.exifr.gps(file);
    if (gps?.latitude == null || gps?.longitude == null) return null;
    return { latitude: Number(gps.latitude), longitude: Number(gps.longitude) };
  } catch {
    return null;
  }
}

function compressPhoto(file) {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onerror = reject;
    reader.onload = () => {
      const image = new Image();
      image.onerror = reject;
      image.onload = () => {
        const maxSide = 1440;
        const scale = Math.min(1, maxSide / Math.max(image.naturalWidth || image.width, image.naturalHeight || image.height));
        const width = Math.max(1, Math.round((image.naturalWidth || image.width) * scale));
        const height = Math.max(1, Math.round((image.naturalHeight || image.height) * scale));
        const canvas = document.createElement("canvas");
        canvas.width = width;
        canvas.height = height;
        const context = canvas.getContext("2d", { alpha: false });
        context.fillStyle = "#fff";
        context.fillRect(0, 0, width, height);
        context.drawImage(image, 0, 0, width, height);
        resolve(canvas.toDataURL("image/jpeg", 0.82));
      };
      image.src = String(reader.result);
    };
    reader.readAsDataURL(file);
  });
}

function replaceEntry(entry, save = true) {
  const index = state.entries.findIndex((item) => item.id === entry.id);
  if (index === -1) state.entries.unshift(entry);
  else state.entries[index] = { ...state.entries[index], ...entry };
  state.entries.sort(sortEntriesNewest);
  if (save) saveLocalEntries();
}

function communityShape(entry) {
  return {
    id: entry.id,
    placeName: entry.placeName,
    locationLabel: entry.locationLabel,
    latitude: entry.latitude,
    longitude: entry.longitude,
    rating: entry.rating,
    photoUrl: entry.photoUrl || `/api/photos/${entry.id}`,
    createdAt: entry.createdAt,
  };
}

function loadLocalArray(key) {
  try {
    const value = JSON.parse(localStorage.getItem(key) || "[]");
    return Array.isArray(value) ? value : [];
  } catch {
    return [];
  }
}

function saveLocalEntries() {
  try {
    const entries = state.entries.map(({ photoData, ...entry }) => entry);
    localStorage.setItem(STORAGE_KEY, JSON.stringify(entries));
  } catch {
    showToast("This browser is low on storage. New photos may not stay on this device.");
  }
}

function saveLocalDrafts() {
  try {
    const drafts = state.drafts.map(({ photoData, ...draft }) => draft);
    localStorage.setItem(DRAFT_KEY, JSON.stringify(drafts));
  } catch {
    // Draft metadata remains in memory for this visit.
  }
}

function getPhotoStore() {
  try {
    const photos = JSON.parse(localStorage.getItem(PHOTO_KEY) || "{}");
    return photos && typeof photos === "object" ? photos : {};
  } catch {
    return {};
  }
}

function setLocalPhoto(id, data) {
  if (!id || !data?.startsWith("data:image/")) return;
  try {
    const photos = getPhotoStore();
    photos[id] = { data, savedAt: Date.now() };
    const ordered = Object.entries(photos).sort((a, b) => Number(a[1]?.savedAt || 0) - Number(b[1]?.savedAt || 0));
    while (ordered.length > MAX_LOCAL_PHOTOS) {
      const [oldestId] = ordered.shift();
      delete photos[oldestId];
    }
    localStorage.setItem(PHOTO_KEY, JSON.stringify(photos));
  } catch {
    // Cloud photos remain available if local storage is full.
  }
}

function getLocalPhoto(id) {
  const stored = getPhotoStore()[id];
  if (typeof stored === "string") return stored;
  return stored?.data || null;
}

function removeLocalPhoto(id) {
  try {
    const photos = getPhotoStore();
    delete photos[id];
    localStorage.setItem(PHOTO_KEY, JSON.stringify(photos));
  } catch {}
}

function getEntryPhoto(entry) {
  return entry?.photoData || getLocalPhoto(entry?.id) || entry?.photoUrl || null;
}

function attachLocalPhotoIfNeeded(entry) {
  if (!entry || typeof entry !== "object") return entry;
  const local = getLocalPhoto(entry.id);
  return local && !entry.photoData ? { ...entry, photoData: local } : entry;
}

function mergeRemoteWithPendingEntries(remote, local) {
  const map = new Map(remote.map((entry) => [entry.id, { ...entry, syncPending: false }]));
  local.filter((entry) => entry?.syncPending).forEach((entry) => {
    if (!map.has(entry.id)) map.set(entry.id, attachLocalPhotoIfNeeded(entry));
  });
  return [...map.values()].sort(sortEntriesNewest);
}

function mergeDrafts(remote, local) {
  const map = new Map();
  [...local, ...remote].forEach((draft) => {
    const existing = map.get(draft.id);
    if (!existing || new Date(draft.updatedAt || 0) >= new Date(existing.updatedAt || 0)) map.set(draft.id, draft);
  });
  return [...map.values()];
}

function isCompleteEntry(entry) {
  return entry?.status !== "draft" && Boolean(getEntryPhoto(entry) && entry.placeName && Number(entry.rating));
}

function hasOptionalDetails(entry) {
  return Boolean(
    entry.priceCents != null || entry.drinkSize || entry.milkType || entry.sweetness || entry.waitMinutes != null ||
    (entry.addOns || []).length || entry.notes || entry.vibe || typeof entry.wouldOrderAgain === "boolean"
  );
}

function hasFullDetails(entry) {
  return Boolean(
    entry.priceCents != null && entry.drinkSize && entry.milkType && entry.sweetness && entry.visitDate &&
    entry.waitMinutes != null && (entry.addOns || []).length && entry.notes && entry.vibe &&
    typeof entry.wouldOrderAgain === "boolean"
  );
}

function hasCoordinates(entry) {
  return entry?.latitude != null && entry?.longitude != null && Number.isFinite(Number(entry.latitude)) && Number.isFinite(Number(entry.longitude));
}

function normalizePlaceKey(value) {
  return String(value || "")
    .toLowerCase()
    .normalize("NFKD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/&/g, "and")
    .replace(/[^a-z0-9]+/g, " ")
    .trim();
}

function formatEntryDate(entry) {
  return entry.visitDate ? formatDate(entry.visitDate) : formatDate(entry.createdAt);
}

function formatDate(value) {
  if (!value) return "Date not saved";
  const date = /^\d{4}-\d{2}-\d{2}$/.test(String(value))
    ? new Date(`${value}T12:00:00`)
    : new Date(value);
  if (Number.isNaN(date.getTime())) return "Date not saved";
  return new Intl.DateTimeFormat(undefined, { month: "short", day: "numeric", year: "numeric" }).format(date);
}

function formatRelativeTime(value) {
  const date = new Date(value || 0);
  if (Number.isNaN(date.getTime())) return "recently";
  const seconds = Math.round((date.getTime() - Date.now()) / 1000);
  const absolute = Math.abs(seconds);
  const formatter = new Intl.RelativeTimeFormat(undefined, { numeric: "auto" });
  if (absolute < 60) return formatter.format(seconds, "second");
  if (absolute < 3600) return formatter.format(Math.round(seconds / 60), "minute");
  if (absolute < 86400) return formatter.format(Math.round(seconds / 3600), "hour");
  return formatter.format(Math.round(seconds / 86400), "day");
}

function sortEntriesNewest(a, b) {
  return entryTime(b) - entryTime(a);
}

function sortEntriesOldest(a, b) {
  return entryTime(a) - entryTime(b);
}

function entryTime(entry) {
  const value = entry.visitDate ? `${entry.visitDate}T12:00:00` : entry.completedAt || entry.createdAt || 0;
  const time = new Date(value).getTime();
  return Number.isNaN(time) ? 0 : time;
}

function selectOptions(values, selected) {
  return values.map((value) => `<option value="${escapeHtml(value)}" ${String(selected ?? "") === String(value) ? "selected" : ""}>${value || "Choose"}</option>`).join("");
}

function parseAddOns(value) {
  return String(value || "").split(",").map((item) => item.trim()).filter(Boolean).slice(0, 12);
}

function priceToCents(value) {
  const parsed = Number.parseFloat(String(value || "").replace(/[^0-9.]/g, ""));
  return Number.isFinite(parsed) ? Math.round(parsed * 100) : null;
}

function integerOrNull(value) {
  if (value == null || value === "") return null;
  const number = Number(value);
  return Number.isInteger(number) ? number : null;
}

function numberOrNull(value) {
  if (value == null || value === "") return null;
  const number = Number(value);
  return Number.isFinite(number) ? number : null;
}

function valueOrNull(value) {
  const text = String(value || "").trim();
  return text || null;
}

function todayString() {
  const now = new Date();
  const local = new Date(now.getTime() - now.getTimezoneOffset() * 60000);
  return local.toISOString().slice(0, 10);
}

async function safeJson(response) {
  try { return await response.json(); } catch { return null; }
}

function escapeHtml(value) {
  return String(value ?? "")
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#039;");
}

let toastTimer;
function showToast(message) {
  clearTimeout(toastTimer);
  $("toast").textContent = message;
  $("toast").classList.add("is-visible");
  toastTimer = setTimeout(() => $("toast").classList.remove("is-visible"), 3400);
}

function announce(message) {
  $("liveRegion").textContent = "";
  setTimeout(() => { $("liveRegion").textContent = message; }, 20);
}

// Handle form submissions rendered dynamically inside scrapbook cards.
document.addEventListener("submit", (event) => {
  const form = event.target.closest("[data-edit-form]");
  if (!form) return;
  event.preventDefault();
  submitEditForm(form);
});
