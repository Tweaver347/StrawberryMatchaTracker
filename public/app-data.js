"use strict";

async function loadIdentity() {
  try {
    const response = await fetch("/api/me", { headers: { accept: "application/json" }, cache: "no-store" });
    if (!response.ok) return;
    const data = await response.json();
    if (data.authenticated && data.user) state.user = data.user;
  } catch {
    state.user = null;
  }
}

async function loadRemoteSettings() {
  if (!state.user) return;
  try {
    const response = await fetch("/api/settings", { headers: { accept: "application/json" }, cache: "no-store" });
    if (!response.ok) return;
    const data = await response.json();
    if (!data.settings || typeof data.settings !== "object") return;
    state.settings = normalizeSettings({ ...state.settings, ...data.settings });
    saveLocalSettings();
    applySettings();
  } catch {
    // Local settings remain active.
  }
}

async function loadData() {
  const localEntries = loadLocalArray(STORAGE_KEY);
  const localDrafts = loadLocalArray(DRAFT_KEY);

  if (state.user) {
    try {
      const [mineResponse, draftsResponse, communityResponse] = await Promise.all([
        fetch("/api/entries?scope=mine", { headers: { accept: "application/json" }, cache: "no-store" }),
        fetch("/api/entries?scope=drafts", { headers: { accept: "application/json" }, cache: "no-store" }),
        fetch("/api/entries?scope=community", { headers: { accept: "application/json" }, cache: "no-store" }),
      ]);

      if (!mineResponse.ok || !draftsResponse.ok || !communityResponse.ok) throw new Error("cloud_data_unavailable");
      const [mineData, draftsData, communityData] = await Promise.all([
        mineResponse.json(),
        draftsResponse.json(),
        communityResponse.json(),
      ]);
      state.entries = (mineData.entries || []).map(attachLocalPhotoIfNeeded);
      state.drafts = mergeDrafts((draftsData.entries || []).map(attachLocalPhotoIfNeeded), localDrafts);
      state.communityEntries = communityData.entries || [];
      state.cloudAvailable = true;
    } catch {
      state.entries = localEntries.map(attachLocalPhotoIfNeeded);
      state.drafts = localDrafts.map(attachLocalPhotoIfNeeded);
      state.cloudAvailable = false;
      await loadGuestCommunity();
    }
  } else {
    state.entries = localEntries.map(attachLocalPhotoIfNeeded);
    state.drafts = localDrafts.map(attachLocalPhotoIfNeeded);
    state.cloudAvailable = false;
    await loadGuestCommunity();
  }

  state.entries = state.entries.filter((entry) => entry.status !== "draft");
  state.drafts = state.drafts.filter((entry) => entry.status === "draft" || !isCompleteEntry(entry));
  state.placeGroups = buildPlaceGroups(state.entries);
}

async function loadGuestCommunity() {
  try {
    const response = await fetch("/api/entries?scope=community", { headers: { accept: "application/json" }, cache: "no-store" });
    if (!response.ok) throw new Error();
    const data = await response.json();
    state.communityEntries = data.entries || [];
  } catch {
    state.communityEntries = [];
  }
}

function renderAll() {
  state.placeGroups = buildPlaceGroups(state.entries);
  renderAccount();
  renderHome();
  renderPlaces();
  renderProfile();
  updateSettingsControls();
  if (state.activeView === "map") {
    ensurePersonalMap();
    renderMapMarkers();
  }
}

function renderAccount() {
  if (!state.user) {
    $("accountArea").innerHTML = `<a class="account-button" href="/auth/google"><span class="google-dot" aria-hidden="true">G</span><span>Sign in</span></a>`;
    $("profilePhotoWrap").innerHTML = `<span aria-hidden="true">🍓</span>`;
    $("profileTitle").textContent = "Guest Matcha Fan";
    $("profileSubtitle").textContent = "Sign in to keep your scrapbook, photos, defaults, and settings together across devices.";
    $("profileAccountAction").innerHTML = `<a class="primary-button" href="/auth/google"><span class="google-dot" aria-hidden="true">G</span> Sign in with Google</a>`;
    $("settingsAccountPanel").innerHTML = `<div><strong>Guest browsing</strong><small>Your current memories stay on this device.</small></div><a class="primary-button" href="/auth/google"><span class="google-dot" aria-hidden="true">G</span> Sign in</a>`;
    return;
  }

  const picture = state.user.picture
    ? `<img src="${escapeHtml(state.user.picture)}" alt="" referrerpolicy="no-referrer" />`
    : `<span class="google-dot" aria-hidden="true">${escapeHtml((state.user.name || "M").slice(0, 1).toUpperCase())}</span>`;

  $("accountArea").innerHTML = `<a class="profile-account-pill" href="#profile" data-view-link="profile">${picture}<span class="account-name">${escapeHtml(state.user.name || "Matcha fan")}</span></a>`;
  $("accountArea").querySelector("[data-view-link]")?.addEventListener("click", (event) => {
    event.preventDefault();
    switchView("profile");
  });
  $("profilePhotoWrap").innerHTML = state.user.picture
    ? `<img src="${escapeHtml(state.user.picture)}" alt="${escapeHtml(state.user.name || "User")} profile picture" referrerpolicy="no-referrer" />`
    : `<span aria-hidden="true">🍓</span>`;
  $("profileTitle").textContent = state.user.name || "Matcha Fan";
  $("profileSubtitle").textContent = `${state.user.email || "Signed in"} · your memories and settings sync through your account.`;
  $("profileAccountAction").innerHTML = `<a class="secondary-button" href="/auth/logout">Sign out</a>`;
  $("settingsAccountPanel").innerHTML = `<div><strong>${escapeHtml(state.user.name || "Signed in")}</strong><small>${escapeHtml(state.user.email || "")}</small></div><a class="secondary-button" href="/auth/logout">Sign out</a>`;
}

function switchView(view) {
  if (!document.querySelector(`[data-view-panel="${CSS.escape(view)}"]`)) return;
  state.activeView = view;
  document.querySelectorAll("[data-view-panel]").forEach((panel) => {
    const active = panel.dataset.viewPanel === view;
    panel.hidden = !active;
    panel.classList.toggle("is-active", active);
  });
  document.querySelectorAll("[data-view]").forEach((button) => {
    const active = button.dataset.view === view;
    button.classList.toggle("is-active", active);
    if (active) button.setAttribute("aria-current", "page");
    else button.removeAttribute("aria-current");
  });
  window.scrollTo({ top: 0, behavior: state.settings.reduceMotion ? "auto" : "smooth" });
  if (view === "map") {
    ensurePersonalMap();
    setTimeout(() => {
      state.personalMap?.invalidateSize();
      renderMapMarkers();
    }, 80);
  }
  if (view === "profile") renderProfile();
}
