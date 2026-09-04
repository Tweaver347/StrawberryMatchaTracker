const STORAGE_KEY = "smt.entries.v1";
const PHOTO_KEY = "smt.photos.v1";
const SETTINGS_KEY = "smt.settings.v1";
const TOUR_KEY = "smt.tour.complete.v2";

const DEFAULT_SETTINGS = {
  theme: "system",
  textSize: "normal",
  highContrast: false,
  reduceMotion: window.matchMedia?.("(prefers-reduced-motion: reduce)")?.matches || false,
  readableFont: false,
  largeTargets: false,
  reduceClutter: false,
};

const state = {
  user: null,
  cloudAvailable: false,
  entries: [],
  communityEntries: [],
  filter: "all",
  activeView: "collection",
  entryStep: 1,
  photoData: null,
  photoSource: null,
  communityMap: null,
  communityMarkers: [],
  userLocationMarker: null,
  pinMap: null,
  pinMarker: null,
  tourIndex: 0,
  settings: loadSettings(),
};

const starLabels = ["Skip it", "Okay", "Good", "Great", "Obsessed"];
const vibeLabels = ["Not the vibe", "Cozy enough", "Cute", "Love it", "Perfect energy"];
const vibeIcons = ["☁", "◡", "✦", "♡", "🍓"];

const entrySteps = [
  {
    label: "Step 1 of 3",
    title: "Snap it & save the spot",
    help: "Take a fresh photo or choose one you already have.",
  },
  {
    label: "Step 2 of 3",
    title: "Give it a quick rating",
    help: "Rate the drink and the cafe vibe. This is enough for a quick log.",
  },
  {
    label: "Step 3 of 3",
    title: "Add the details you care about",
    help: "Everything on this step is optional.",
  },
];

const tourSteps = [
  {
    icon: "🍓",
    title: "Welcome to your matcha diary",
    body: "Keep every strawberry matcha, cafe, rating, and memory in one cheerful place.",
  },
  {
    icon: "📷",
    title: "Take a photo right here",
    body: "On your phone, tap Take a photo to open the rear camera. You can also choose an existing picture from your camera roll.",
  },
  {
    icon: "⚡",
    title: "Log the important part first",
    body: "The new three-step flow starts with the photo and cafe, then the two ratings. You can quick-save there and skip every optional detail.",
  },
  {
    icon: "♡",
    title: "Build your profile and map",
    body: "Your profile shows your stats and the matchas you publish. Published entries with a location also appear on the community map.",
  },
  {
    icon: "◐",
    title: "Make the app comfortable",
    body: "Open Settings for dark mode, larger text, stronger contrast, reduced motion, easier-to-read type, larger controls, and a simpler layout.",
  },
];

const systemThemeQuery = window.matchMedia?.("(prefers-color-scheme: dark)");
const $ = (id) => document.getElementById(id);

init();

async function init() {
  applySettings();
  buildRatings();
  bindEvents();
  $("visitDate").value = todayString();
  await loadIdentity();
  await loadEntries();
  renderAll();
  maybeOpenFirstLaunchTour();
}

function bindEvents() {
  document.querySelectorAll("[data-view]").forEach((button) => {
    button.addEventListener("click", () => switchView(button.dataset.view));
  });

  document.querySelectorAll("[data-filter]").forEach((button) => {
    button.addEventListener("click", () => {
      state.filter = button.dataset.filter;
      document.querySelectorAll("[data-filter]").forEach((chip) => {
        const active = chip === button;
        chip.classList.toggle("is-active", active);
        chip.setAttribute("aria-pressed", String(active));
      });
      renderEntries();
    });
  });

  ["addMatchaButton", "emptyAddButton", "mobileAddButton", "profileAddButton"].forEach((id) => {
    $(id)?.addEventListener("click", openEntryDialog);
  });

  $("closeEntryDialog").addEventListener("click", closeEntryDialog);
  $("entryDialog").addEventListener("cancel", (event) => {
    event.preventDefault();
    closeEntryDialog();
  });
  $("entryForm").addEventListener("submit", handleEntryFormSubmit);
  $("entryBackButton").addEventListener("click", () => setEntryStep(state.entryStep - 1));
  $("entryNextButton").addEventListener("click", nextEntryStep);
  $("entryQuickSaveButton").addEventListener("click", submitEntry);

  $("takePhotoButton").addEventListener("click", () => $("cameraInput").click());
  $("choosePhotoButton").addEventListener("click", () => $("libraryInput").click());
  $("cameraInput").addEventListener("change", (event) => handlePhoto(event, "camera"));
  $("libraryInput").addEventListener("change", (event) => handlePhoto(event, "library"));
  $("removePhotoButton").addEventListener("click", removePhoto);

  $("currentLocationButton").addEventListener("click", () => useCurrentLocation("current"));
  $("useLocationHeroButton").addEventListener("click", async () => {
    switchView("map");
    await centerCommunityMapOnUser();
  });
  $("mapLocateButton").addEventListener("click", centerCommunityMapOnUser);

  $("searchLocationButton").addEventListener("click", () => {
    const panel = $("locationSearchPanel");
    panel.hidden = !panel.hidden;
    $("searchLocationButton").setAttribute("aria-expanded", String(!panel.hidden));
    if (!panel.hidden) $("locationSearchInput").focus();
  });
  $("runLocationSearch").addEventListener("click", searchLocation);
  $("locationSearchInput").addEventListener("keydown", (event) => {
    if (event.key === "Enter") {
      event.preventDefault();
      searchLocation();
    }
  });
  $("togglePinMapButton").addEventListener("click", togglePinMap);

  $("tourButton").addEventListener("click", () => openTour(false));
  $("restartTourButton").addEventListener("click", () => {
    localStorage.removeItem(TOUR_KEY);
    openTour(true);
  });
  $("closeTour").addEventListener("click", () => completeTour(false));
  $("tourSkip").addEventListener("click", () => completeTour(false));
  $("tourBack").addEventListener("click", () => setTourStep(state.tourIndex - 1));
  $("tourNext").addEventListener("click", () => {
    if (state.tourIndex === tourSteps.length - 1) {
      completeTour(true);
      return;
    }
    setTourStep(state.tourIndex + 1);
  });
  $("tourDialog").addEventListener("cancel", (event) => {
    event.preventDefault();
    completeTour(false);
  });

  document.querySelectorAll("[data-theme-option]").forEach((button) => {
    button.addEventListener("click", () => updateSetting("theme", button.dataset.themeOption));
  });
  document.querySelectorAll("[data-text-size-option]").forEach((button) => {
    button.addEventListener("click", () => updateSetting("textSize", button.dataset.textSizeOption));
  });

  const settingBindings = [
    ["highContrastSetting", "highContrast"],
    ["reduceMotionSetting", "reduceMotion"],
    ["readableFontSetting", "readableFont"],
    ["largeTargetsSetting", "largeTargets"],
    ["reduceClutterSetting", "reduceClutter"],
  ];
  settingBindings.forEach(([id, key]) => {
    $(id).addEventListener("change", (event) => updateSetting(key, event.target.checked));
  });
  $("resetSettingsButton").addEventListener("click", resetSettings);

  if (systemThemeQuery?.addEventListener) {
    systemThemeQuery.addEventListener("change", () => {
      if (state.settings.theme === "system") applySettings();
    });
  } else if (systemThemeQuery?.addListener) {
    systemThemeQuery.addListener(() => {
      if (state.settings.theme === "system") applySettings();
    });
  }
}

function loadSettings() {
  try {
    const stored = JSON.parse(localStorage.getItem(SETTINGS_KEY) || "{}");
    const settings = { ...DEFAULT_SETTINGS, ...stored };
    if (!["system", "light", "dark"].includes(settings.theme)) settings.theme = "system";
    if (!["normal", "large", "xlarge"].includes(settings.textSize)) settings.textSize = "normal";
    return settings;
  } catch {
    return { ...DEFAULT_SETTINGS };
  }
}

function saveSettings() {
  try {
    localStorage.setItem(SETTINGS_KEY, JSON.stringify(state.settings));
  } catch {
    // Display settings still apply for the current visit if storage is unavailable.
  }
}

function updateSetting(key, value) {
  state.settings[key] = value;
  saveSettings();
  applySettings();
  showToast("Display settings updated.");
}

function resetSettings() {
  state.settings = { ...DEFAULT_SETTINGS };
  saveSettings();
  applySettings();
  showToast("Display settings reset.");
}

function applySettings() {
  const root = document.documentElement;
  const resolvedTheme = state.settings.theme === "system"
    ? (systemThemeQuery?.matches ? "dark" : "light")
    : state.settings.theme;

  root.dataset.theme = resolvedTheme;
  root.dataset.themePreference = state.settings.theme;
  root.dataset.textSize = state.settings.textSize;
  root.classList.toggle("high-contrast", Boolean(state.settings.highContrast));
  root.classList.toggle("reduce-motion", Boolean(state.settings.reduceMotion));
  root.classList.toggle("readable-font", Boolean(state.settings.readableFont));
  root.classList.toggle("large-targets", Boolean(state.settings.largeTargets));
  root.classList.toggle("reduce-clutter", Boolean(state.settings.reduceClutter));

  const themeMeta = document.querySelector('meta[name="theme-color"]');
  if (themeMeta) themeMeta.content = resolvedTheme === "dark" ? "#25151e" : "#f45f86";

  renderSettingsControls();
}

function renderSettingsControls() {
  document.querySelectorAll("[data-theme-option]").forEach((button) => {
    const active = button.dataset.themeOption === state.settings.theme;
    button.classList.toggle("is-active", active);
    button.setAttribute("aria-pressed", String(active));
  });
  document.querySelectorAll("[data-text-size-option]").forEach((button) => {
    const active = button.dataset.textSizeOption === state.settings.textSize;
    button.classList.toggle("is-active", active);
    button.setAttribute("aria-pressed", String(active));
  });

  const checkboxValues = {
    highContrastSetting: state.settings.highContrast,
    reduceMotionSetting: state.settings.reduceMotion,
    readableFontSetting: state.settings.readableFont,
    largeTargetsSetting: state.settings.largeTargets,
    reduceClutterSetting: state.settings.reduceClutter,
  };
  Object.entries(checkboxValues).forEach(([id, value]) => {
    if ($(id)) $(id).checked = Boolean(value);
  });
}

async function loadIdentity() {
  try {
    const response = await fetch("/api/me", {
      headers: { accept: "application/json" },
      cache: "no-store",
    });
    if (response.ok) {
      const data = await response.json();
      if (data.authenticated) state.user = data.user;
    }
  } catch {
    state.user = null;
  }
  renderAccount();
}

async function loadEntries() {
  state.cloudAvailable = false;

  if (state.user) {
    try {
      const response = await fetch("/api/entries?scope=mine", {
        headers: { accept: "application/json" },
        cache: "no-store",
      });
      if (response.ok) {
        const data = await response.json();
        state.entries = Array.isArray(data.entries) ? data.entries : [];
        state.cloudAvailable = true;
      } else {
        state.entries = loadLocalEntries();
      }
    } catch {
      state.entries = loadLocalEntries();
    }
  } else {
    state.entries = loadLocalEntries();
  }

  try {
    const response = await fetch("/api/entries?scope=community", {
      headers: { accept: "application/json" },
      cache: "no-store",
    });
    if (response.ok) {
      const data = await response.json();
      state.communityEntries = Array.isArray(data.entries) ? data.entries : [];
    } else {
      state.communityEntries = state.entries.filter((entry) => entry.shareCommunity);
    }
  } catch {
    state.communityEntries = state.entries.filter((entry) => entry.shareCommunity);
  }
}

function renderAccount() {
  if (!state.user) {
    $("accountArea").innerHTML = `
      <a class="google-button" href="/auth/google">
        <span class="google-g" aria-hidden="true">G</span>
        <span>Continue with Google</span>
      </a>`;
    return;
  }

  const picture = state.user.picture
    ? `<img src="${escapeHtml(state.user.picture)}" alt="" referrerpolicy="no-referrer" />`
    : `<span class="account-initial">${escapeHtml((state.user.name || "U").slice(0, 1).toUpperCase())}</span>`;

  $("accountArea").innerHTML = `
    <div class="profile-pill">
      <button class="profile-main" type="button" data-open-profile aria-label="Open profile">
        ${picture}
        <span class="profile-copy">
          <strong>${escapeHtml(state.user.name || "Matcha fan")}</strong>
          <small>${escapeHtml(state.user.email || "")}</small>
        </span>
      </button>
      <a class="logout-link" href="/auth/logout">Sign out</a>
    </div>`;

  $("accountArea").querySelector("[data-open-profile]")?.addEventListener("click", () => switchView("profile"));
}

function renderAll() {
  renderStats();
  renderEntries();
  renderProfile();
  renderCommunityList();
  renderSettingsAccount();
}

function getStats(entries = state.entries) {
  const total = entries.length;
  const favorites = entries.filter((entry) => entry.favorite).length;
  const published = entries.filter((entry) => entry.shareCommunity).length;
  const average = total
    ? entries.reduce((sum, entry) => sum + Number(entry.rating || 0), 0) / total
    : null;
  const orderAgainPercent = total
    ? Math.round((entries.filter((entry) => entry.wouldOrderAgain).length / total) * 100)
    : null;
  return { total, favorites, published, average, orderAgainPercent };
}

function renderStats() {
  const stats = getStats();
  $("loggedCount").textContent = String(stats.total);
  $("favoriteCount").textContent = String(stats.favorites);
  $("averageRating").textContent = stats.average == null ? "—" : stats.average.toFixed(1);
  $("orderAgainPercent").textContent = stats.orderAgainPercent == null ? "—" : `${stats.orderAgainPercent}%`;
}

function renderProfile() {
  const stats = getStats();
  $("profileLoggedCount").textContent = String(stats.total);
  $("profileFavoriteCount").textContent = String(stats.favorites);
  $("profilePublishedCount").textContent = String(stats.published);
  $("profileAverageRating").textContent = stats.average == null ? "—" : stats.average.toFixed(1);

  if (state.user) {
    const avatar = state.user.picture
      ? `<img src="${escapeHtml(state.user.picture)}" alt="${escapeHtml(state.user.name || "User")} profile picture" referrerpolicy="no-referrer" />`
      : `<span>${escapeHtml((state.user.name || "U").slice(0, 1).toUpperCase())}</span>`;
    $("profileAvatarLarge").innerHTML = avatar;
    $("profileAvatarLarge").removeAttribute("aria-hidden");
    $("profileIdentity").innerHTML = `
      <span class="eyebrow">Your profile</span>
      <h2 id="profileViewTitle">${escapeHtml(state.user.name || "Matcha fan")}</h2>
      <p>${escapeHtml(state.user.email || "")} · ${stats.published} published ${stats.published === 1 ? "matcha" : "matchas"}</p>`;
    $("profileHeroActions").innerHTML = `
      <button class="soft-button" type="button" id="profileSettingsShortcut">Account settings</button>
      <a class="text-button" href="/auth/logout">Sign out</a>`;
    $("profileSettingsShortcut")?.addEventListener("click", () => switchView("settings"));
  } else {
    $("profileAvatarLarge").innerHTML = "🍓";
    $("profileAvatarLarge").setAttribute("aria-hidden", "true");
    $("profileIdentity").innerHTML = `
      <span class="eyebrow">Your profile</span>
      <h2 id="profileViewTitle">Guest matcha fan</h2>
      <p>Your current collection stays on this device. Sign in to connect future cloud syncing.</p>`;
    $("profileHeroActions").innerHTML = `
      <a class="primary-button" href="/auth/google"><span class="google-g" aria-hidden="true">G</span> Sign in with Google</a>`;
  }

  const publishedEntries = [...state.entries]
    .filter((entry) => entry.shareCommunity)
    .sort(sortNewestFirst);
  $("profilePublishedGrid").innerHTML = publishedEntries.map(entryCard).join("");
  $("profilePublishedEmpty").hidden = publishedEntries.length > 0;
  bindFavoriteButtons($("profilePublishedGrid"));
}

function renderSettingsAccount() {
  if (state.user) {
    $("settingsAccountCopy").textContent = `Signed in as ${state.user.email || state.user.name || "your Google account"}.`;
    $("settingsAccountActions").innerHTML = `<a class="soft-button" href="/auth/logout">Sign out</a>`;
  } else {
    $("settingsAccountCopy").textContent = "Browse as a guest or sign in with Google.";
    $("settingsAccountActions").innerHTML = `<a class="primary-button" href="/auth/google"><span class="google-g" aria-hidden="true">G</span> Sign in with Google</a>`;
  }
}

function renderEntries() {
  let entries = [...state.entries].sort(sortNewestFirst);
  if (state.filter === "favorites") entries = entries.filter((entry) => entry.favorite);
  if (state.filter === "shared") entries = entries.filter((entry) => entry.shareCommunity);

  $("entryGrid").innerHTML = entries.map(entryCard).join("");
  $("emptyState").hidden = entries.length > 0;
  bindFavoriteButtons($("entryGrid"));
}

function sortNewestFirst(a, b) {
  return new Date(b.visitDate || b.createdAt || 0) - new Date(a.visitDate || a.createdAt || 0);
}

function entryCard(entry) {
  const photo = entry.photoUrl || entry.photoData || getPhoto(entry.id);
  const chips = [entry.drinkSize, entry.milkType, entry.sweetness, ...(entry.addOns || [])].filter(Boolean);
  const location = entry.locationLabel || (hasCoordinates(entry)
    ? `${Number(entry.latitude).toFixed(4)}, ${Number(entry.longitude).toFixed(4)}`
    : "Location not saved");
  const date = formatDate(entry.visitDate || entry.createdAt);

  return `
    <article class="entry-card">
      <div class="entry-photo">
        ${photo
          ? `<img src="${escapeHtml(photo)}" alt="Strawberry matcha from ${escapeHtml(entry.placeName)}" loading="lazy" />`
          : `<div class="entry-photo-fallback" aria-hidden="true">🍓🍵</div>`}
        ${entry.shareCommunity ? `<span class="shared-badge">Published</span>` : ""}
        <button class="favorite-button ${entry.favorite ? "is-favorite" : ""}" type="button"
          data-favorite-id="${escapeHtml(entry.id)}"
          title="${entry.favorite ? "Remove from favorites" : "Save as favorite"}"
          aria-label="${entry.favorite ? "Remove from favorites" : "Save as favorite"}">
          ${entry.favorite ? "♥" : "♡"}
        </button>
      </div>
      <div class="entry-content">
        <div class="entry-title-row">
          <div>
            <h3>${escapeHtml(entry.placeName)}</h3>
            <div class="entry-location">${escapeHtml(location)}</div>
          </div>
          ${entry.priceCents != null ? `<span class="entry-price">$${(Number(entry.priceCents) / 100).toFixed(2)}</span>` : ""}
        </div>
        <div class="entry-ratings">
          <span class="rating-pill" title="Matcha rating">★ ${entry.rating}/5</span>
          <span class="rating-pill vibe" title="Vibe check">${vibeIcons[Math.max(0, Number(entry.vibe) - 1)] || "✦"} Vibe ${entry.vibe}/5</span>
          ${entry.wouldOrderAgain ? `<span class="rating-pill again" title="Would order again">↻ Again</span>` : ""}
        </div>
        ${chips.length ? `<div class="entry-meta">${chips.map((chip) => `<span class="meta-chip">${escapeHtml(chip)}</span>`).join("")}</div>` : ""}
        ${entry.notes ? `<p class="entry-notes">${escapeHtml(entry.notes)}</p>` : ""}
        ${date ? `<div class="entry-date">${escapeHtml(date)}</div>` : ""}
      </div>
    </article>`;
}

function bindFavoriteButtons(container) {
  container?.querySelectorAll("[data-favorite-id]").forEach((button) => {
    button.addEventListener("click", () => toggleFavorite(button.dataset.favoriteId));
  });
}

async function toggleFavorite(id) {
  const entry = state.entries.find((item) => item.id === id);
  if (!entry) return;

  const nextValue = !entry.favorite;
  entry.favorite = nextValue;

  const communityCopy = state.communityEntries.find((item) => item.id === id);
  if (communityCopy) communityCopy.favorite = nextValue;

  if (state.user && state.cloudAvailable) {
    try {
      const response = await fetch(`/api/entries/${encodeURIComponent(id)}/favorite`, {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ favorite: nextValue }),
      });
      if (!response.ok) throw new Error("Favorite request failed");
    } catch {
      entry.favorite = !nextValue;
      if (communityCopy) communityCopy.favorite = !nextValue;
      showToast("Couldn’t update that favorite. Try again.");
    }
  } else {
    saveLocalEntries();
  }

  renderAll();
}

function buildRatings() {
  $("starRating").innerHTML = starLabels.map((label, index) => `
    <button class="star-button" type="button" role="radio" aria-checked="false"
      data-rating="${index + 1}" title="${index + 1}/5 — ${label}"
      aria-label="${index + 1} out of 5: ${label}">
      <svg viewBox="0 0 24 24" aria-hidden="true">
        <path stroke-linejoin="round" stroke-linecap="round" d="M12 2.7l2.83 5.73 6.32.92-4.57 4.45 1.08 6.29L12 17.12l-5.66 2.97 1.08-6.29-4.57-4.45 6.32-.92L12 2.7z"/>
      </svg>
    </button>`).join("");

  $("vibeRating").innerHTML = vibeLabels.map((label, index) => `
    <button class="vibe-button" type="button" role="radio" aria-checked="false"
      data-vibe="${index + 1}" title="${index + 1}/5 — ${label}"
      aria-label="${index + 1} out of 5: ${label}">${vibeIcons[index]}</button>`).join("");

  $("starRating").querySelectorAll("button").forEach((button) => {
    button.addEventListener("click", () => setStarRating(Number(button.dataset.rating)));
    button.addEventListener("keydown", (event) => handleRatingKeydown(event, "star"));
  });
  $("vibeRating").querySelectorAll("button").forEach((button) => {
    button.addEventListener("click", () => setVibeRating(Number(button.dataset.vibe)));
    button.addEventListener("keydown", (event) => handleRatingKeydown(event, "vibe"));
  });
}

function handleRatingKeydown(event, type) {
  if (!["ArrowLeft", "ArrowRight", "ArrowUp", "ArrowDown", "Home", "End"].includes(event.key)) return;
  event.preventDefault();

  const current = type === "star"
    ? Number($("ratingValue").value || 1)
    : Number($("vibeValue").value || 1);
  let next = current;
  if (["ArrowRight", "ArrowUp"].includes(event.key)) next = Math.min(5, current + 1);
  if (["ArrowLeft", "ArrowDown"].includes(event.key)) next = Math.max(1, current - 1);
  if (event.key === "Home") next = 1;
  if (event.key === "End") next = 5;

  if (type === "star") {
    setStarRating(next);
    $("starRating").querySelector(`[data-rating="${next}"]`)?.focus();
  } else {
    setVibeRating(next);
    $("vibeRating").querySelector(`[data-vibe="${next}"]`)?.focus();
  }
}

function setStarRating(value) {
  $("ratingValue").value = value ? String(value) : "";
  $("starRatingLabel").textContent = value ? `${value}/5 — ${starLabels[value - 1]}` : "Tap a star";
  $("starRating").querySelectorAll("button").forEach((button) => {
    const rating = Number(button.dataset.rating);
    button.classList.toggle("is-on", rating <= value);
    button.setAttribute("aria-checked", String(rating === value));
    button.tabIndex = rating === value || (!value && rating === 1) ? 0 : -1;
  });
}

function setVibeRating(value) {
  $("vibeValue").value = value ? String(value) : "";
  $("vibeRatingLabel").textContent = value ? `${value}/5 — ${vibeLabels[value - 1]}` : "Tap the vibe";
  $("vibeRating").querySelectorAll("button").forEach((button) => {
    const vibe = Number(button.dataset.vibe);
    button.classList.toggle("is-on", vibe === value);
    button.setAttribute("aria-checked", String(vibe === value));
    button.tabIndex = vibe === value || (!value && vibe === 1) ? 0 : -1;
  });
}

function openEntryDialog() {
  resetEntryForm();
  setEntryStep(1, false);
  $("entryDialog").showModal();
  setTimeout(() => $("takePhotoButton")?.focus(), 40);
}

function closeEntryDialog() {
  if ($("entryDialog").open) $("entryDialog").close();
  resetEntryForm();
}

function resetEntryForm() {
  $("entryForm").reset();
  $("visitDate").value = todayString();
  removePhoto(false);
  $("photoStatus").textContent = "";
  $("photoStatus").className = "photo-status";
  $("locationSearchPanel").hidden = true;
  $("searchLocationButton").setAttribute("aria-expanded", "false");
  $("locationSearchResults").innerHTML = "";
  $("pinMap").hidden = true;
  $("togglePinMapButton").setAttribute("aria-expanded", "false");
  $("locationSourceBadge").textContent = "No location yet";
  $("locationSourceBadge").className = "location-source-badge";
  $("placeName").setCustomValidity("");
  state.photoData = null;
  state.photoSource = null;
  setStarRating(0);
  setVibeRating(0);
  if (state.pinMarker && state.pinMap) {
    state.pinMap.removeLayer(state.pinMarker);
    state.pinMarker = null;
  }
}

function setEntryStep(step, moveFocus = true) {
  state.entryStep = Math.max(1, Math.min(entrySteps.length, step));
  const stepInfo = entrySteps[state.entryStep - 1];

  document.querySelectorAll("[data-entry-step]").forEach((section) => {
    const active = Number(section.dataset.entryStep) === state.entryStep;
    section.hidden = !active;
    section.classList.toggle("is-active", active);
  });

  $("entryStepLabel").textContent = stepInfo.label;
  $("entryDialogTitle").textContent = stepInfo.title;
  $("entryStepHelp").textContent = stepInfo.help;
  $("entryProgressBar").style.width = `${(state.entryStep / entrySteps.length) * 100}%`;

  $("entryBackButton").hidden = state.entryStep === 1;
  $("entryQuickSaveButton").hidden = state.entryStep !== 2;
  $("entryNextButton").hidden = state.entryStep === 3;
  $("saveEntryButton").hidden = state.entryStep !== 3;

  if (state.entryStep === 1) {
    $("entryNextButton").textContent = "Next: rate it";
    $("saveNote").textContent = "Start with the photo and cafe. Everything else can wait.";
  } else if (state.entryStep === 2) {
    $("entryNextButton").textContent = "Add optional details";
    $("saveNote").textContent = "You can save as soon as both ratings are selected.";
  } else {
    $("saveNote").textContent = "Your entry stays private unless you publish it.";
  }

  if (moveFocus) {
    const activeSection = document.querySelector(`[data-entry-step="${state.entryStep}"]`);
    activeSection?.querySelector("button:not([disabled]), input:not([type=hidden]), select, textarea")?.focus();
  }
}

function handleEntryFormSubmit(event) {
  event.preventDefault();
  if (state.entryStep < 3) {
    nextEntryStep();
    return;
  }
  submitEntry();
}

function nextEntryStep() {
  if (state.entryStep === 1 && !validatePlace()) return;
  if (state.entryStep === 2 && !validateRatings()) return;
  setEntryStep(state.entryStep + 1);
}

function validatePlace() {
  const place = $("placeName");
  if (!place.value.trim()) {
    place.setCustomValidity("Add the cafe or shop name to continue.");
    place.reportValidity();
    place.focus();
    return false;
  }
  place.setCustomValidity("");
  return true;
}

function validateRatings() {
  const rating = Number($("ratingValue").value);
  const vibe = Number($("vibeValue").value);
  if (!rating) {
    showToast("Choose a matcha rating first.");
    $("starRating").querySelector("button")?.focus();
    return false;
  }
  if (!vibe) {
    showToast("Choose a vibe rating too.");
    $("vibeRating").querySelector("button")?.focus();
    return false;
  }
  return true;
}

async function handlePhoto(event, source) {
  const file = event.target.files?.[0];
  if (!file) return;

  state.photoSource = source;
  $("photoStatus").className = "photo-status";
  $("photoStatus").textContent = source === "camera"
    ? "Processing your new photo and checking for location…"
    : "Reading the photo and checking for location…";

  try {
    state.photoData = await compressPhoto(file);
    if (state.photoData) {
      $("photoPreview").src = state.photoData;
      $("photoPreview").hidden = false;
      $("photoPlaceholder").hidden = true;
      $("removePhotoButton").hidden = false;
      $("photoPreviewCard").classList.add("has-photo");
    }
  } catch {
    state.photoData = null;
    $("photoStatus").textContent = "Photo selected, but this browser could not create a preview.";
  }

  try {
    if (!window.exifr?.gps) throw new Error("EXIF reader unavailable");
    const gps = await window.exifr.gps(file);
    if (gps?.latitude != null && gps?.longitude != null) {
      await setLocation(gps.latitude, gps.longitude, "photo");
      $("photoStatus").className = "photo-status is-success";
      $("photoStatus").textContent = "Photo added and its GPS location was found.";
      return;
    }
    $("photoStatus").className = "photo-status is-warning";
    $("photoStatus").textContent = "Photo added. It has no GPS data, so use current location, search, or a pin below.";
  } catch {
    $("photoStatus").className = "photo-status is-warning";
    $("photoStatus").textContent = "Photo added. Choose a location below if you want it on the map.";
  }
}

function removePhoto(clearStatus = true) {
  state.photoData = null;
  state.photoSource = null;
  $("cameraInput").value = "";
  $("libraryInput").value = "";
  $("photoPreview").hidden = true;
  $("photoPreview").removeAttribute("src");
  $("photoPlaceholder").hidden = false;
  $("removePhotoButton").hidden = true;
  $("photoPreviewCard").classList.remove("has-photo");
  if (clearStatus) {
    $("photoStatus").textContent = "Photo removed.";
    $("photoStatus").className = "photo-status";
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
        const maxSide = 1280;
        const scale = Math.min(1, maxSide / Math.max(image.width, image.height));
        const canvas = document.createElement("canvas");
        canvas.width = Math.max(1, Math.round(image.width * scale));
        canvas.height = Math.max(1, Math.round(image.height * scale));
        const context = canvas.getContext("2d");
        if (!context) {
          reject(new Error("Canvas is unavailable"));
          return;
        }
        context.drawImage(image, 0, 0, canvas.width, canvas.height);
        resolve(canvas.toDataURL("image/jpeg", 0.78));
      };
      image.src = reader.result;
    };
    reader.readAsDataURL(file);
  });
}

function useCurrentLocation(source = "current") {
  if (!navigator.geolocation) {
    showToast("Location is not available in this browser.");
    return Promise.resolve();
  }

  $("locationSourceBadge").textContent = "Finding you…";
  return new Promise((resolve) => {
    navigator.geolocation.getCurrentPosition(
      async ({ coords }) => {
        await setLocation(coords.latitude, coords.longitude, source);
        showToast("Current location added.");
        resolve();
      },
      () => {
        $("locationSourceBadge").textContent = "Location permission needed";
        showToast("Allow location access, search for the cafe, or drop a pin.");
        resolve();
      },
      { enableHighAccuracy: true, timeout: 12000, maximumAge: 60000 },
    );
  });
}

async function setLocation(latitude, longitude, source, label = "", suggestedName = "") {
  $("latitude").value = String(latitude);
  $("longitude").value = String(longitude);
  $("locationSource").value = source;
  $("locationSourceBadge").className = "location-source-badge has-location";
  $("locationSourceBadge").textContent = source === "photo"
    ? "From photo GPS"
    : source === "pin"
      ? "Pinned location"
      : source === "search"
        ? "Searched location"
        : "Current location";

  if (label) $("locationLabel").value = label;
  if (suggestedName && !$("placeName").value.trim()) $("placeName").value = suggestedName;
  updatePin(latitude, longitude);

  if (!label) {
    const reverse = await reverseGeocode(latitude, longitude);
    if (reverse.label) $("locationLabel").value = reverse.label;
    if (reverse.name && !$("placeName").value.trim()) $("placeName").value = reverse.name;
  }
}

async function reverseGeocode(latitude, longitude) {
  try {
    const params = new URLSearchParams({
      format: "jsonv2",
      lat: String(latitude),
      lon: String(longitude),
      zoom: "18",
      addressdetails: "1",
      "accept-language": "en",
    });
    const response = await fetch(`https://nominatim.openstreetmap.org/reverse?${params}`);
    if (!response.ok) return { label: "", name: "" };
    const data = await response.json();
    const address = data.address || {};
    const name = data.name
      || address.cafe
      || address.coffee_shop
      || address.restaurant
      || address.shop
      || address.amenity
      || address.building
      || "";
    return { label: data.display_name || "", name };
  } catch {
    return { label: "", name: "" };
  }
}

async function searchLocation() {
  const query = $("locationSearchInput").value.trim();
  if (!query) return;

  $("locationSearchResults").innerHTML = `<div class="search-result">Searching…</div>`;
  try {
    const params = new URLSearchParams({
      format: "jsonv2",
      q: query,
      limit: "5",
      addressdetails: "1",
      "accept-language": "en",
    });
    const response = await fetch(`https://nominatim.openstreetmap.org/search?${params}`);
    if (!response.ok) throw new Error("Location search failed");
    const results = await response.json();

    if (!results.length) {
      $("locationSearchResults").innerHTML = `<div class="search-result">No places found. Try another search.</div>`;
      return;
    }

    $("locationSearchResults").innerHTML = results.map((result, index) => `
      <button type="button" class="search-result" data-result-index="${index}">
        <strong>${escapeHtml(result.name || result.display_name.split(",")[0] || query)}</strong>
        <span>${escapeHtml(result.display_name)}</span>
      </button>`).join("");

    $("locationSearchResults").querySelectorAll("[data-result-index]").forEach((button) => {
      button.addEventListener("click", async () => {
        const result = results[Number(button.dataset.resultIndex)];
        const displayName = result.display_name || "";
        const placeName = result.name || displayName.split(",")[0] || query;
        await setLocation(Number(result.lat), Number(result.lon), "search", displayName, placeName);
        $("locationSearchPanel").hidden = true;
        $("searchLocationButton").setAttribute("aria-expanded", "false");
      });
    });
  } catch {
    $("locationSearchResults").innerHTML = `<div class="search-result">Search is unavailable right now. Use current location or drop a pin.</div>`;
  }
}

function togglePinMap() {
  const pinMap = $("pinMap");
  pinMap.hidden = !pinMap.hidden;
  $("togglePinMapButton").setAttribute("aria-expanded", String(!pinMap.hidden));
  if (pinMap.hidden) return;
  ensurePinMap();
  setTimeout(() => state.pinMap?.invalidateSize(), 50);
}

function ensurePinMap() {
  if (state.pinMap || !window.L) return;
  const startLat = Number($("latitude").value) || 39.5;
  const startLng = Number($("longitude").value) || -98.35;
  const zoom = $("latitude").value ? 15 : 4;

  state.pinMap = L.map("pinMap").setView([startLat, startLng], zoom);
  L.tileLayer("https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png", {
    maxZoom: 19,
    attribution: '&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a>',
  }).addTo(state.pinMap);
  state.pinMap.on("click", async (event) => {
    await setLocation(event.latlng.lat, event.latlng.lng, "pin");
  });
  if ($("latitude").value) updatePin(startLat, startLng);
}

function updatePin(latitude, longitude) {
  if (!state.pinMap) return;
  if (state.pinMarker) {
    state.pinMarker.setLatLng([latitude, longitude]);
  } else {
    state.pinMarker = L.marker([latitude, longitude]).addTo(state.pinMap);
  }
  state.pinMap.setView([latitude, longitude], Math.max(state.pinMap.getZoom(), 15));
}

async function submitEntry() {
  if (!validatePlace() || !validateRatings()) return;

  const rating = Number($("ratingValue").value);
  const vibe = Number($("vibeValue").value);
  const entry = {
    id: crypto.randomUUID(),
    placeName: $("placeName").value.trim(),
    locationLabel: $("locationLabel").value.trim(),
    latitude: numberOrNull($("latitude").value),
    longitude: numberOrNull($("longitude").value),
    locationSource: $("locationSource").value || null,
    rating,
    vibe,
    priceCents: priceToCents($("price").value),
    drinkSize: $("drinkSize").value || null,
    milkType: $("milkType").value || null,
    sweetness: $("sweetness").value || null,
    visitDate: $("visitDate").value || null,
    waitMinutes: numberOrNull($("waitTime").value),
    addOns: $("addOns").value.split(",").map((item) => item.trim()).filter(Boolean).slice(0, 12),
    notes: $("notes").value.trim(),
    wouldOrderAgain: $("orderAgain").checked,
    shareCommunity: $("shareCommunity").checked,
    favorite: false,
    createdAt: new Date().toISOString(),
    photoData: state.photoData,
  };

  setSaveBusy(true);
  let saved = entry;
  let savedToCloud = false;

  if (state.user && state.cloudAvailable) {
    try {
      const payload = { ...entry };
      delete payload.photoData;
      const response = await fetch("/api/entries", {
        method: "POST",
        headers: { "content-type": "application/json", accept: "application/json" },
        body: JSON.stringify(payload),
      });
      if (!response.ok) throw new Error("Entry save failed");
      const data = await response.json();
      saved = { ...data.entry, photoData: state.photoData };
      savedToCloud = true;
    } catch {
      showToast("Cloud save was unavailable, so this matcha was saved on this device.");
    }
  }

  state.entries.unshift(saved);
  if (!savedToCloud) saveLocalEntries();
  if (state.photoData) setPhoto(saved.id, state.photoData);
  if (saved.shareCommunity && !state.communityEntries.some((item) => item.id === saved.id)) {
    state.communityEntries.unshift(saved);
  }

  setSaveBusy(false);
  closeEntryDialog();
  state.filter = "all";
  document.querySelectorAll("[data-filter]").forEach((chip) => {
    const active = chip.dataset.filter === "all";
    chip.classList.toggle("is-active", active);
    chip.setAttribute("aria-pressed", String(active));
  });
  renderAll();
  switchView("collection", false);

  if (saved.shareCommunity) {
    showToast("Matcha saved and published to your profile and map.");
  } else if (savedToCloud) {
    showToast("Matcha saved privately.");
  } else {
    showToast("Matcha saved on this device.");
  }
}

function setSaveBusy(busy) {
  ["saveEntryButton", "entryQuickSaveButton", "entryNextButton"].forEach((id) => {
    if ($(id)) $(id).disabled = busy;
  });
  $("saveEntryButton").textContent = busy ? "Saving…" : "Save matcha";
  $("entryQuickSaveButton").textContent = busy ? "Saving…" : "Save quick log";
}

function switchView(view, scroll = true) {
  const validViews = ["collection", "map", "profile", "settings"];
  if (!validViews.includes(view)) view = "collection";
  state.activeView = view;

  validViews.forEach((name) => {
    const section = $(`${name}View`);
    if (section) section.hidden = name !== view;
  });

  document.querySelectorAll("[data-view]").forEach((button) => {
    const active = button.dataset.view === view;
    button.classList.toggle("is-active", active);
    if (active) button.setAttribute("aria-current", "page");
    else button.removeAttribute("aria-current");
  });

  if (view === "map") {
    ensureCommunityMap();
    setTimeout(() => state.communityMap?.invalidateSize(), 70);
    renderCommunityMap();
  }
  if (view === "profile") renderProfile();
  if (view === "settings") renderSettingsControls();

  if (scroll) {
    window.scrollTo({ top: 0, behavior: state.settings.reduceMotion ? "auto" : "smooth" });
  }
}

function ensureCommunityMap() {
  if (state.communityMap || !window.L) return;
  state.communityMap = L.map("communityMap").setView([39.5, -98.35], 4);
  L.tileLayer("https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png", {
    maxZoom: 19,
    attribution: '&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a>',
  }).addTo(state.communityMap);
}

function renderCommunityList() {
  const entries = state.communityEntries.filter(hasCoordinates).sort(sortNewestFirst);
  $("communityCount").textContent = `${entries.length} ${entries.length === 1 ? "place" : "places"}`;

  if (!entries.length) {
    $("communityList").innerHTML = `<div class="map-empty">No published matchas with locations yet. Publish one of yours and it can become the first pin.</div>`;
    if (state.communityMap) renderCommunityMap();
    return;
  }

  $("communityList").innerHTML = entries.map((entry) => `
    <button class="community-item" type="button" data-map-entry="${escapeHtml(entry.id)}">
      <strong>${escapeHtml(entry.placeName)}</strong>
      <span>★ ${entry.rating}/5 · ${escapeHtml(entry.locationLabel || "Pinned location")}</span>
      ${entry.ownerName ? `<small>Published by ${escapeHtml(entry.ownerName)}</small>` : ""}
    </button>`).join("");

  $("communityList").querySelectorAll("[data-map-entry]").forEach((button) => {
    button.addEventListener("click", () => focusCommunityEntry(button.dataset.mapEntry));
  });
  if (state.communityMap) renderCommunityMap();
}

function renderCommunityMap() {
  ensureCommunityMap();
  if (!state.communityMap) return;

  state.communityMarkers.forEach((marker) => marker.remove());
  state.communityMarkers = [];
  const entries = state.communityEntries.filter(hasCoordinates);
  const bounds = [];

  entries.forEach((entry) => {
    const marker = L.marker([Number(entry.latitude), Number(entry.longitude)]).addTo(state.communityMap);
    marker.bindPopup(`<strong>${escapeHtml(entry.placeName)}</strong><br>★ ${entry.rating}/5 · Vibe ${entry.vibe}/5`);
    marker.__entryId = entry.id;
    state.communityMarkers.push(marker);
    bounds.push([Number(entry.latitude), Number(entry.longitude)]);
  });

  if (bounds.length === 1) {
    state.communityMap.setView(bounds[0], 14);
  } else if (bounds.length > 1) {
    state.communityMap.fitBounds(bounds, { padding: [40, 40], maxZoom: 14 });
  }
}

function focusCommunityEntry(id) {
  const entry = state.communityEntries.find((item) => item.id === id);
  if (!entry || !hasCoordinates(entry)) return;
  switchView("map");
  state.communityMap.setView([Number(entry.latitude), Number(entry.longitude)], 16);
  state.communityMarkers.find((marker) => marker.__entryId === id)?.openPopup();
}

function centerCommunityMapOnUser() {
  ensureCommunityMap();
  if (!navigator.geolocation) {
    showToast("Location is not available in this browser.");
    return Promise.resolve();
  }

  return new Promise((resolve) => {
    navigator.geolocation.getCurrentPosition(
      ({ coords }) => {
        const latLng = [coords.latitude, coords.longitude];
        state.communityMap?.setView(latLng, 14);
        if (state.userLocationMarker) state.userLocationMarker.remove();
        state.userLocationMarker = L.circleMarker(latLng, {
          radius: 8,
          weight: 3,
          fillOpacity: 1,
        }).addTo(state.communityMap).bindPopup("You are here");
        resolve();
      },
      () => {
        showToast("Allow location access to center the map on you.");
        resolve();
      },
      { enableHighAccuracy: true, timeout: 12000, maximumAge: 60000 },
    );
  });
}

function maybeOpenFirstLaunchTour() {
  try {
    if (localStorage.getItem(TOUR_KEY)) return;
  } catch {
    return;
  }
  setTimeout(() => openTour(true), 450);
}

function openTour() {
  setTourStep(0);
  if (!$("tourDialog").open) $("tourDialog").showModal();
}

function completeTour(openEntryAfter) {
  try {
    localStorage.setItem(TOUR_KEY, "true");
  } catch {
    // The tour can still close when browser storage is unavailable.
  }
  if ($("tourDialog").open) $("tourDialog").close();
  if (openEntryAfter) setTimeout(openEntryDialog, 120);
}

function setTourStep(index) {
  state.tourIndex = Math.max(0, Math.min(tourSteps.length - 1, index));
  const step = tourSteps[state.tourIndex];
  $("tourIllustration").textContent = step.icon;
  $("tourStepLabel").textContent = `Step ${state.tourIndex + 1} of ${tourSteps.length}`;
  $("tourTitle").textContent = step.title;
  $("tourBody").textContent = step.body;
  $("tourBack").disabled = state.tourIndex === 0;
  $("tourNext").textContent = state.tourIndex === tourSteps.length - 1 ? "Log my first matcha" : "Next";
  $("tourDots").innerHTML = tourSteps.map((_, i) => `
    <span class="tour-dot ${i === state.tourIndex ? "is-active" : ""}" aria-hidden="true"></span>`).join("");
}

function loadLocalEntries() {
  try {
    const parsed = JSON.parse(localStorage.getItem(STORAGE_KEY) || "[]");
    return Array.isArray(parsed) ? parsed : [];
  } catch {
    return [];
  }
}

function saveLocalEntries() {
  try {
    const trimmed = state.entries.map(({ photoData, ...entry }) => entry);
    localStorage.setItem(STORAGE_KEY, JSON.stringify(trimmed));
    state.entries.forEach((entry) => {
      if (entry.photoData) setPhoto(entry.id, entry.photoData);
    });
  } catch {
    showToast("This browser is low on storage. Your newest photo may not persist.");
  }
}

function getPhoto(id) {
  try {
    return JSON.parse(localStorage.getItem(PHOTO_KEY) || "{}")[id] || null;
  } catch {
    return null;
  }
}

function setPhoto(id, data) {
  if (!data) return;
  try {
    const photos = JSON.parse(localStorage.getItem(PHOTO_KEY) || "{}");
    photos[id] = data;
    const keys = Object.keys(photos);
    while (keys.length > 12) delete photos[keys.shift()];
    localStorage.setItem(PHOTO_KEY, JSON.stringify(photos));
  } catch {
    // The entry metadata can still be saved if the browser photo cache is full.
  }
}

function hasCoordinates(entry) {
  return entry.latitude != null
    && entry.longitude != null
    && Number.isFinite(Number(entry.latitude))
    && Number.isFinite(Number(entry.longitude));
}

function priceToCents(value) {
  const price = Number.parseFloat(String(value).replace(/[^0-9.]/g, ""));
  return Number.isFinite(price) ? Math.round(price * 100) : null;
}

function numberOrNull(value) {
  if (value === "" || value == null) return null;
  const number = Number(value);
  return Number.isFinite(number) ? number : null;
}

function todayString() {
  const now = new Date();
  const local = new Date(now.getTime() - now.getTimezoneOffset() * 60000);
  return local.toISOString().slice(0, 10);
}

function formatDate(value) {
  if (!value) return "";
  const date = /^\d{4}-\d{2}-\d{2}$/.test(String(value))
    ? new Date(`${value}T12:00:00`)
    : new Date(value);
  if (Number.isNaN(date.getTime())) return "";
  return new Intl.DateTimeFormat(undefined, { month: "short", day: "numeric", year: "numeric" }).format(date);
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
