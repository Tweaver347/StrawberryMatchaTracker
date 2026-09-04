"use strict";

(function installPreferencesPolish() {
  const CHARLOTTE = { latitude: 35.2271, longitude: -80.8431, label: "Charlotte, NC" };

  const css = document.createElement("link");
  css.rel = "stylesheet";
  css.href = "/preferences-polish.css";
  document.head.appendChild(css);

  const finishedLogStep = TOUR_STEPS.find((step) => step.title === "Three things make a finished log");
  if (finishedLogStep) finishedLogStep.icon = "🍓";

  addParallaxLayers();
  renameSettingsToPreferences();
  installFilterDrawer();
  installHomeLocationPreference();
  installMapHomeBehavior();
  installPreferenceHooks();

  function renameSettingsToPreferences() {
    const title = $("settingsTitle");
    if (title) title.textContent = "Preferences";
    const open = $("openSettingsButton");
    if (open) {
      open.setAttribute("aria-label", "Open preferences");
      open.title = "Preferences";
    }
    const save = $("settingsForm")?.querySelector('.settings-footer button[type="submit"]');
    if (save) save.textContent = "Save Preferences";
    const accountSubtitle = $("profileSubtitle");
    if (accountSubtitle?.textContent.includes("settings")) {
      accountSubtitle.textContent = accountSubtitle.textContent.replace("settings", "preferences");
    }
  }

  function installFilterDrawer() {
    const tools = $("memoryTools");
    if (!tools || $("memoryFiltersButton")) return;

    const search = $("memorySearch")?.closest("label");
    const manage = $("manageMemoriesButton");
    const count = $("memoryFilterCount");
    const selects = [$("memoryRatingFilter"), $("memoryMilkFilter"), $("memoryPrivacyFilter"), $("memoryPeriodFilter")].filter(Boolean);

    tools.classList.add("memory-tools-condensed");
    const toolbar = document.createElement("div");
    toolbar.className = "memory-tools-toolbar";
    if (search) toolbar.appendChild(search);

    const filtersButton = document.createElement("button");
    filtersButton.className = "secondary-button memory-filters-button";
    filtersButton.type = "button";
    filtersButton.id = "memoryFiltersButton";
    filtersButton.setAttribute("aria-haspopup", "dialog");
    filtersButton.innerHTML = `<span aria-hidden="true">☰</span> Filters <span class="filter-badge" id="filterBadge" hidden>0</span>`;
    toolbar.appendChild(filtersButton);
    if (manage) toolbar.appendChild(manage);
    tools.prepend(toolbar);

    const summary = document.createElement("div");
    summary.id = "activeFilterChips";
    summary.className = "active-filter-chips";
    summary.setAttribute("aria-live", "polite");
    tools.appendChild(summary);
    if (count) tools.appendChild(count);

    const dialog = document.createElement("dialog");
    dialog.id = "memoryFiltersDialog";
    dialog.className = "app-dialog filter-drawer-dialog";
    dialog.setAttribute("aria-labelledby", "memoryFiltersTitle");
    dialog.innerHTML = `
      <form method="dialog" class="dialog-paper filter-drawer-paper">
        <div class="settings-dialog-header">
          <div><span class="hand-label">find the page you remember</span><h2 id="memoryFiltersTitle">Filters</h2></div>
          <button class="dialog-close static-close" value="cancel" aria-label="Close filters">×</button>
        </div>
        <div class="filter-drawer-fields" id="filterDrawerFields"></div>
        <div class="filter-drawer-actions">
          <button class="text-button" type="button" id="clearMemoryFilters">Clear filters</button>
          <button class="primary-button" value="apply">Apply Filters</button>
        </div>
      </form>`;
    document.body.appendChild(dialog);

    const fieldWrap = $("filterDrawerFields");
    const labels = ["Rating", "Milk", "Privacy", "Time range"];
    selects.forEach((select, index) => {
      const label = document.createElement("label");
      label.className = "field-group";
      label.innerHTML = `<span>${labels[index]}</span>`;
      select.classList.add("text-input", "drawer-filter-select");
      label.appendChild(select);
      fieldWrap.appendChild(label);
    });

    filtersButton.addEventListener("click", () => dialog.showModal());
    $("clearMemoryFilters")?.addEventListener("click", () => {
      state.quickWins.rating = "all";
      state.quickWins.milk = "all";
      state.quickWins.privacy = "all";
      state.quickWins.period = "all";
      selects.forEach((select) => { select.value = "all"; });
      renderHome();
      updateFilterSummary();
    });

    const originalRenderHome = renderHome;
    renderHome = function renderHomeWithCondensedFilters() {
      originalRenderHome();
      updateFilterSummary();
    };
    updateFilterSummary();
  }

  function updateFilterSummary() {
    if (!state.quickWins || !$("activeFilterChips")) return;
    const active = [];
    if (state.quickWins.rating !== "all") active.push(`${state.quickWins.rating}+ strawberries`);
    if (state.quickWins.milk !== "all") active.push(state.quickWins.milk);
    if (state.quickWins.privacy !== "all") active.push(state.quickWins.privacy === "favorite" ? "Favorites" : capitalize(state.quickWins.privacy));
    if (state.quickWins.period === "30") active.push("Last 30 days");
    if (state.quickWins.period === "year") active.push("This year");
    $("activeFilterChips").innerHTML = active.map((label) => `<span class="active-filter-chip">${escapeHtml(label)}</span>`).join("");
    const badge = $("filterBadge");
    if (badge) {
      badge.textContent = String(active.length);
      badge.hidden = active.length === 0;
    }
  }

  function capitalize(value) {
    return String(value || "").charAt(0).toUpperCase() + String(value || "").slice(1);
  }

  function installHomeLocationPreference() {
    if ($("homeLocationPreference")) return;
    const scroll = $("settingsDialog")?.querySelector(".settings-scroll");
    if (!scroll) return;
    const appearance = $("appearanceSettingsTitle")?.closest(".settings-section");
    const section = document.createElement("section");
    section.className = "settings-section";
    section.id = "homeLocationPreference";
    section.setAttribute("aria-labelledby", "homeLocationTitle");
    section.innerHTML = `
      <h3 id="homeLocationTitle">Map Home</h3>
      <p class="settings-help">Choose where your map opens when you do not have matcha pins to frame yet. Charlotte, NC is the fallback.</p>
      <div class="setting-paper-row home-location-row">
        <div><strong>Home location</strong><small id="homeLocationStatus">Charlotte, NC (default)</small></div>
        <div class="home-location-actions">
          <button class="secondary-button" type="button" id="setHomeLocationButton">Use current location</button>
          <button class="text-button" type="button" id="clearHomeLocationButton">Clear home</button>
        </div>
      </div>`;
    if (appearance) scroll.insertBefore(section, appearance);
    else scroll.appendChild(section);

    $("setHomeLocationButton").addEventListener("click", setCurrentLocationAsHome);
    $("clearHomeLocationButton").addEventListener("click", clearHomeLocation);
    updateHomeLocationStatus();
  }

  function getHomeLocation() {
    const latitude = Number(state.settings.homeLatitude);
    const longitude = Number(state.settings.homeLongitude);
    if (Number.isFinite(latitude) && Number.isFinite(longitude) && Math.abs(latitude) <= 90 && Math.abs(longitude) <= 180) {
      return { latitude, longitude, label: state.settings.homeLabel || "Saved home" };
    }
    return null;
  }

  function setCurrentLocationAsHome() {
    if (!navigator.geolocation) {
      showToast("Location is not available in this browser.");
      return;
    }
    const button = $("setHomeLocationButton");
    if (button) button.disabled = true;
    navigator.geolocation.getCurrentPosition(async ({ coords }) => {
      state.settings.homeLatitude = Number(coords.latitude.toFixed(6));
      state.settings.homeLongitude = Number(coords.longitude.toFixed(6));
      state.settings.homeLabel = "Current location";
      try {
        const place = await reverseGeocodePlace(coords.latitude, coords.longitude);
        const label = place?.locationLabel || place?.name;
        if (label) state.settings.homeLabel = label;
      } catch {}
      persistSettings();
      updateHomeLocationStatus();
      centerMapOnHome();
      if (button) button.disabled = false;
      showToast("Home map location saved.");
    }, () => {
      if (button) button.disabled = false;
      showToast("Allow location access to save your map home.");
    }, { enableHighAccuracy: true, timeout: 12000, maximumAge: 60000 });
  }

  function clearHomeLocation() {
    delete state.settings.homeLatitude;
    delete state.settings.homeLongitude;
    delete state.settings.homeLabel;
    persistSettings();
    updateHomeLocationStatus();
    if (state.personalMap && state.placeGroups.length === 0) state.personalMap.setView([CHARLOTTE.latitude, CHARLOTTE.longitude], 11);
    showToast("Map home reset to Charlotte, NC.");
  }

  function updateHomeLocationStatus() {
    const home = getHomeLocation();
    const status = $("homeLocationStatus");
    if (status) status.textContent = home ? home.label : `${CHARLOTTE.label} (default)`;
    const clear = $("clearHomeLocationButton");
    if (clear) clear.disabled = !home;
    const goHome = $("goHomeMapButton");
    if (goHome) goHome.hidden = !home;
  }

  function installMapHomeBehavior() {
    const mapControls = document.querySelector(".map-controls");
    if (mapControls && !$("goHomeMapButton")) {
      const button = document.createElement("button");
      button.className = "secondary-button";
      button.id = "goHomeMapButton";
      button.type = "button";
      button.innerHTML = `<span aria-hidden="true">⌂</span> Go to home`;
      button.addEventListener("click", centerMapOnHome);
      mapControls.appendChild(button);
    }

    const originalEnsurePersonalMap = ensurePersonalMap;
    ensurePersonalMap = function ensurePersonalMapWithHome() {
      const hadMap = Boolean(state.personalMap);
      originalEnsurePersonalMap();
      if (!hadMap && state.personalMap) {
        const home = getHomeLocation() || CHARLOTTE;
        state.personalMap.setView([home.latitude, home.longitude], 11);
      }
    };
    updateHomeLocationStatus();
  }

  function centerMapOnHome() {
    ensurePersonalMap();
    if (!state.personalMap) return;
    const home = getHomeLocation() || CHARLOTTE;
    state.personalMap.setView([home.latitude, home.longitude], 13);
  }

  function installPreferenceHooks() {
    const originalUpdateSettingsControls = updateSettingsControls;
    updateSettingsControls = function updatePreferencesControls() {
      originalUpdateSettingsControls();
      renameSettingsToPreferences();
      updateHomeLocationStatus();
    };

    const originalApplySettings = applySettings;
    applySettings = function applySettingsWithParallax() {
      originalApplySettings();
      updateParallaxAccessibility();
    };
  }

  function addParallaxLayers() {
    if ($("scrapbookParallax")) return;
    const wrap = document.createElement("div");
    wrap.id = "scrapbookParallax";
    wrap.className = "scrapbook-parallax";
    wrap.setAttribute("aria-hidden", "true");
    wrap.innerHTML = `
      <div class="parallax-layer parallax-strawberries">🍓　　🍓　　　　🍓　　🍓　　　　🍓　　🍓　　　　🍓</div>
      <div class="parallax-layer parallax-matcha">　🍵　　　　🍵　　🍵　　　　🍵　　　🍵　　　　🍵　　🍵</div>`;
    document.body.prepend(wrap);

    let ticking = false;
    const paint = () => {
      ticking = false;
      if (state.settings?.reduceMotion || state.settings?.reduceClutter || window.matchMedia?.("(prefers-reduced-motion: reduce)")?.matches) {
        wrap.style.setProperty("--parallax-y", "0px");
        return;
      }
      wrap.style.setProperty("--parallax-y", `${Math.min(window.scrollY * 0.06, 80)}px`);
    };
    window.addEventListener("scroll", () => {
      if (!ticking) {
        ticking = true;
        requestAnimationFrame(paint);
      }
    }, { passive: true });
    paint();
  }

  function updateParallaxAccessibility() {
    const wrap = $("scrapbookParallax");
    if (!wrap) return;
    wrap.classList.toggle("is-static", Boolean(state.settings?.reduceMotion));
    wrap.hidden = Boolean(state.settings?.reduceClutter);
  }
})();
