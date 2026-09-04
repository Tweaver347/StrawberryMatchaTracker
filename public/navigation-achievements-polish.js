"use strict";

(function installNavigationAchievementsPolish() {
  const css = document.createElement("link");
  css.rel = "stylesheet";
  css.href = "/navigation-achievements-polish.css";
  document.head.appendChild(css);

  const TAB_ICONS = {
    home: "🏠",
    places: "📍",
    log: "📸",
    map: "🗺️",
    profile: "👤",
  };

  const achievementView = {
    filter: "all",
    sort: "default",
  };

  enhanceNavigation();
  showPreferencesLabel();
  installAchievementControls();

  const baseRenderAchievements = renderAchievements;
  renderAchievements = function renderAchievementsWithControls() {
    baseRenderAchievements();
    installAchievementControls();
    applyAchievementView();
  };

  function enhanceNavigation() {
    const desktopTabs = [
      ["home", "Home"],
      ["places", "Places"],
      ["map", "Map"],
      ["profile", "Profile"],
    ];

    desktopTabs.forEach(([view, label]) => {
      const button = document.querySelector(`.desktop-nav [data-view="${view}"]`);
      if (!button) return;
      button.innerHTML = `<span class="nav-tab-emoji" aria-hidden="true">${TAB_ICONS[view]}</span><span>${label}</span>`;
    });

    const desktopLog = document.querySelector(".desktop-nav .desktop-log-button");
    if (desktopLog) {
      desktopLog.innerHTML = `<span class="nav-tab-emoji" aria-hidden="true">${TAB_ICONS.log}</span><span>Log a Matcha</span>`;
    }

    const mobileTabs = [
      ["home", "Home"],
      ["places", "Places"],
      ["map", "Map"],
      ["profile", "Profile"],
    ];

    mobileTabs.forEach(([view, label]) => {
      const button = document.querySelector(`.mobile-nav [data-view="${view}"]`);
      if (!button) return;
      button.innerHTML = `<span class="nav-tab-emoji" aria-hidden="true">${TAB_ICONS[view]}</span><small>${label}</small>`;
    });

    const mobileLog = document.querySelector(".mobile-nav .mobile-log-button");
    if (mobileLog) {
      mobileLog.innerHTML = `<span class="nav-tab-emoji" aria-hidden="true">${TAB_ICONS.log}</span><small>Log</small>`;
    }
  }

  function showPreferencesLabel() {
    const button = $("openSettingsButton");
    if (!button) return;
    button.classList.add("preferences-label-button");
    button.setAttribute("aria-label", "Open preferences");
    button.title = "Preferences";
    button.innerHTML = `<span class="preferences-gear" aria-hidden="true">⚙️</span><span class="preferences-button-label">Preferences</span>`;
  }

  function installAchievementControls() {
    const section = document.querySelector(".achievement-section");
    const board = $("achievementBoard");
    if (!section || !board || $("achievementControls")) return;

    const controls = document.createElement("div");
    controls.id = "achievementControls";
    controls.className = "achievement-controls";
    controls.innerHTML = `
      <label class="achievement-control-field">
        <span>Status</span>
        <select id="achievementStatusFilter" class="text-input" aria-label="Filter achievements by completion status">
          <option value="all">All achievements</option>
          <option value="complete">Completed</option>
          <option value="incomplete">Incomplete</option>
        </select>
      </label>
      <label class="achievement-control-field">
        <span>Sort</span>
        <select id="achievementSort" class="text-input" aria-label="Sort achievements">
          <option value="default">Scrapbook order</option>
          <option value="closest">Closest to complete</option>
          <option value="alpha">A–Z</option>
          <option value="recent">Recently earned</option>
        </select>
      </label>
      <span class="achievement-view-count" id="achievementViewCount" aria-live="polite"></span>`;

    section.insertBefore(controls, board);

    $("achievementStatusFilter")?.addEventListener("change", (event) => {
      achievementView.filter = event.target.value;
      applyAchievementView();
    });

    $("achievementSort")?.addEventListener("change", (event) => {
      achievementView.sort = event.target.value;
      applyAchievementView();
    });
  }

  function applyAchievementView() {
    const board = $("achievementBoard");
    if (!board) return;

    const context = buildAchievementContext();
    const definitionMap = new Map(ACHIEVEMENT_DEFINITIONS.map((definition, index) => [definition.id, { definition, index }]));
    const buttons = [...board.querySelectorAll("[data-achievement-id]")];

    const details = buttons.map((button) => {
      const id = button.dataset.achievementId;
      const record = definitionMap.get(id);
      const definition = record?.definition;
      const earned = button.classList.contains("is-earned");
      let progress = 0;
      if (definition) {
        try {
          const metric = Number(definition.metric(context));
          const target = Number(definition.target) || 1;
          progress = Number.isFinite(metric) ? Math.max(0, Math.min(metric / target, 1)) : 0;
        } catch {
          progress = earned ? 1 : 0;
        }
      }
      const earnedAtRaw = state.settings.earnedAchievements?.[id];
      const earnedAt = earnedAtRaw ? new Date(earnedAtRaw).getTime() : 0;
      const name = definition?.name || button.querySelector(".achievement-name")?.textContent || id;
      return {
        button,
        earned,
        progress,
        earnedAt: Number.isFinite(earnedAt) ? earnedAt : 0,
        name,
        defaultIndex: record?.index ?? Number.MAX_SAFE_INTEGER,
      };
    });

    details.sort((a, b) => {
      if (achievementView.sort === "closest") {
        if (a.earned !== b.earned) return a.earned ? 1 : -1;
        return b.progress - a.progress || a.name.localeCompare(b.name);
      }
      if (achievementView.sort === "alpha") return a.name.localeCompare(b.name);
      if (achievementView.sort === "recent") {
        if (a.earned !== b.earned) return a.earned ? -1 : 1;
        return b.earnedAt - a.earnedAt || a.name.localeCompare(b.name);
      }
      return a.defaultIndex - b.defaultIndex;
    });

    let visibleCount = 0;
    details.forEach((item) => {
      const visible = achievementView.filter === "all"
        || (achievementView.filter === "complete" && item.earned)
        || (achievementView.filter === "incomplete" && !item.earned);
      item.button.hidden = !visible;
      if (visible) visibleCount += 1;
      board.appendChild(item.button);
    });

    const count = $("achievementViewCount");
    if (count) count.textContent = `Showing ${visibleCount} of ${details.length}`;

    const filter = $("achievementStatusFilter");
    if (filter) filter.value = achievementView.filter;
    const sort = $("achievementSort");
    if (sort) sort.value = achievementView.sort;
  }
})();
