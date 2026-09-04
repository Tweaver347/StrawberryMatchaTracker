"use strict";

function continueDraft(draft) {
  state.currentDraft = { ...draft };
  state.selectedPhotoData = getEntryPhoto(draft);
  state.selectedPhotoGps = hasCoordinates(draft) ? { latitude: Number(draft.latitude), longitude: Number(draft.longitude) } : null;
  state.selectedPhotoSource = "draft";
  state.suggestedPlace = draft.placeName ? {
    name: draft.placeName,
    address: draft.locationLabel || "",
    latitude: draft.latitude,
    longitude: draft.longitude,
    source: draft.locationSource || "draft",
  } : null;
  state.selectedPlace = draft.placeName ? { ...state.suggestedPlace } : null;
  state.selectedRating = Number(draft.rating || 0);

  if (!state.selectedPhotoData) {
    startLogMatcha(draft);
    return;
  }

  $("logPhotoPreview").src = state.selectedPhotoData;
  $("ratingPhotoPreview").src = state.selectedPhotoData;
  $("logDialog").showModal();
  if (state.selectedPlace) {
    $("suggestedPlaceName").textContent = state.selectedPlace.name;
    $("suggestedPlaceAddress").textContent = state.selectedPlace.address || "";
    $("placeDetectCard").hidden = true;
    $("placeSuggestion").hidden = false;
  }
  if (state.selectedPlace && !state.selectedRating) setLogStep("rating");
  else if (state.selectedPlace && state.selectedRating) setLogStep("rating");
  else {
    setLogStep("place");
    detectSuggestedPlace();
  }
  updateStrawberryRating();
}

async function deleteDraft(draft) {
  if (!window.confirm("Delete this unfinished matcha draft?")) return;
  if (state.user && state.cloudAvailable) {
    try {
      const response = await fetch(`/api/entries/${encodeURIComponent(draft.id)}`, { method: "DELETE" });
      if (!response.ok) throw new Error();
    } catch {
      showToast("That draft could not be deleted from the cloud.");
      return;
    }
  }
  state.drafts = state.drafts.filter((item) => item.id !== draft.id);
  removeLocalPhoto(draft.id);
  saveLocalDrafts();
  renderProfile();
  showToast("Draft deleted.");
}

function renderPublished() {
  const published = state.entries.filter((entry) => entry.shareCommunity).sort(sortEntriesNewest);
  $("publishedGrid").innerHTML = published.map((entry) => {
    const photo = getEntryPhoto(entry);
    return `<button class="published-tile" type="button" data-published-id="${escapeHtml(entry.id)}" data-rating="${Number(entry.rating || 0)}" aria-label="Open ${escapeHtml(entry.placeName)} matcha memory">${photo ? `<img src="${escapeHtml(photo)}" alt="Strawberry matcha from ${escapeHtml(entry.placeName)}" />` : `<span class="memory-photo-fallback" aria-hidden="true">🍓🍵</span>`}</button>`;
  }).join("");
  $("publishedEmpty").hidden = published.length > 0;
}

function handlePublishedClick(event) {
  const tile = event.target.closest("[data-published-id]");
  if (!tile) return;
  openMemoryDialog(tile.dataset.publishedId);
}

function openMemoryDialog(entryId) {
  const entry = state.entries.find((item) => item.id === entryId);
  if (!entry) return;
  state.expandedEntryId = entryId;
  $("memoryDialogContent").innerHTML = memoryCardHtml(entry, { forceExpanded: true });
  $("memoryDialog").showModal();
}
