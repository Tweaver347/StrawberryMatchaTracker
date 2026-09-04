"use strict";

async function init() {
  applySettings();
  buildStrawberryRating();
  bindEvents();
  await loadIdentity();
  await loadRemoteSettings();
  await loadData();
  renderAll();
  maybeOpenFirstLaunchTour();
}

function bindEvents() {
  document.querySelectorAll("[data-view]").forEach((button) => {
    button.addEventListener("click", () => switchView(button.dataset.view));
  });

  document.querySelectorAll("[data-log-matcha]").forEach((button) => {
    button.addEventListener("click", () => startLogMatcha());
  });

  $("openCameraButton").addEventListener("click", () => $("cameraInput").click());
  $("openLibraryButton").addEventListener("click", () => $("libraryInput").click());
  $("retakePhotoButton").addEventListener("click", () => $("cameraInput").click());
  $("chooseDifferentPhotoButton").addEventListener("click", () => $("libraryInput").click());
  $("cameraInput").addEventListener("change", (event) => handleSelectedPhoto(event, "camera"));
  $("libraryInput").addEventListener("change", (event) => handleSelectedPhoto(event, "library"));
  $("usePhotoButton").addEventListener("click", useSelectedPhoto);
  $("closeCaptureButton").addEventListener("click", closeCaptureDialog);
  $("captureDialog").addEventListener("cancel", (event) => {
    event.preventDefault();
    closeCaptureDialog();
  });

  $("useSuggestedPlaceButton").addEventListener("click", useSuggestedPlace);
  $("chooseAnotherPlaceButton").addEventListener("click", showManualPlacePanel);
  $("runPlaceSearchButton").addEventListener("click", searchPlaces);
  $("placeSearchInput").addEventListener("keydown", (event) => {
    if (event.key === "Enter") {
      event.preventDefault();
      searchPlaces();
    }
  });
  $("useManualPlaceButton").addEventListener("click", useManualPlace);
  $("dropPinButton").addEventListener("click", togglePlacePinMap);
  $("backToPlaceButton").addEventListener("click", () => setLogStep("place"));
  $("logMatchaSubmitButton").addEventListener("click", completeMatchaLog);
  $("saveDraftFromRatingButton").addEventListener("click", saveDraftAndClose);
  $("closeLogButton").addEventListener("click", saveDraftAndClose);
  $("logDialog").addEventListener("cancel", (event) => {
    event.preventDefault();
    saveDraftAndClose();
  });

  $("successViewButton").addEventListener("click", () => closeSuccessAndShowEntry(false));
  $("successDetailsButton").addEventListener("click", () => closeSuccessAndShowEntry(true));
  $("successDoneButton").addEventListener("click", closeSuccessDialog);
  $("successDialog").addEventListener("cancel", (event) => {
    event.preventDefault();
    closeSuccessDialog();
  });

  $("recentTrack").addEventListener("click", handleMemoryAction);
  $("memoryDialogContent").addEventListener("click", handleMemoryAction);
  $("favoritePlaceFeature").addEventListener("click", handleProfileFavoriteAction);
  $("publishedGrid").addEventListener("click", handlePublishedClick);
  $("draftList").addEventListener("click", handleDraftAction);
  $("favoritePlacesBoard").addEventListener("click", handlePlaceCardClick);
  $("avoidPlacesBoard").addEventListener("click", handlePlaceCardClick);
  $("allPlacesList").addEventListener("click", handlePlaceCardClick);
  $("placeDialogContent").addEventListener("click", handlePlaceDialogAction);
  $("achievementBoard").addEventListener("click", handleAchievementClick);

  $("closeMemoryDialog").addEventListener("click", () => $("memoryDialog").close());
  $("memoryDialog").addEventListener("cancel", (event) => {
    event.preventDefault();
    $("memoryDialog").close();
  });
  $("closePlaceDialog").addEventListener("click", () => $("placeDialog").close());
  $("placeDialog").addEventListener("cancel", (event) => {
    event.preventDefault();
    $("placeDialog").close();
  });

  $("placeFilterInput").addEventListener("input", renderAllPlaces);
  $("communityLayerToggle").addEventListener("change", (event) => {
    state.showCommunityLayer = event.target.checked;
    renderMapMarkers();
  });
  $("centerMapButton").addEventListener("click", centerMapOnUser);

  $("openSettingsButton").addEventListener("click", openSettings);
  $("closeSettingsButton").addEventListener("click", closeSettings);
  $("settingsDialog").addEventListener("cancel", (event) => {
    event.preventDefault();
    closeSettings();
  });
  $("settingsForm").addEventListener("submit", saveSettingsForm);
  $("restartTourButton").addEventListener("click", () => {
    state.settings.tourComplete = false;
    localStorage.removeItem(TOUR_KEY);
    persistSettings();
    closeSettings();
    openTour(0);
  });
  $("resetDisplaySettingsButton").addEventListener("click", resetDisplaySettings);

  document.querySelectorAll("[data-theme-option]").forEach((button) => {
    button.addEventListener("click", () => {
      state.settings.theme = button.dataset.themeOption;
      applySettings();
      updateSettingsControls();
      persistSettings();
    });
  });
  document.querySelectorAll("[data-text-option]").forEach((button) => {
    button.addEventListener("click", () => {
      state.settings.textSize = button.dataset.textOption;
      applySettings();
      updateSettingsControls();
      persistSettings();
    });
  });

  const switchBindings = [
    ["highContrastSetting", "highContrast"],
    ["reduceMotionSetting", "reduceMotion"],
    ["readableFontSetting", "readableFont"],
    ["largeTargetsSetting", "largeTargets"],
    ["reduceClutterSetting", "reduceClutter"],
  ];
  switchBindings.forEach(([id, key]) => {
    $(id).addEventListener("change", (event) => {
      state.settings[key] = event.target.checked;
      applySettings();
      persistSettings();
    });
  });

  $("tourButton").addEventListener("click", () => openTour(0));
  $("tourSkipButton").addEventListener("click", completeTour);
  $("closeTourButton").addEventListener("click", completeTour);
  $("tourBackButton").addEventListener("click", () => setTourStep(state.tourIndex - 1));
  $("tourNextButton").addEventListener("click", () => {
    if (state.tourIndex >= TOUR_STEPS.length - 1) {
      completeTour();
      startLogMatcha();
      return;
    }
    setTourStep(state.tourIndex + 1);
  });
  $("tourDialog").addEventListener("cancel", (event) => {
    event.preventDefault();
    completeTour();
  });

  $("editLibraryInput").addEventListener("change", (event) => handleEditPhoto(event, "library"));
  $("editCameraInput").addEventListener("change", (event) => handleEditPhoto(event, "camera"));

  const systemThemeQuery = window.matchMedia?.("(prefers-color-scheme: dark)");
  systemThemeQuery?.addEventListener?.("change", () => {
    if (state.settings.theme === "system") applySettings();
  });
}
