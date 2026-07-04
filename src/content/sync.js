import { MSG_MISSING_ACCOUNT } from "./actions.js";

export function createSyncController({
  detectAccountIdentity,
  formatConversationCount,
  isSuspiciouslySmallSync,
  mergeRecentRecords,
  recentKnownStopThreshold,
  scanner,
  sendMessage,
  sleep,
  state,
  ui,
  renderResults
}) {
  async function runConversationSync() {
    state.accountId = await detectAccountIdentity(document);
    if (!state.accountId) {
      ui.status.textContent = MSG_MISSING_ACCOUNT;
      ui.showToast(MSG_MISSING_ACCOUNT, "warning");
      return;
    }
    const scrollContainer = scanner.findSidebarScrollContainer();
    if (!scrollContainer) {
      const message = "Open the ChatGPT sidebar, then try sync again.";
      ui.status.textContent = message;
      ui.showToast(message, "warning");
      return;
    }

    const syncedAt = Date.now();
    const foundByUrl = new Map();
    let cancelled = false;
    state.syncCancel = () => {
      cancelled = true;
    };

    try {
      ui.setActionButtonsDisabled(true);
      ui.showSyncOverlay("full");
      scrollContainer.scrollTop = 0;
      await sleep(500);
      scanner.rememberVisibleRecords(scrollContainer, foundByUrl, state.accountId, syncedAt);

      await scanner.scanConversationList(scrollContainer, foundByUrl, state.accountId, syncedAt, () => cancelled);
      await scanner.scanProjectSections(scrollContainer, foundByUrl, state.accountId, syncedAt, () => cancelled);

      const records = scanner.getSortedRecords(foundByUrl);
      if (records.length === 0) throw new Error("Sync could not find sidebar conversations.");
      if (isSuspiciouslySmallSync(state.records.length, records.length)) {
        throw new Error(`Sync found only ${formatConversationCount(records.length)}, but the current index has ${formatConversationCount(state.records.length)}.`);
      }
      await sendMessage({ type: "records:replace", accountId: state.accountId, records });
      state.records = records;
      const message = `Synced ${formatConversationCount(records.length)}.`;
      ui.status.textContent = message;
      renderResults();
      ui.showToast(message, "success");
    } catch (error) {
      const message = error.message === "Sync canceled."
        ? "Sync canceled. Previous index unchanged."
        : `${error.message} Previous index unchanged.`;
      ui.status.textContent = message;
      ui.showToast(message, error.message === "Sync canceled." ? "warning" : "error");
    } finally {
      ui.syncOverlay.hidden = true;
      state.syncCancel = null;
      ui.setActionButtonsDisabled(false);
    }
  }

  async function runRecentConversationSync() {
    state.accountId = await detectAccountIdentity(document);
    if (!state.accountId) {
      ui.status.textContent = MSG_MISSING_ACCOUNT;
      ui.showToast(MSG_MISSING_ACCOUNT, "warning");
      return;
    }
    const scrollContainer = scanner.findSidebarScrollContainer();
    if (!scrollContainer) {
      const message = "Open the ChatGPT sidebar, then try Sync recent again.";
      ui.status.textContent = message;
      ui.showToast(message, "warning");
      return;
    }

    state.records = await sendMessage({ type: "records:list", accountId: state.accountId });
    const knownUrls = new Set(state.records.map((record) => record.url));
    const syncedAt = Date.now();
    const foundByUrl = new Map();
    let cancelled = false;
    state.syncCancel = () => {
      cancelled = true;
    };

    try {
      ui.setActionButtonsDisabled(true);
      ui.showSyncOverlay("recent");
      scrollContainer.scrollTop = 0;
      await sleep(300);

      const hitKnownRecord = await scanner.scanRecentConversationList(
        scrollContainer,
        foundByUrl,
        knownUrls,
        state.accountId,
        syncedAt,
        () => cancelled,
        recentKnownStopThreshold
      );
      const records = scanner.getSortedRecords(foundByUrl);

      if (records.length === 0) {
        const message = hitKnownRecord
          ? "No new recent conversations found."
          : "No recent conversations found before quick sync stopped.";
        ui.status.textContent = message;
        renderResults();
        ui.showToast(message, "info");
        return;
      }

      await sendMessage({ type: "records:upsert", accountId: state.accountId, records });
      state.records = mergeRecentRecords(state.records, records);
      const message = `Synced ${formatConversationCount(records.length, "recent conversation")}.`;
      ui.status.textContent = message;
      renderResults();
      ui.showToast(message, "success");
    } catch (error) {
      const message = error.message === "Sync canceled."
        ? "Sync recent canceled. Previous index unchanged."
        : `${error.message} Previous index unchanged.`;
      ui.status.textContent = message;
      ui.showToast(message, error.message === "Sync canceled." ? "warning" : "error");
    } finally {
      ui.syncOverlay.hidden = true;
      state.syncCancel = null;
      ui.setActionButtonsDisabled(false);
    }
  }

  return {
    runConversationSync,
    runRecentConversationSync
  };
}
