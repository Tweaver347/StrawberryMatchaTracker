"use strict";

(function protectCloudOnlyQuickWinActions() {
  const baseArchive = archiveEntryQuickWin;
  archiveEntryQuickWin = async function safeArchive(entryId) {
    const entry = state.entries.find((item) => item.id === entryId);
    if (entry?.shareCommunity && state.user && !state.cloudAvailable) {
      showToast("Reconnect before archiving a published memory so it can be made private first.");
      return;
    }
    return baseArchive(entryId);
  };

  const baseDelete = deleteEntryQuickWin;
  deleteEntryQuickWin = async function safeDelete(entryId) {
    const entry = state.entries.find((item) => item.id === entryId);
    if (entry && state.user && !state.cloudAvailable && !entry.syncPending) {
      showToast("Reconnect before permanently deleting a cloud-synced memory.");
      return;
    }
    return baseDelete(entryId);
  };

  const baseManage = runManageAction;
  runManageAction = async function safeBulkAction(action) {
    if (state.user && !state.cloudAvailable && ["publish", "private", "delete"].includes(action)) {
      showToast("Reconnect before changing cloud privacy or deleting synced memories.");
      return;
    }
    if (state.user && !state.cloudAvailable && action === "archive") {
      const hasPublished = [...state.quickWins.manageSelection].some((id) => state.entries.find((entry) => entry.id === id)?.shareCommunity);
      if (hasPublished) {
        showToast("Reconnect before archiving published memories so they can be made private first.");
        return;
      }
    }
    return baseManage(action);
  };

  const baseToggleSharing = toggleEntrySharing;
  toggleEntrySharing = async function safeSharingToggle(entry) {
    if (state.user && !state.cloudAvailable) {
      showToast("Reconnect before changing a memory's community visibility.");
      return;
    }
    return baseToggleSharing(entry);
  };
})();