"use strict";

(function installQuickWins() {
  const css = document.createElement("link");
  css.rel = "stylesheet";
  css.href = "/quick-wins.css";
  document.head.appendChild(css);

  state.quickWins = {
    query: "",
    rating: "all",
    milk: "all",
    privacy: "all",
    period: "all",
    manageSelection: new Set(),
  };

  addBonusAchievements();
  injectHomeTools();
  injectManagementDialog();
  bindQuickWinEvents();

  const originalRenderHome = renderHome;
  renderHome = function renderHomeWithQuickWins() {
    originalRenderHome();
    renderFilteredHome();
    refreshFilterOptions();
    scheduleMemoryEnhancement();
  };

  const originalRenderProfile = renderProfile;
  renderProfile = function renderProfileWithQuickWins() {
    originalRenderProfile();
    renderRecaps();
    renderArchive();
    scheduleMemoryEnhancement();
  };

  const observer = new MutationObserver(() => scheduleMemoryEnhancement());
  observer.observe(document.body, { childList: true, subtree: true });
})();

function addBonusAchievements() {
  if (ACHIEVEMENT_DEFINITIONS.some((item) => item.id === "rating-rainbow")) return;
  const active = () => state.entries.filter((entry) => !isQuickWinArchived(entry));
  const countWith = (predicate) => active().filter(predicate).length;
  const distinct = (selector) => new Set(active().map(selector).filter(Boolean).map((value) => String(value).toLowerCase())).size;
  const repeatPlaces = () => buildPlaceGroups(active()).filter((place) => place.visits >= 2).length;

  ACHIEVEMENT_DEFINITIONS.push(
    { id: "rating-rainbow", name: "Rating Rainbow", icon: "🌈", description: "Use every strawberry rating from 1 through 5.", difficulty: "Medium", metric: () => new Set(active().map((entry) => Number(entry.rating))).size, target: 5, progress: () => `${Math.min(new Set(active().map((entry) => Number(entry.rating))).size, 5)} / 5 ratings` },
    { id: "milk-flight", name: "Milk Flight", icon: "🥛", description: "Try four different milk choices.", difficulty: "Medium", metric: () => distinct((entry) => entry.milkType), target: 4, progress: () => `${Math.min(distinct((entry) => entry.milkType), 4)} / 4 milks` },
    { id: "sweetness-scientist", name: "Sweetness Scientist", icon: "🧪", description: "Log four different sweetness levels.", difficulty: "Medium", metric: () => distinct((entry) => entry.sweetness), target: 4, progress: () => `${Math.min(distinct((entry) => entry.sweetness), 4)} / 4 levels` },
    { id: "price-scout", name: "Price Scout", icon: "🏷️", description: "Record the price on 10 matchas.", difficulty: "Easy", metric: () => countWith((entry) => entry.priceCents != null), target: 10, progress: () => `${Math.min(countWith((entry) => entry.priceCents != null), 10)} / 10 prices` },
    { id: "critics-notebook", name: "Critic's Notebook", icon: "✍️", description: "Write notes on 10 matchas.", difficulty: "Easy", metric: () => countWith((entry) => Boolean(entry.notes)), target: 10, progress: () => `${Math.min(countWith((entry) => Boolean(entry.notes)), 10)} / 10 notes` },
    { id: "cafe-circuit", name: "Cafe Circuit", icon: "🔁", description: "Return to five different cafes at least twice.", difficulty: "Hard", metric: () => repeatPlaces(), target: 5, progress: () => `${Math.min(repeatPlaces(), 5)} / 5 repeat cafes` },
    { id: "map-maker-plus", name: "Pin Collector", icon: "📌", description: "Log 20 matchas with a map location.", difficulty: "Medium", metric: () => countWith(hasCoordinates), target: 20, progress: () => `${Math.min(countWith(hasCoordinates), 20)} / 20 pinned` },
    { id: "return-ticket", name: "Return Ticket", icon: "🎫", description: "Say you would order again on 20 matchas.", difficulty: "Hard", metric: () => countWith((entry) => entry.wouldOrderAgain === true), target: 20, progress: () => `${Math.min(countWith((entry) => entry.wouldOrderAgain === true), 20)} / 20 yes` },
    { id: "public-five", name: "Share a Favorite", icon: "💌", description: "Publish a 5-strawberry matcha.", difficulty: "Easy", metric: () => countWith((entry) => entry.shareCommunity && Number(entry.rating) === 5), target: 1, progress: () => `${Math.min(countWith((entry) => entry.shareCommunity && Number(entry.rating) === 5), 1)} / 1 shared favorite` },
    { id: "detailed-decade", name: "Detailed Decade", icon: "📒", description: "Complete all optional details on 10 entries.", difficulty: "Hard", metric: () => countWith(hasFullDetails), target: 10, progress: () => `${Math.min(countWith(hasFullDetails), 10)} / 10 full pages` },
  );
}

function injectHomeTools() {
  if ($("memoryTools")) return;
  const track = $("recentTrack");
  const tools = document.createElement("div");
  tools.id = "memoryTools";
  tools.className = "memory-tools";
  tools.innerHTML = `
    <label class="search-field"><span aria-hidden="true">⌕</span><input id="memorySearch" type="search" placeholder="Search cafe, notes, milk, add-ons…" aria-label="Search matcha memories" /></label>
    <select id="memoryRatingFilter" aria-label="Filter by strawberry rating"><option value="all">All ratings</option><option value="5">5 strawberries</option><option value="4">4+ strawberries</option><option value="3">3+ strawberries</option><option value="2">2+ strawberries</option><option value="1">1+ strawberries</option></select>
    <select id="memoryMilkFilter" aria-label="Filter by milk"><option value="all">All milks</option></select>
    <select id="memoryPrivacyFilter" aria-label="Filter by privacy"><option value="all">Private + published</option><option value="private">Private</option><option value="published">Published</option><option value="favorite">Favorites</option></select>
    <select id="memoryPeriodFilter" aria-label="Filter by date"><option value="all">All time</option><option value="30">Last 30 days</option><option value="year">This year</option></select>
    <button class="secondary-button" type="button" id="manageMemoriesButton">Manage</button>
    <span class="filter-count" id="memoryFilterCount"></span>`;
  track.parentNode.insertBefore(tools, track);
  const empty = document.createElement("div");
  empty.id = "filterEmptyState";
  empty.className = "quickwin-empty";
  empty.hidden = true;
  empty.textContent = "No scrapbook memories match those filters.";
  track.parentNode.insertBefore(empty, $("homeEmptyState"));
}

function refreshFilterOptions() {
  const select = $("memoryMilkFilter");
  if (!select) return;
  const current = state.quickWins.milk;
  const milks = [...new Set(state.entries.filter((entry) => !isQuickWinArchived(entry)).map((entry) => entry.milkType).filter(Boolean))].sort();
  select.innerHTML = `<option value="all">All milks</option>${milks.map((milk) => `<option value="${escapeHtml(milk)}">${escapeHtml(milk)}</option>`).join("")}`;
  select.value = milks.includes(current) ? current : "all";
  state.quickWins.milk = select.value;
}

function filteredActiveEntries() {
  const filters = state.quickWins;
  const now = new Date();
  const thirtyDaysAgo = Date.now() - 30 * 86400000;
  return state.entries.filter((entry) => {
    if (isQuickWinArchived(entry)) return false;
    const haystack = [entry.placeName, entry.locationLabel, entry.notes, entry.milkType, entry.sweetness, entry.drinkSize, ...(entry.addOns || [])].filter(Boolean).join(" ").toLowerCase();
    if (filters.query && !haystack.includes(filters.query.toLowerCase())) return false;
    if (filters.rating !== "all" && Number(entry.rating) < Number(filters.rating)) return false;
    if (filters.milk !== "all" && entry.milkType !== filters.milk) return false;
    if (filters.privacy === "private" && entry.shareCommunity) return false;
    if (filters.privacy === "published" && !entry.shareCommunity) return false;
    if (filters.privacy === "favorite" && !entry.favorite) return false;
    const time = entryTime(entry);
    if (filters.period === "30" && time < thirtyDaysAgo) return false;
    if (filters.period === "year" && new Date(time).getFullYear() !== now.getFullYear()) return false;
    return true;
  }).sort(sortEntriesNewest);
}

function renderFilteredHome() {
  if (!$("recentTrack")) return;
  const filtered = filteredActiveEntries();
  $("recentTrack").innerHTML = filtered.slice(0, 30).map((entry) => memoryCardHtml(entry)).join("");
  $("recentTrack").hidden = filtered.length === 0;
  $("filterEmptyState").hidden = filtered.length > 0 || state.entries.filter((entry) => !isQuickWinArchived(entry)).length === 0;
  $("homeEmptyState").hidden = state.entries.filter((entry) => !isQuickWinArchived(entry)).length > 0;
  $("swipeHint").hidden = filtered.length < 2;
  $("memoryFilterCount").textContent = `${filtered.length} ${filtered.length === 1 ? "memory" : "memories"}`;
}

function bindQuickWinEvents() {
  document.addEventListener("input", (event) => {
    if (event.target.id === "memorySearch") {
      state.quickWins.query = event.target.value.trim();
      renderHome();
    }
  });
  document.addEventListener("change", (event) => {
    if (event.target.id === "memoryRatingFilter") state.quickWins.rating = event.target.value;
    else if (event.target.id === "memoryMilkFilter") state.quickWins.milk = event.target.value;
    else if (event.target.id === "memoryPrivacyFilter") state.quickWins.privacy = event.target.value;
    else if (event.target.id === "memoryPeriodFilter") state.quickWins.period = event.target.value;
    else return;
    renderHome();
  });

  document.addEventListener("click", async (event) => {
    const shareCard = event.target.closest(".share-card-button");
    if (shareCard) return shareEntryCard(shareCard.dataset.entryId);
    const archive = event.target.closest(".archive-card-button");
    if (archive) return archiveEntryQuickWin(archive.dataset.entryId);
    const remove = event.target.closest(".delete-card-button");
    if (remove) return deleteEntryQuickWin(remove.dataset.entryId);
    if (event.target.closest("#manageMemoriesButton")) return openManageDialog();
    if (event.target.closest("#closeManageDialog")) return $("manageDialog").close();
    const recap = event.target.closest("[data-share-recap]");
    if (recap) return shareRecap(recap.dataset.shareRecap);
    const restore = event.target.closest("[data-restore-entry]");
    if (restore) return restoreArchivedEntry(restore.dataset.restoreEntry);
    const archiveDelete = event.target.closest("[data-delete-archived]");
    if (archiveDelete) return deleteEntryQuickWin(archiveDelete.dataset.deleteArchived);
    const manageAction = event.target.closest("[data-manage-action]");
    if (manageAction) return runManageAction(manageAction.dataset.manageAction);
    if (event.target.closest("#manageSelectAll")) return toggleManageAll(event.target.checked);
  });

  document.addEventListener("change", (event) => {
    if (event.target.matches("[data-manage-select]")) {
      if (event.target.checked) state.quickWins.manageSelection.add(event.target.dataset.manageSelect);
      else state.quickWins.manageSelection.delete(event.target.dataset.manageSelect);
      updateManageSelectionLabel();
    }
    if (event.target.id === "manageSelectAll") toggleManageAll(event.target.checked);
  });
}

let enhanceFrame = null;
function scheduleMemoryEnhancement() {
  if (enhanceFrame) return;
  enhanceFrame = requestAnimationFrame(() => {
    enhanceFrame = null;
    document.querySelectorAll(".memory-actions").forEach((actions) => {
      const card = actions.closest("[data-memory-id]");
      const entryId = card?.dataset.memoryId;
      if (!entryId || actions.querySelector(".share-card-button")) return;
      actions.insertAdjacentHTML("beforeend", `<button class="secondary-button share-card-button" type="button" data-entry-id="${escapeHtml(entryId)}">↗ Share card</button><button class="text-button archive-card-button" type="button" data-entry-id="${escapeHtml(entryId)}">Archive</button><button class="text-button danger-text delete-card-button" type="button" data-entry-id="${escapeHtml(entryId)}">Delete</button>`);
    });
  });
}

function archiveKey(id) { return `archived-${String(id).toLowerCase()}`; }
function isQuickWinArchived(entry) { return Boolean(state.settings.earnedAchievements?.[archiveKey(entry.id)]); }

async function archiveEntryQuickWin(entryId) {
  const entry = state.entries.find((item) => item.id === entryId);
  if (!entry) return;
  if (entry.shareCommunity) {
    const saved = await saveCompleteEntry({ ...entry, shareCommunity: false }, null, { quiet: true, requireCloud: Boolean(state.user && state.cloudAvailable) });
    if (!saved) return;
    replaceEntry(saved);
  }
  state.settings.earnedAchievements ||= {};
  state.settings.earnedAchievements[archiveKey(entryId)] = new Date().toISOString();
  persistSettings();
  state.expandedEntryId = null;
  renderAll();
  showToast("Memory archived. You can restore it from Profile.");
}

function restoreArchivedEntry(entryId) {
  if (state.settings.earnedAchievements) delete state.settings.earnedAchievements[archiveKey(entryId)];
  persistSettings();
  renderAll();
  showToast("Memory restored to your scrapbook.");
}

async function deleteEntryQuickWin(entryId) {
  const entry = state.entries.find((item) => item.id === entryId);
  if (!entry || !window.confirm(`Delete the ${entry.placeName || "matcha"} memory permanently?`)) return;
  if (state.user && state.cloudAvailable && !entry.syncPending) {
    try {
      const response = await fetch(`/api/entries/${encodeURIComponent(entry.id)}`, { method: "DELETE" });
      if (!response.ok) throw new Error();
    } catch {
      showToast("That memory could not be deleted from the cloud. Nothing changed.");
      return;
    }
  }
  state.entries = state.entries.filter((item) => item.id !== entryId);
  if (state.settings.earnedAchievements) delete state.settings.earnedAchievements[archiveKey(entryId)];
  removeLocalPhoto(entryId);
  saveLocalEntries();
  persistSettings();
  if ($("memoryDialog")?.open) $("memoryDialog").close();
  renderAll();
  showToast("Memory deleted.");
}

function renderArchive() {
  const archived = state.entries.filter(isQuickWinArchived).sort(sortEntriesNewest);
  let section = $("archiveSection");
  if (!section) {
    section = document.createElement("section");
    section.id = "archiveSection";
    section.className = "archive-section";
    const published = document.querySelector(".published-section");
    published?.parentNode.insertBefore(section, published);
  }
  section.innerHTML = `<div class="section-heading"><div><span class="hand-label">memories tucked away</span><h2>Archive</h2></div><span class="filter-count">${archived.length}</span></div><div class="archive-list">${archived.length ? archived.map((entry) => { const photo=getEntryPhoto(entry); return `<article class="archive-row"><div class="archive-thumb">${photo?`<img src="${escapeHtml(photo)}" alt="" />`:"🍓"}</div><div><strong>${escapeHtml(entry.placeName || "Matcha memory")}</strong><small>${escapeHtml(formatEntryDate(entry))} · ${Number(entry.rating||0)}/5 strawberries</small></div><div class="archive-actions"><button class="secondary-button" type="button" data-restore-entry="${escapeHtml(entry.id)}">Restore</button><button class="text-button danger-text" type="button" data-delete-archived="${escapeHtml(entry.id)}">Delete</button></div></article>`; }).join("") : `<div class="empty-inline">Archived memories will stay out of Home, Places, Map, stats, and recaps until you restore them.</div>`}</div>`;
}

function injectManagementDialog() {
  if ($("manageDialog")) return;
  const dialog = document.createElement("dialog");
  dialog.id = "manageDialog";
  dialog.className = "app-dialog manage-dialog";
  dialog.innerHTML = `<div class="dialog-paper manage-paper"><button class="dialog-close" type="button" id="closeManageDialog" aria-label="Close manage memories">×</button><span class="hand-label">tidy the scrapbook</span><h2>Manage Matchas</h2><p>Select several memories to change privacy, archive them, or delete them.</p><label class="switch-row"><span><strong>Select all shown</strong><small id="manageSelectionLabel">0 selected</small></span><input id="manageSelectAll" type="checkbox"/><span class="switch-control" aria-hidden="true"></span></label><div class="manage-list" id="manageList"></div><div class="manage-actions"><button class="secondary-button" type="button" data-manage-action="private">Make private</button><button class="secondary-button" type="button" data-manage-action="publish">Publish</button><button class="secondary-button" type="button" data-manage-action="archive">Archive</button><button class="text-button danger-text" type="button" data-manage-action="delete">Delete</button></div></div>`;
  document.body.appendChild(dialog);
}

function openManageDialog() {
  state.quickWins.manageSelection.clear();
  $("manageSelectAll").checked = false;
  renderManageList();
  $("manageDialog").showModal();
}

function renderManageList() {
  const entries = filteredActiveEntries();
  $("manageList").innerHTML = entries.length ? entries.map((entry) => { const photo=getEntryPhoto(entry); return `<label class="manage-row"><input type="checkbox" data-manage-select="${escapeHtml(entry.id)}"/><span>${photo?`<img src="${escapeHtml(photo)}" alt=""/>`:"🍓"}</span><span><strong>${escapeHtml(entry.placeName || "Matcha")}</strong><small>${escapeHtml(formatEntryDate(entry))} · ${Number(entry.rating||0)}/5 · ${entry.shareCommunity?"published":"private"}</small></span><small>${entry.favorite?"♥ favorite":""}</small></label>`; }).join("") : `<div class="quickwin-empty">No memories match the current filters.</div>`;
  updateManageSelectionLabel();
}

function toggleManageAll(checked) {
  const boxes = [...document.querySelectorAll("[data-manage-select]")];
  boxes.forEach((box) => { box.checked = checked; if (checked) state.quickWins.manageSelection.add(box.dataset.manageSelect); else state.quickWins.manageSelection.delete(box.dataset.manageSelect); });
  updateManageSelectionLabel();
}

function updateManageSelectionLabel() { if ($("manageSelectionLabel")) $("manageSelectionLabel").textContent = `${state.quickWins.manageSelection.size} selected`; }

async function runManageAction(action) {
  const ids = [...state.quickWins.manageSelection];
  if (!ids.length) return showToast("Select at least one memory first.");
  if (action === "delete" && !window.confirm(`Delete ${ids.length} selected ${ids.length===1?"memory":"memories"} permanently?`)) return;
  for (const id of ids) {
    const entry = state.entries.find((item) => item.id === id);
    if (!entry) continue;
    if (action === "archive") {
      if (entry.shareCommunity) {
        const saved = await saveCompleteEntry({ ...entry, shareCommunity: false }, null, { quiet: true, requireCloud: Boolean(state.user && state.cloudAvailable) });
        if (saved) replaceEntry(saved);
      }
      state.settings.earnedAchievements ||= {};
      state.settings.earnedAchievements[archiveKey(id)] = new Date().toISOString();
    } else if (action === "private" || action === "publish") {
      const shouldShare = action === "publish";
      if (entry.shareCommunity !== shouldShare) {
        const saved = await saveCompleteEntry({ ...entry, shareCommunity: shouldShare }, null, { quiet: true, requireCloud: Boolean(state.user && state.cloudAvailable) });
        if (saved) replaceEntry(saved);
      }
    } else if (action === "delete") {
      if (state.user && state.cloudAvailable && !entry.syncPending) {
        try { const response=await fetch(`/api/entries/${encodeURIComponent(id)}`,{method:"DELETE"}); if(!response.ok) throw new Error(); } catch { showToast(`Could not delete ${entry.placeName || "one memory"}.`); continue; }
      }
      state.entries = state.entries.filter((item) => item.id !== id);
      removeLocalPhoto(id);
      if (state.settings.earnedAchievements) delete state.settings.earnedAchievements[archiveKey(id)];
    }
  }
  saveLocalEntries();
  persistSettings();
  state.quickWins.manageSelection.clear();
  $("manageDialog").close();
  renderAll();
  showToast(`Bulk ${action} complete.`);
}

function renderRecaps() {
  let section = $("recapSection");
  if (!section) {
    section = document.createElement("section");
    section.id = "recapSection";
    section.className = "recap-section";
    const achievements = document.querySelector(".achievement-section");
    achievements?.parentNode.insertBefore(section, achievements);
  }
  const month = recapForPeriod("month");
  const year = recapForPeriod("year");
  section.innerHTML = `<div class="section-heading"><div><span class="hand-label">the story in numbers</span><h2>Scrapbook Recaps</h2></div></div><div class="recap-grid">${recapCardHtml(month,"month")}${recapCardHtml(year,"year")}</div>`;
}

function recapForPeriod(period) {
  const now = new Date();
  const entries = state.entries.filter((entry) => !isQuickWinArchived(entry)).filter((entry) => {
    const date = new Date(entry.visitDate ? `${entry.visitDate}T12:00:00` : entry.createdAt);
    if (Number.isNaN(date.getTime())) return false;
    if (period === "month") return date.getFullYear() === now.getFullYear() && date.getMonth() === now.getMonth();
    return date.getFullYear() === now.getFullYear();
  });
  const groups = buildPlaceGroups(entries);
  const average = entries.length ? entries.reduce((sum,e)=>sum+Number(e.rating||0),0)/entries.length : 0;
  const topPlace = groups.sort((a,b)=>b.average-a.average||b.visits-a.visits)[0]?.name || "—";
  const milkCounts = new Map(); entries.forEach((e)=>{ if(e.milkType) milkCounts.set(e.milkType,(milkCounts.get(e.milkType)||0)+1); });
  const topMilk = [...milkCounts.entries()].sort((a,b)=>b[1]-a[1])[0]?.[0] || "—";
  const spend = entries.reduce((sum,e)=>sum+Number(e.priceCents||0),0)/100;
  return { period, label: period === "month" ? new Intl.DateTimeFormat(undefined,{month:"long",year:"numeric"}).format(now) : String(now.getFullYear()), total:entries.length, average, places:new Set(entries.map((e)=>normalizePlaceKey(e.placeName)).filter(Boolean)).size, topPlace, topMilk, spend, five:entries.filter((e)=>Number(e.rating)===5).length };
}

function recapCardHtml(recap, key) {
  return `<article class="recap-card"><span class="hand-label">${key==="month"?"this month":"this year"}</span><h3>${escapeHtml(recap.label)}</h3><div class="recap-stats"><div class="recap-stat"><strong>${recap.total}</strong><small>matchas</small></div><div class="recap-stat"><strong>${recap.total?recap.average.toFixed(1):"—"}</strong><small>average rating</small></div><div class="recap-stat"><strong>${recap.places}</strong><small>places</small></div><div class="recap-stat"><strong>${recap.five}</strong><small>five-strawberry finds</small></div></div><p><strong>Top place:</strong> ${escapeHtml(recap.topPlace)}<br><strong>Top milk:</strong> ${escapeHtml(recap.topMilk)}${recap.spend?`<br><strong>Tracked spend:</strong> $${recap.spend.toFixed(2)}`:""}</p><button class="secondary-button" type="button" data-share-recap="${key}" ${recap.total?"":"disabled"}>↗ Share recap</button></article>`;
}

async function shareEntryCard(entryId) {
  const entry = state.entries.find((item) => item.id === entryId);
  if (!entry) return;
  try {
    const canvas = document.createElement("canvas"); canvas.width=1080; canvas.height=1350; const ctx=canvas.getContext("2d");
    drawCardBackground(ctx,1080,1350);
    const photo = await loadShareImage(getEntryPhoto(entry));
    if (photo) drawCoverImage(ctx,photo,90,110,900,760,42); else { ctx.font="120px sans-serif"; ctx.textAlign="center"; ctx.fillText("🍓🍵",540,470); }
    ctx.textAlign="left"; ctx.fillStyle="#7f2443"; ctx.font="900 66px Nunito, sans-serif"; drawWrappedText(ctx,entry.placeName||"Strawberry Matcha",90,960,900,78,2);
    ctx.fillStyle="#cd4169"; ctx.font="700 48px Nunito, sans-serif"; ctx.fillText(`${"🍓".repeat(Number(entry.rating||0))}  ${Number(entry.rating||0)}/5`,90,1125);
    ctx.fillStyle="#6e5059"; ctx.font="600 34px Nunito, sans-serif"; ctx.fillText(formatEntryDate(entry),90,1200);
    ctx.fillStyle="#789969"; ctx.font="700 28px Nunito, sans-serif"; ctx.fillText("Strawberry Matcha Scrapbook",90,1270);
    await shareCanvasFile(canvas,`matcha-${slugify(entry.placeName||"memory")}.png`,`${entry.placeName || "Strawberry matcha"} · ${entry.rating}/5 strawberries`);
  } catch { showToast("The share card could not be created from that photo."); }
}

async function shareRecap(period) {
  const recap = recapForPeriod(period);
  if (!recap.total) return;
  const canvas=document.createElement("canvas"); canvas.width=1080; canvas.height=1350; const ctx=canvas.getContext("2d"); drawCardBackground(ctx,1080,1350);
  ctx.textAlign="center"; ctx.fillStyle="#cd4169"; ctx.font="700 44px Nunito, sans-serif"; ctx.fillText("🍓 MY MATCHA RECAP 🍵",540,145);
  ctx.fillStyle="#7f2443"; ctx.font="900 78px Nunito, sans-serif"; ctx.fillText(recap.label,540,250);
  const stats=[[recap.total,"matchas"],[recap.total?recap.average.toFixed(1):"—","average"],[recap.places,"places"],[recap.five,"five-star finds"]];
  stats.forEach(([value,label],i)=>{const x=150+(i%2)*480,y=390+Math.floor(i/2)*230;ctx.fillStyle="#ffe5ed";roundRect(ctx,x,y,300,170,34);ctx.fill();ctx.fillStyle="#a92f54";ctx.font="900 64px Nunito, sans-serif";ctx.fillText(String(value),x+150,y+76);ctx.fillStyle="#6e5059";ctx.font="700 28px Nunito, sans-serif";ctx.fillText(label,x+150,y+125);});
  ctx.fillStyle="#4b3039";ctx.font="800 36px Nunito, sans-serif";ctx.fillText(`Top place: ${recap.topPlace}`,540,905);ctx.fillText(`Top milk: ${recap.topMilk}`,540,970);if(recap.spend)ctx.fillText(`Tracked spend: $${recap.spend.toFixed(2)}`,540,1035);
  ctx.fillStyle="#789969";ctx.font="700 32px Nunito, sans-serif";ctx.fillText("Strawberry Matcha Scrapbook",540,1210);
  await shareCanvasFile(canvas,`matcha-recap-${period}.png`,`My ${recap.label} strawberry matcha recap`);
}

function drawCardBackground(ctx,w,h){ctx.fillStyle="#fff1f5";ctx.fillRect(0,0,w,h);ctx.fillStyle="#fffdf7";roundRect(ctx,48,48,w-96,h-96,58);ctx.fill();ctx.strokeStyle="#f8a5bb";ctx.lineWidth=4;ctx.stroke();}
function roundRect(ctx,x,y,w,h,r){ctx.beginPath();ctx.roundRect(x,y,w,h,r);}
function drawCoverImage(ctx,img,x,y,w,h,r){ctx.save();roundRect(ctx,x,y,w,h,r);ctx.clip();const s=Math.max(w/img.width,h/img.height),sw=w/s,sh=h/s,sx=(img.width-sw)/2,sy=(img.height-sh)/2;ctx.drawImage(img,sx,sy,sw,sh,x,y,w,h);ctx.restore();}
function drawWrappedText(ctx,text,x,y,maxWidth,lineHeight,maxLines){const words=String(text).split(/\s+/);let line="",lines=[];for(const word of words){const test=line?`${line} ${word}`:word;if(ctx.measureText(test).width>maxWidth&&line){lines.push(line);line=word;if(lines.length===maxLines-1)break;}else line=test;}if(line&&lines.length<maxLines)lines.push(line);lines.forEach((l,i)=>ctx.fillText(l,x,y+i*lineHeight));}
function loadShareImage(src){return new Promise((resolve)=>{if(!src)return resolve(null);const img=new Image();img.onload=()=>resolve(img);img.onerror=()=>resolve(null);img.src=src;});}
async function shareCanvasFile(canvas,filename,title){const blob=await new Promise((resolve)=>canvas.toBlob(resolve,"image/png"));if(!blob)throw new Error();const file=new File([blob],filename,{type:"image/png"});if(navigator.share&&navigator.canShare?.({files:[file]})){await navigator.share({title,text:title,files:[file]});return;}const url=URL.createObjectURL(blob);const link=document.createElement("a");link.href=url;link.download=filename;link.click();setTimeout(()=>URL.revokeObjectURL(url),1500);showToast("Share card saved as an image.");}
function slugify(value){return String(value||"matcha").toLowerCase().replace(/[^a-z0-9]+/g,"-").replace(/^-|-$/g,"").slice(0,60)||"matcha";}
