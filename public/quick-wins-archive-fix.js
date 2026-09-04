"use strict";

(function keepArchivedMemoriesOutOfActiveViews() {
  const baseBuildPlaceGroups = buildPlaceGroups;
  buildPlaceGroups = function buildActivePlaceGroups(entries) {
    return baseBuildPlaceGroups((entries || []).filter((entry) => !isQuickWinArchived(entry)));
  };

  const quickWinProfileRender = renderProfile;
  renderProfile = function renderProfileWithoutArchivedStats() {
    const allEntries = state.entries;
    state.entries = allEntries.filter((entry) => !isQuickWinArchived(entry));
    try {
      quickWinProfileRender();
    } finally {
      state.entries = allEntries;
    }
    renderArchive();
  };

  const safety = document.createElement("script");
  safety.src = "/quick-wins-safety.js";
  safety.async = false;
  document.head.appendChild(safety);
})();