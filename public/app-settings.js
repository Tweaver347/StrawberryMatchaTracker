"use strict";

(function loadAccessibilityStylesheet() {
  if (document.querySelector('link[data-scrapbook-accessibility]')) return;
  const link = document.createElement("link");
  link.rel = "stylesheet";
  link.href = "/accessibility.css";
  link.dataset.scrapbookAccessibility = "true";
  document.head.appendChild(link);
})();

function openSettings() {
  updateSettingsControls();
  $("settingsDialog").showModal();
}

function closeSettings() {
  $("settingsDialog").close();
}

function updateSettingsControls() {
  document.querySelectorAll("[data-theme-option]").forEach((button) => button.setAttribute("aria-pressed", String(button.dataset.themeOption === state.settings.theme)));
  document.querySelectorAll("[data-text-option]").forEach((button) => button.setAttribute("aria-pressed", String(button.dataset.textOption === state.settings.textSize)));
  $("highContrastSetting").checked = Boolean(state.settings.highContrast);
  $("reduceMotionSetting").checked = Boolean(state.settings.reduceMotion);
  $("readableFontSetting").checked = Boolean(state.settings.readableFont);
  $("largeTargetsSetting").checked = Boolean(state.settings.largeTargets);
  $("reduceClutterSetting").checked = Boolean(state.settings.reduceClutter);
  $("defaultMilk").value = state.settings.defaultMilk || "";
  $("defaultSweetness").value = state.settings.defaultSweetness || "";
  $("defaultSize").value = state.settings.defaultSize || "";
  $("defaultAddOns").value = state.settings.defaultAddOns || "";
}

function saveSettingsForm(event) {
  event.preventDefault();
  state.settings.defaultMilk = $("defaultMilk").value;
  state.settings.defaultSweetness = $("defaultSweetness").value;
  state.settings.defaultSize = $("defaultSize").value;
  state.settings.defaultAddOns = $("defaultAddOns").value.trim();
  persistSettings();
  closeSettings();
  showToast("Settings and matcha defaults saved.");
}

function resetDisplaySettings() {
  state.settings = {
    ...state.settings,
    theme: "light",
    textSize: "normal",
    highContrast: false,
    reduceMotion: false,
    readableFont: false,
    largeTargets: false,
    reduceClutter: false,
  };
  applySettings();
  updateSettingsControls();
  persistSettings();
  showToast("Display settings reset to the light scrapbook.");
}

function loadLocalSettings() {
  try {
    const stored = JSON.parse(localStorage.getItem(SETTINGS_KEY) || "{}");
    return normalizeSettings({ ...DEFAULT_SETTINGS, ...stored });
  } catch {
    return { ...DEFAULT_SETTINGS };
  }
}

function normalizeSettings(settings) {
  const next = { ...DEFAULT_SETTINGS, ...settings };
  if (!["light", "dark", "system"].includes(next.theme)) next.theme = "light";
  if (!["normal", "large", "xlarge"].includes(next.textSize)) next.textSize = "normal";
  for (const key of ["highContrast", "reduceMotion", "readableFont", "largeTargets", "reduceClutter", "tourComplete"]) {
    next[key] = Boolean(next[key]);
  }
  for (const key of ["defaultMilk", "defaultSweetness", "defaultSize", "defaultAddOns"]) {
    next[key] = typeof next[key] === "string" ? next[key].slice(0, 400) : "";
  }
  next.earnedAchievements = next.earnedAchievements && typeof next.earnedAchievements === "object" && !Array.isArray(next.earnedAchievements)
    ? next.earnedAchievements
    : {};
  return next;
}

function applySettings() {
  const root = document.documentElement;
  const systemDark = window.matchMedia?.("(prefers-color-scheme: dark)")?.matches;
  const resolvedTheme = state.settings.theme === "system" ? (systemDark ? "dark" : "light") : state.settings.theme;
  root.dataset.theme = resolvedTheme;
  root.dataset.textSize = state.settings.textSize;
  root.classList.toggle("high-contrast", Boolean(state.settings.highContrast));
  root.classList.toggle("reduce-motion", Boolean(state.settings.reduceMotion));
  root.classList.toggle("readable-font", Boolean(state.settings.readableFont));
  root.classList.toggle("large-targets", Boolean(state.settings.largeTargets));
  root.classList.toggle("reduce-clutter", Boolean(state.settings.reduceClutter));
  root.classList.toggle("motion-allowed", !state.settings.reduceMotion);
  const themeMeta = document.querySelector('meta[name="theme-color"]');
  if (themeMeta) themeMeta.content = resolvedTheme === "dark" ? "#2a1820" : "#f58aa8";
}

function persistSettings() {
  saveLocalSettings();
  clearTimeout(state.settingsSyncTimer);
  if (!state.user || !state.cloudAvailable) return;
  state.settingsSyncTimer = setTimeout(async () => {
    try {
      await fetch("/api/settings", {
        method: "PUT",
        headers: { "content-type": "application/json", accept: "application/json" },
        body: JSON.stringify({ settings: state.settings }),
      });
    } catch {
      // Local settings still apply.
    }
  }, 450);
}

function saveLocalSettings() {
  try {
    localStorage.setItem(SETTINGS_KEY, JSON.stringify(state.settings));
  } catch {
    // Current-session settings still work.
  }
}

function maybeOpenFirstLaunchTour() {
  const localComplete = localStorage.getItem(TOUR_KEY) === "1";
  if (!state.settings.tourComplete && !localComplete) {
    setTimeout(() => openTour(0), 350);
  }
}

function openTour(index = 0) {
  setTourStep(index);
  $("tourDialog").showModal();
}

function setTourStep(index) {
  state.tourIndex = Math.max(0, Math.min(TOUR_STEPS.length - 1, index));
  const step = TOUR_STEPS[state.tourIndex];
  $("tourArt").textContent = step.icon;
  $("tourStepLabel").textContent = `page ${state.tourIndex + 1} of ${TOUR_STEPS.length}`;
  $("tourTitle").textContent = step.title;
  $("tourBody").textContent = step.body;
  $("tourBackButton").disabled = state.tourIndex === 0;
  $("tourNextButton").textContent = state.tourIndex === TOUR_STEPS.length - 1 ? "Log a Matcha" : "Next";
  $("tourDots").innerHTML = TOUR_STEPS.map((_, itemIndex) => `<span class="tour-dot ${itemIndex === state.tourIndex ? "is-active" : ""}"></span>`).join("");
}

function completeTour() {
  if ($("tourDialog").open) $("tourDialog").close();
  state.settings.tourComplete = true;
  try { localStorage.setItem(TOUR_KEY, "1"); } catch {}
  persistSettings();
}
