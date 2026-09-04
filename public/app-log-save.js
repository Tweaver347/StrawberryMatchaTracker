"use strict";

function setLogStep(step) {
  const place = step === "place";
  $("placeStep").hidden = !place;
  $("ratingStep").hidden = place;
  $("placeStep").classList.toggle("is-active", place);
  $("ratingStep").classList.toggle("is-active", !place);
  $("logProgressFill").style.width = place ? "50%" : "100%";
  if (!place) {
    $("ratingPlaceName").textContent = state.selectedPlace?.name || state.currentDraft?.placeName || "Your place";
    updateStrawberryRating();
  }
}

function buildStrawberryRating() {
  $("strawberryRating").innerHTML = [1,2,3,4,5].map((value) => `<button type="button" role="radio" aria-checked="false" data-strawberry-rating="${value}" title="${value}/5 — ${RATING_WORDS[value - 1]}" aria-label="${value} out of 5: ${RATING_WORDS[value - 1]}">🍓</button>`).join("");
  $("strawberryRating").querySelectorAll("[data-strawberry-rating]").forEach((button) => {
    button.addEventListener("click", () => {
      state.selectedRating = Number(button.dataset.strawberryRating);
      if (state.currentDraft) {
        state.currentDraft.rating = state.selectedRating;
        state.currentDraft.draftStep = 2;
        state.currentDraft.updatedAt = new Date().toISOString();
        upsertDraftInState(state.currentDraft);
        saveLocalDrafts();
        queueDraftCloudSave();
      }
      updateStrawberryRating();
    });
  });
}

function updateStrawberryRating() {
  $("strawberryRating").querySelectorAll("[data-strawberry-rating]").forEach((button) => {
    const value = Number(button.dataset.strawberryRating);
    const active = value <= state.selectedRating;
    button.classList.toggle("is-on", active);
    button.setAttribute("aria-checked", String(value === state.selectedRating));
  });
  $("ratingWord").textContent = state.selectedRating ? `${state.selectedRating}/5 — ${RATING_WORDS[state.selectedRating - 1]}` : "Tap a strawberry";
  $("logMatchaSubmitButton").disabled = !(state.selectedPhotoData && state.selectedPlace?.name && state.selectedRating);
}

async function completeMatchaLog() {
  if (!state.currentDraft || !state.selectedPhotoData || !state.selectedPlace?.name || !state.selectedRating) {
    showToast("A photo, place, and strawberry rating are required.");
    return;
  }

  const button = $("logMatchaSubmitButton");
  button.disabled = true;
  button.textContent = "Logging…";

  const entry = {
    ...state.currentDraft,
    id: state.currentDraft.id || crypto.randomUUID(),
    status: "complete",
    draftStep: 3,
    placeName: state.selectedPlace.name,
    locationLabel: state.selectedPlace.address || "",
    latitude: numberOrNull(state.selectedPlace.latitude),
    longitude: numberOrNull(state.selectedPlace.longitude),
    locationSource: state.selectedPlace.source || "manual",
    rating: state.selectedRating,
    vibe: state.currentDraft.vibe ?? null,
    priceCents: state.currentDraft.priceCents ?? null,
    drinkSize: state.currentDraft.drinkSize || state.settings.defaultSize || null,
    milkType: state.currentDraft.milkType || state.settings.defaultMilk || null,
    sweetness: state.currentDraft.sweetness || state.settings.defaultSweetness || null,
    visitDate: state.currentDraft.visitDate || todayString(),
    waitMinutes: state.currentDraft.waitMinutes ?? null,
    addOns: Array.isArray(state.currentDraft.addOns) && state.currentDraft.addOns.length
      ? state.currentDraft.addOns
      : parseAddOns(state.settings.defaultAddOns),
    notes: state.currentDraft.notes || "",
    wouldOrderAgain: typeof state.currentDraft.wouldOrderAgain === "boolean" ? state.currentDraft.wouldOrderAgain : null,
    shareCommunity: false,
    favorite: Boolean(state.currentDraft.favorite),
    createdAt: state.currentDraft.createdAt || new Date().toISOString(),
    completedAt: new Date().toISOString(),
    updatedAt: new Date().toISOString(),
  };

  const photoData = state.selectedPhotoData.startsWith("data:image/") ? state.selectedPhotoData : null;
  const saved = await saveCompleteEntry(entry, photoData, { quiet: true });
  button.disabled = false;
  button.textContent = "Log Matcha";
  if (!saved) return;

  removeDraftById(entry.id);
  replaceEntry(saved);
  state.lastSavedEntryId = saved.id;
  $("logDialog").close();
  $("successSummary").textContent = saved.syncPending
    ? `${saved.placeName} · ${saved.rating}/5 strawberries. Saved on this device while cloud sync is unavailable.`
    : `${saved.placeName} · ${saved.rating}/5 strawberries. It is private until you choose to share it.`;
  $("successDialog").showModal();
  renderAll();
  announce("Matcha logged successfully.");
}

async function saveCompleteEntry(entry, photoData, options = {}) {
  if (state.user && state.cloudAvailable) {
    try {
      const response = await fetch("/api/entries", {
        method: "POST",
        headers: { "content-type": "application/json", accept: "application/json" },
        body: JSON.stringify({ ...entry, photoData: photoData || undefined, status: "complete" }),
      });
      if (!response.ok) {
        const detail = await safeJson(response);
        throw new Error(detail?.error || `save_${response.status}`);
      }
      const data = await response.json();
      const saved = { ...attachLocalPhotoIfNeeded(data.entry), favorite: Boolean(entry.favorite), syncPending: false };
      if (photoData) setLocalPhoto(saved.id, photoData);
      return saved;
    } catch (error) {
      if (options.requireCloud) {
        showToast("That change needs a cloud connection. Nothing was published.");
        return null;
      }
      showToast("Cloud sync was unavailable. This matcha is safely stored on this device.");
    }
  }

  const local = { ...entry, photoData: photoData || entry.photoData || getEntryPhoto(entry), photoUrl: null, status: "complete", syncPending: Boolean(state.user) };
  if (local.photoData?.startsWith("data:image/")) setLocalPhoto(local.id, local.photoData);
  replaceEntry(local, false);
  saveLocalEntries();
  return local;
}

function saveDraftAndClose() {
  if (state.currentDraft) {
    state.currentDraft.updatedAt = new Date().toISOString();
    upsertDraftInState(state.currentDraft);
    saveLocalDrafts();
    queueDraftCloudSave(true);
  }
  $("logDialog").close();
  showToast("Draft saved quietly in Profile.");
  renderProfile();
}

function closeSuccessAndShowEntry(edit) {
  const entryId = state.lastSavedEntryId;
  $("successDialog").close();
  switchView("home");
  state.expandedEntryId = entryId;
  state.editingEntryId = edit ? entryId : null;
  state.editRating = state.entries.find((entry) => entry.id === entryId)?.rating || null;
  renderHome();
  setTimeout(() => {
    document.querySelector(`[data-memory-id="${CSS.escape(entryId)}"]`)?.scrollIntoView({ behavior: state.settings.reduceMotion ? "auto" : "smooth", block: "center", inline: "center" });
  }, 60);
}

function closeSuccessDialog() {
  $("successDialog").close();
  switchView("home");
}

function newDraftBase() {
  return {
    id: crypto.randomUUID(),
    status: "draft",
    draftStep: 1,
    placeName: null,
    locationLabel: "",
    latitude: null,
    longitude: null,
    locationSource: null,
    rating: null,
    vibe: null,
    priceCents: null,
    drinkSize: state.settings.defaultSize || null,
    milkType: state.settings.defaultMilk || null,
    sweetness: state.settings.defaultSweetness || null,
    visitDate: todayString(),
    waitMinutes: null,
    addOns: parseAddOns(state.settings.defaultAddOns),
    notes: "",
    wouldOrderAgain: null,
    shareCommunity: false,
    favorite: false,
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString(),
  };
}

function upsertDraftInState(draft) {
  const index = state.drafts.findIndex((item) => item.id === draft.id);
  const normalized = { ...draft, status: "draft" };
  if (index === -1) state.drafts.unshift(normalized);
  else state.drafts[index] = normalized;
}

function removeDraftById(id) {
  state.drafts = state.drafts.filter((draft) => draft.id !== id);
  saveLocalDrafts();
}

function queueDraftCloudSave(immediate = false) {
  clearTimeout(state.draftSyncTimer);
  if (!state.currentDraft || !state.user || !state.cloudAvailable) return;
  if (immediate) {
    saveDraftToCloud(state.currentDraft);
    return;
  }
  state.draftSyncTimer = setTimeout(() => saveDraftToCloud(state.currentDraft), 600);
}

async function saveDraftToCloud(draft) {
  if (!draft || !state.user || !state.cloudAvailable) return;
  try {
    const photo = getEntryPhoto(draft);
    const photoData = photo?.startsWith("data:image/") ? photo : undefined;
    const response = await fetch("/api/entries", {
      method: "POST",
      headers: { "content-type": "application/json", accept: "application/json" },
      body: JSON.stringify({ ...draft, photoData, status: "draft" }),
    });
    if (!response.ok) throw new Error();
    const data = await response.json();
    const saved = attachLocalPhotoIfNeeded(data.entry);
    upsertDraftInState(saved);
    saveLocalDrafts();
  } catch {
    // The local draft remains available and can sync during a later edit.
  }
}
