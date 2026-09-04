"use strict";

function startLogMatcha(existingDraft = null) {
  resetLogState(existingDraft);
  $("captureStartPanel").hidden = false;
  $("captureReviewPanel").hidden = true;
  $("captureDialog").showModal();
  $("cameraInput").click();
}

function resetLogState(existingDraft = null) {
  state.currentDraft = existingDraft ? { ...existingDraft } : null;
  state.selectedPhotoData = existingDraft ? getEntryPhoto(existingDraft) : null;
  state.selectedPhotoGps = existingDraft && hasCoordinates(existingDraft)
    ? { latitude: Number(existingDraft.latitude), longitude: Number(existingDraft.longitude) }
    : null;
  state.selectedPhotoSource = existingDraft ? "draft" : null;
  state.suggestedPlace = null;
  state.selectedPlace = existingDraft?.placeName ? {
    name: existingDraft.placeName,
    address: existingDraft.locationLabel || "",
    latitude: existingDraft.latitude,
    longitude: existingDraft.longitude,
    source: existingDraft.locationSource || "draft",
  } : null;
  state.selectedRating = Number(existingDraft?.rating || 0);
  $("manualPlaceName").value = existingDraft?.placeName || "";
  $("placeSearchInput").value = "";
  $("placeSearchResults").innerHTML = "";
  $("placeManualPanel").hidden = true;
  $("placeSuggestion").hidden = true;
  $("placeDetectCard").hidden = false;
  $("cameraInput").value = "";
  $("libraryInput").value = "";
  updateStrawberryRating();
}

async function handleSelectedPhoto(event, source) {
  const file = event.target.files?.[0];
  event.target.value = "";
  if (!file) return;
  try {
    const [photoData, gps] = await Promise.all([
      compressPhoto(file),
      extractPhotoGps(file),
    ]);
    state.selectedPhotoData = photoData;
    state.selectedPhotoGps = gps;
    state.selectedPhotoSource = source;

    if (!state.currentDraft) {
      state.currentDraft = newDraftBase();
    }
    state.currentDraft.photoData = photoData;
    state.currentDraft.photoUrl = null;
    state.currentDraft.status = "draft";
    state.currentDraft.draftStep = 1;
    state.currentDraft.updatedAt = new Date().toISOString();
    setLocalPhoto(state.currentDraft.id, photoData);
    upsertDraftInState(state.currentDraft);
    saveLocalDrafts();
    queueDraftCloudSave();

    $("capturePhotoPreview").src = photoData;
    $("captureStartPanel").hidden = true;
    $("captureReviewPanel").hidden = false;
  } catch {
    showToast("That photo could not be prepared. Try taking another one.");
  }
}

function closeCaptureDialog() {
  $("captureDialog").close();
  if (state.currentDraft) {
    upsertDraftInState(state.currentDraft);
    saveLocalDrafts();
    queueDraftCloudSave();
  }
}

function useSelectedPhoto() {
  if (!state.selectedPhotoData || !state.currentDraft) return;
  $("captureDialog").close();
  $("logPhotoPreview").src = state.selectedPhotoData;
  $("ratingPhotoPreview").src = state.selectedPhotoData;
  $("logDialog").showModal();
  setLogStep("place");
  detectSuggestedPlace();
}

async function detectSuggestedPlace() {
  $("placeDetectCard").hidden = false;
  $("placeSuggestion").hidden = true;
  $("placeManualPanel").hidden = true;
  $("placeDetectTitle").textContent = "Finding the most likely place…";
  $("placeDetectDetail").textContent = state.selectedPhotoGps ? "Using location saved in the photo" : "Checking your current location";

  let coords = state.selectedPhotoGps;
  let source = coords ? "photo" : "current";
  if (!coords) {
    try {
      coords = await getCurrentPosition();
    } catch {
      coords = null;
    }
  }

  if (!coords) {
    $("placeDetectCard").hidden = true;
    showManualPlacePanel();
    showToast("We could not detect a place. Search or type it instead.");
    return;
  }

  const suggestion = await reverseGeocodePlace(coords.latitude, coords.longitude);
  state.suggestedPlace = {
    name: suggestion.name || "Current location",
    address: suggestion.address || "",
    latitude: coords.latitude,
    longitude: coords.longitude,
    source,
  };

  $("suggestedPlaceName").textContent = state.suggestedPlace.name;
  $("suggestedPlaceAddress").textContent = state.suggestedPlace.address;
  $("placeDetectCard").hidden = true;
  $("placeSuggestion").hidden = false;
}

function useSuggestedPlace() {
  if (!state.suggestedPlace) return;
  confirmSelectedPlace(state.suggestedPlace);
}

function showManualPlacePanel() {
  $("placeDetectCard").hidden = true;
  $("placeSuggestion").hidden = true;
  $("placeManualPanel").hidden = false;
  if (state.suggestedPlace?.name && !$("manualPlaceName").value) {
    $("manualPlaceName").value = state.suggestedPlace.name;
  }
  setTimeout(() => $("manualPlaceName").focus(), 40);
}

async function searchPlaces() {
  const query = $("placeSearchInput").value.trim();
  if (!query) return;
  $("placeSearchResults").innerHTML = `<div class="place-search-result">Searching…</div>`;
  try {
    const params = new URLSearchParams({
      format: "jsonv2",
      q: query,
      limit: "5",
      addressdetails: "1",
      namedetails: "1",
      "accept-language": "en",
    });
    if (state.suggestedPlace?.latitude && state.suggestedPlace?.longitude) {
      const lat = Number(state.suggestedPlace.latitude);
      const lon = Number(state.suggestedPlace.longitude);
      params.set("viewbox", `${lon - 0.12},${lat + 0.12},${lon + 0.12},${lat - 0.12}`);
      params.set("bounded", "0");
    }
    const response = await fetch(`https://nominatim.openstreetmap.org/search?${params.toString()}`, {
      headers: { "accept-language": "en" },
    });
    if (!response.ok) throw new Error();
    const results = await response.json();
    if (!results.length) {
      $("placeSearchResults").innerHTML = `<div class="place-search-result">No places found. Try another name or type the cafe above.</div>`;
      return;
    }
    $("placeSearchResults").innerHTML = results.map((result, index) => `<button class="place-search-result" type="button" data-search-result="${index}"><strong>${escapeHtml(result.namedetails?.name || result.name || String(result.display_name || "").split(",")[0])}</strong><br><span>${escapeHtml(result.display_name || "")}</span></button>`).join("");
    $("placeSearchResults").querySelectorAll("[data-search-result]").forEach((button) => {
      button.addEventListener("click", () => {
        const result = results[Number(button.dataset.searchResult)];
        const name = result.namedetails?.name || result.name || String(result.display_name || "").split(",")[0] || query;
        $("manualPlaceName").value = name;
        state.suggestedPlace = {
          name,
          address: result.display_name || "",
          latitude: Number(result.lat),
          longitude: Number(result.lon),
          source: "search",
        };
        $("placeSearchResults").innerHTML = `<div class="place-search-result"><strong>${escapeHtml(name)}</strong><br>${escapeHtml(result.display_name || "")}</div>`;
      });
    });
  } catch {
    $("placeSearchResults").innerHTML = `<div class="place-search-result">Search is unavailable right now. Type the cafe name and continue.</div>`;
  }
}

function useManualPlace() {
  const name = $("manualPlaceName").value.trim();
  if (!name) {
    showToast("Add the cafe or place name first.");
    $("manualPlaceName").focus();
    return;
  }
  const selected = state.suggestedPlace && normalizePlaceKey(state.suggestedPlace.name) === normalizePlaceKey(name)
    ? state.suggestedPlace
    : {
        name,
        address: "",
        latitude: null,
        longitude: null,
        source: "manual",
      };
  confirmSelectedPlace(selected);
}

function confirmSelectedPlace(place) {
  state.selectedPlace = { ...place };
  if (!state.currentDraft) state.currentDraft = newDraftBase();
  Object.assign(state.currentDraft, {
    placeName: place.name,
    locationLabel: place.address || "",
    latitude: numberOrNull(place.latitude),
    longitude: numberOrNull(place.longitude),
    locationSource: place.source || "manual",
    draftStep: 2,
    updatedAt: new Date().toISOString(),
  });
  upsertDraftInState(state.currentDraft);
  saveLocalDrafts();
  queueDraftCloudSave();
  $("ratingPlaceName").textContent = place.name;
  setLogStep("rating");
}

function togglePlacePinMap() {
  const mapElement = $("placePinMap");
  mapElement.hidden = !mapElement.hidden;
  $("dropPinButton").setAttribute("aria-expanded", String(!mapElement.hidden));
  if (mapElement.hidden) return;
  ensurePlacePinMap();
  setTimeout(() => state.placePinMap?.invalidateSize(), 60);
}

function ensurePlacePinMap() {
  if (state.placePinMap || !window.L) return;
  const latitude = Number(state.suggestedPlace?.latitude) || 35.8;
  const longitude = Number(state.suggestedPlace?.longitude) || -78.65;
  state.placePinMap = L.map("placePinMap").setView([latitude, longitude], state.suggestedPlace?.latitude ? 16 : 10);
  L.tileLayer("https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png", {
    maxZoom: 19,
    attribution: '&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a>',
  }).addTo(state.placePinMap);
  state.placePinMap.on("click", async (event) => {
    const { lat, lng } = event.latlng;
    if (state.placePinMarker) state.placePinMarker.setLatLng([lat, lng]);
    else state.placePinMarker = L.marker([lat, lng]).addTo(state.placePinMap);
    const suggestion = await reverseGeocodePlace(lat, lng);
    state.suggestedPlace = {
      name: suggestion.name || $("manualPlaceName").value.trim() || "Pinned place",
      address: suggestion.address || "",
      latitude: lat,
      longitude: lng,
      source: "pin",
    };
    if (!$("manualPlaceName").value.trim() && suggestion.name) $("manualPlaceName").value = suggestion.name;
    showToast("Pin added. Confirm or edit the place name above.");
  });
}
