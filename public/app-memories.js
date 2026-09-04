"use strict";

function renderHome() {
  const entries = [...state.entries].sort(sortEntriesNewest).slice(0, 15);
  $("recentTrack").innerHTML = entries.map((entry) => memoryCardHtml(entry)).join("");
  $("homeEmptyState").hidden = entries.length > 0;
  $("recentTrack").hidden = entries.length === 0;
  $("swipeHint").hidden = entries.length < 2;
}

function memoryCardHtml(entry, options = {}) {
  const expanded = options.forceExpanded || state.expandedEntryId === entry.id;
  const editing = state.editingEntryId === entry.id;
  const photo = state.editingEntryId === entry.id && state.editPhotoData ? state.editPhotoData : getEntryPhoto(entry);
  const cardClass = expanded ? "memory-card is-expanded" : "memory-card";
  const dateText = formatEntryDate(entry);
  const note = entry.notes ? `<p class="memory-note-preview">“${escapeHtml(entry.notes)}”</p>` : "";
  const badge = entry.shareCommunity ? `<span class="memory-photo-badge">Published</span>` : "";
  const favoriteButton = state.user || entry.ownerName == null
    ? `<button class="memory-favorite-button ${entry.favorite ? "is-favorite" : ""}" type="button" data-action="favorite" data-entry-id="${escapeHtml(entry.id)}" aria-label="${entry.favorite ? "Remove from favorites" : "Save as favorite"}" title="${entry.favorite ? "Remove from favorites" : "Save as favorite"}">${entry.favorite ? "♥" : "♡"}</button>`
    : "";

  return `
    <article class="${cardClass}" data-memory-id="${escapeHtml(entry.id)}">
      <div class="memory-photo" data-action="expand" data-entry-id="${escapeHtml(entry.id)}">
        ${photo ? `<img src="${escapeHtml(photo)}" alt="Strawberry matcha from ${escapeHtml(entry.placeName || "a cafe")}" />` : `<div class="memory-photo-fallback" aria-hidden="true">🍓🍵</div>`}
        ${badge}
        ${favoriteButton}
      </div>
      <button class="memory-card-main" type="button" data-action="expand" data-entry-id="${escapeHtml(entry.id)}" aria-expanded="${expanded}">
        <div class="memory-summary">
          <div class="memory-place-line">
            <div><h3>${escapeHtml(entry.placeName || "Place not chosen")}</h3><span class="memory-date">${escapeHtml(dateText)}</span></div>
            ${renderStrawberryScore(entry.rating)}
          </div>
          ${note}
          <div class="memory-expand-hint"><span>${expanded ? "Close scrapbook details" : "Open scrapbook details"}</span><span class="expand-arrow" aria-hidden="true">⌄</span></div>
        </div>
      </button>
      ${expanded ? `<div class="memory-expanded">${editing ? editEntryHtml(entry) : memoryDetailsHtml(entry)}</div>` : ""}
    </article>`;
}

function memoryDetailsHtml(entry) {
  const drinkItems = [
    entry.drinkSize,
    entry.milkType,
    entry.sweetness,
    ...(entry.addOns || []),
    entry.priceCents != null ? `$${(Number(entry.priceCents) / 100).toFixed(2)}` : null,
  ].filter(Boolean);
  const visitItems = [
    entry.locationLabel,
    entry.visitDate ? formatDate(entry.visitDate) : null,
    entry.waitMinutes != null ? `${entry.waitMinutes} minute wait` : null,
  ].filter(Boolean);
  const thoughts = [
    entry.vibe ? `Vibe ${entry.vibe}/5` : null,
    entry.wouldOrderAgain === true ? "Would order again" : entry.wouldOrderAgain === false ? "Would not order again" : null,
    entry.notes,
  ].filter(Boolean);

  return `
    <div class="memory-section-list">
      ${detailSectionHtml("Drink", drinkItems, "No drink details yet.")}
      ${detailSectionHtml("Visit", visitItems, "No visit details yet.")}
      ${detailSectionHtml("Thoughts", thoughts, "No closing thoughts yet.")}
    </div>
    <div class="memory-actions">
      <button class="secondary-button" type="button" data-action="edit" data-entry-id="${escapeHtml(entry.id)}">✎ Edit this page</button>
      <button class="secondary-button" type="button" data-action="place" data-entry-id="${escapeHtml(entry.id)}">⌖ View place history</button>
      <button class="text-button" type="button" data-action="share" data-entry-id="${escapeHtml(entry.id)}">${entry.shareCommunity ? "Make private" : "Share photo, place & rating"}</button>
    </div>`;
}

function detailSectionHtml(title, values, emptyText) {
  const content = values.length
    ? `<div class="detail-chip-row">${values.map((value) => `<span class="detail-chip">${escapeHtml(value)}</span>`).join("")}</div>`
    : `<span>${escapeHtml(emptyText)}</span>`;
  return `<details class="memory-detail-section"><summary>${escapeHtml(title)}</summary><div class="memory-detail-content">${content}</div></details>`;
}

function editEntryHtml(entry) {
  const rating = state.editRating || entry.rating || 0;
  return `
    <form class="memory-edit-panel" data-edit-form="${escapeHtml(entry.id)}">
      <h4>Update this scrapbook page</h4>
      <div class="edit-grid">
        <label class="field-group edit-wide"><span>Place</span><input class="text-input" name="placeName" maxlength="160" required value="${escapeHtml(entry.placeName || "")}" /></label>
        <div class="field-group edit-wide"><span>Strawberry rating</span><div class="inline-strawberry-edit" role="radiogroup" aria-label="Edit strawberry rating">${[1,2,3,4,5].map((value) => `<button type="button" class="${value <= rating ? "is-on" : ""}" data-action="edit-rating" data-rating="${value}" data-entry-id="${escapeHtml(entry.id)}" aria-label="${value} strawberries">🍓</button>`).join("")}</div></div>
        <label class="field-group"><span>Milk</span><select class="text-input" name="milkType">${selectOptions(["", "Whole milk", "2% milk", "Oat milk", "Almond milk", "Soy milk", "Coconut milk", "Other"], entry.milkType)}</select></label>
        <label class="field-group"><span>Sweetness</span><select class="text-input" name="sweetness">${selectOptions(["", "Unsweetened", "25%", "50%", "75%", "100%", "Extra sweet"], entry.sweetness)}</select></label>
        <label class="field-group"><span>Size</span><select class="text-input" name="drinkSize">${selectOptions(["", "Small", "Medium", "Large", "One size"], entry.drinkSize)}</select></label>
        <label class="field-group"><span>Price</span><input class="text-input" name="price" inputmode="decimal" value="${entry.priceCents != null ? (Number(entry.priceCents) / 100).toFixed(2) : ""}" placeholder="6.50" /></label>
        <label class="field-group"><span>Visit date</span><input class="text-input" name="visitDate" type="date" value="${escapeHtml(entry.visitDate || todayString())}" /></label>
        <label class="field-group"><span>Wait time</span><input class="text-input" name="waitMinutes" type="number" min="0" max="600" value="${entry.waitMinutes ?? ""}" placeholder="minutes" /></label>
        <label class="field-group edit-wide"><span>Add-ons</span><input class="text-input" name="addOns" maxlength="400" value="${escapeHtml((entry.addOns || []).join(", "))}" /></label>
        <label class="field-group"><span>Vibe</span><select class="text-input" name="vibe">${selectOptions(["", "1", "2", "3", "4", "5"], entry.vibe ? String(entry.vibe) : "")}</select></label>
        <label class="field-group"><span>Would order again</span><select class="text-input" name="wouldOrderAgain">${selectOptions(["", "Yes", "No"], entry.wouldOrderAgain === true ? "Yes" : entry.wouldOrderAgain === false ? "No" : "")}</select></label>
        <label class="field-group edit-wide"><span>Thoughts</span><textarea class="text-input" name="notes" maxlength="500">${escapeHtml(entry.notes || "")}</textarea></label>
        <label class="switch-row edit-wide"><span><strong>Publish to community</strong><small>Only photo, place, and strawberry rating become public.</small></span><input name="shareCommunity" type="checkbox" ${entry.shareCommunity ? "checked" : ""} /><span class="switch-control" aria-hidden="true"></span></label>
      </div>
      <div class="memory-actions">
        <button class="secondary-button" type="button" data-action="edit-camera" data-entry-id="${escapeHtml(entry.id)}">📷 Retake photo</button>
        <button class="secondary-button" type="button" data-action="edit-library" data-entry-id="${escapeHtml(entry.id)}">▧ Replace from camera roll</button>
        <button class="primary-button" type="submit">Save changes</button>
        <button class="text-button" type="button" data-action="cancel-edit" data-entry-id="${escapeHtml(entry.id)}">Cancel</button>
      </div>
    </form>`;
}

function renderStrawberryScore(rating) {
  const value = Number(rating || 0);
  return `<div class="strawberry-score" aria-label="${value} out of 5 strawberries">${[1,2,3,4,5].map((index) => `<span aria-hidden="true" style="${index > value ? "filter:grayscale(1);opacity:.25" : ""}">🍓</span>`).join("")}<small>${value || "—"}/5</small></div>`;
}

function handleMemoryAction(event) {
  const actionTarget = event.target.closest("[data-action]");
  if (!actionTarget) return;
  const action = actionTarget.dataset.action;
  const entryId = actionTarget.dataset.entryId;
  const entry = state.entries.find((item) => item.id === entryId);
  if (!entry) return;

  if (action === "expand") {
    state.expandedEntryId = state.expandedEntryId === entryId ? null : entryId;
    if (state.expandedEntryId !== entryId) {
      state.editingEntryId = null;
      state.editPhotoData = null;
    }
    renderHome();
    refreshMemoryDialog(entryId);
    return;
  }

  if (action === "favorite") {
    event.stopPropagation();
    toggleFavorite(entry);
    return;
  }

  if (action === "edit") {
    state.expandedEntryId = entryId;
    state.editingEntryId = entryId;
    state.editRating = entry.rating;
    state.editPhotoData = null;
    renderHome();
    refreshMemoryDialog(entryId);
    return;
  }

  if (action === "cancel-edit") {
    state.editingEntryId = null;
    state.editPhotoData = null;
    renderHome();
    refreshMemoryDialog(entryId);
    return;
  }

  if (action === "edit-rating") {
    event.preventDefault();
    state.editRating = Number(actionTarget.dataset.rating);
    renderHome();
    refreshMemoryDialog(entryId);
    return;
  }

  if (action === "edit-camera") {
    state.editingEntryId = entryId;
    $("editCameraInput").click();
    return;
  }

  if (action === "edit-library") {
    state.editingEntryId = entryId;
    $("editLibraryInput").click();
    return;
  }

  if (action === "share") {
    toggleEntrySharing(entry);
    return;
  }

  if (action === "place") {
    openPlaceDialogByEntry(entry);
  }
}

async function toggleFavorite(entry) {
  const next = !entry.favorite;
  entry.favorite = next;
  renderAll();

  if (state.user && state.cloudAvailable) {
    try {
      const response = await fetch(`/api/entries/${encodeURIComponent(entry.id)}/favorite`, {
        method: "POST",
        headers: { "content-type": "application/json", accept: "application/json" },
        body: JSON.stringify({ favorite: next }),
      });
      if (!response.ok) throw new Error();
    } catch {
      entry.favorite = !next;
      renderAll();
      showToast("That favorite could not sync. Try again.");
      return;
    }
  } else {
    saveLocalEntries();
  }
  showToast(next ? "Saved to favorites." : "Removed from favorites.");
}

async function toggleEntrySharing(entry) {
  const next = !entry.shareCommunity;
  const updated = { ...entry, shareCommunity: next, status: "complete" };
  const saved = await saveCompleteEntry(updated, null, { quiet: true, requireCloud: Boolean(state.user && state.cloudAvailable) });
  if (!saved) return;
  replaceEntry(saved);
  if (next) {
    state.communityEntries = [communityShape(saved), ...state.communityEntries.filter((item) => item.id !== saved.id)];
  } else {
    state.communityEntries = state.communityEntries.filter((item) => item.id !== saved.id);
  }
  renderAll();
  showToast(next ? "Shared photo, place, and rating with the community." : "This matcha is private again.");
}

async function handleEditPhoto(event, source) {
  const file = event.target.files?.[0];
  event.target.value = "";
  if (!file || !state.editingEntryId) return;
  try {
    state.editPhotoData = await compressPhoto(file);
    const entry = state.entries.find((item) => item.id === state.editingEntryId);
    if (entry) {
      showToast(source === "camera" ? "New photo ready. Save changes to keep it." : "Replacement photo ready. Save changes to keep it.");
    }
  } catch {
    showToast("That photo could not be prepared. Try another image.");
  }
}

async function submitEditForm(form) {
  const entryId = form.dataset.editForm;
  const entry = state.entries.find((item) => item.id === entryId);
  if (!entry) return;
  const data = new FormData(form);
  const placeName = String(data.get("placeName") || "").trim();
  if (!placeName) {
    showToast("A place is required for a finished matcha.");
    return;
  }

  const updated = {
    ...entry,
    placeName,
    rating: Number(state.editRating || entry.rating),
    milkType: valueOrNull(data.get("milkType")),
    sweetness: valueOrNull(data.get("sweetness")),
    drinkSize: valueOrNull(data.get("drinkSize")),
    priceCents: priceToCents(data.get("price")),
    visitDate: valueOrNull(data.get("visitDate")),
    waitMinutes: integerOrNull(data.get("waitMinutes")),
    addOns: String(data.get("addOns") || "").split(",").map((item) => item.trim()).filter(Boolean).slice(0, 12),
    vibe: integerOrNull(data.get("vibe")),
    wouldOrderAgain: data.get("wouldOrderAgain") === "Yes" ? true : data.get("wouldOrderAgain") === "No" ? false : null,
    notes: String(data.get("notes") || "").trim(),
    shareCommunity: data.get("shareCommunity") === "on",
    status: "complete",
  };

  const submitButton = form.querySelector('button[type="submit"]');
  submitButton.disabled = true;
  submitButton.textContent = "Saving…";
  const saved = await saveCompleteEntry(updated, state.editPhotoData, { quiet: true });
  submitButton.disabled = false;
  submitButton.textContent = "Save changes";
  if (!saved) return;

  replaceEntry(saved);
  state.editingEntryId = null;
  state.editPhotoData = null;
  renderAll();
  refreshMemoryDialog(saved.id);
  showToast("Scrapbook page updated.");
}

function refreshMemoryDialog(entryId) {
  if (!$("memoryDialog").open) return;
  const entry = state.entries.find((item) => item.id === entryId);
  if (!entry) return;
  $("memoryDialogContent").innerHTML = memoryCardHtml(entry, { forceExpanded: true });
}
