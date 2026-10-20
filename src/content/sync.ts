import { MSG_MISSING_ACCOUNT } from "./actions.js";
import { describeError } from "./runtime.js";
import type { sleep } from "./runtime.js";
import type { SidebarScanner } from "./sidebarScan.js";
import type { ContentUi } from "./ui.js";
import type { detectAccountIdentity } from "../shared/account.js";
import type { mergeRecentRecords } from "../shared/importExport.js";
import type { sendMessage } from "../shared/messaging.js";
import type { isSuspiciouslySmallSync } from "../shared/syncIntegrity.js";
import type { ContentScriptState, ConversationRecord } from "../shared/types.js";
import type { formatConversationCount } from "../utils/format.js";

export interface SyncControllerDeps {
  detectAccountIdentity: typeof detectAccountIdentity;
  formatConversationCount: typeof formatConversationCount;
  isSuspiciouslySmallSync: typeof isSuspiciouslySmallSync;
  mergeRecentRecords: typeof mergeRecentRecords;
  recentKnownStopThreshold: number;
  scanner: SidebarScanner;
  sendMessage: typeof sendMessage;
  sleep: typeof sleep;
  state: ContentScriptState;
  ui: ContentUi;
  renderResults: () => void;
}

export interface SyncController {
  runConversationSync(): Promise<void>;
  runRecentConversationSync(): Promise<void>;
}

export function createSyncController({
  detectAccountIdentity,
  formatConversationCount,
  isSuspiciouslySmallSync,
  mergeRecentRecords,
  recentKnownStopThreshold,
  scanner,
  sendMessage: send,
  sleep: wait,
  state,
  ui,
  renderResults
}: SyncControllerDeps): SyncController {
  async function runConversationSync(): Promise<void> {
    state.accountId = await detectAccountIdentity(document);
    const accountId = state.accountId;
    if (!accountId) {
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
    const foundByUrl = new Map<string, ConversationRecord>();
    let cancelled = false;
    state.syncCancel = () => {
      cancelled = true;
    };

    try {
      ui.setActionButtonsDisabled(true);
      ui.showSyncOverlay("full");
      scrollContainer.scrollTop = 0;
      await wait(500);
      scanner.rememberVisibleRecords(scrollContainer, foundByUrl, accountId, syncedAt);

      await scanner.scanConversationList(scrollContainer, foundByUrl, accountId, syncedAt, () => cancelled);
      await scanner.scanProjectSections(scrollContainer, foundByUrl, accountId, syncedAt, () => cancelled);

      const records = scanner.getSortedRecords(foundByUrl);
      if (records.length === 0) throw new Error("Sync could not find sidebar conversations.");
      if (isSuspiciouslySmallSync(state.records.length, records.length)) {
        throw new Error(`Sync found only ${formatConversationCount(records.length)}, but the current index has ${formatConversationCount(state.records.length)}.`);
      }
      await send({ type: "records:replace", accountId, records });
      state.records = records;
      const message = `Synced ${formatConversationCount(records.length)}.`;
      ui.status.textContent = message;
      renderResults();
      ui.showToast(message, "success");
    } catch (error) {
      const detail = describeError(error);
      const isCanceled = detail === "Sync canceled.";
      const message = isCanceled
        ? "Sync canceled. Previous index unchanged."
        : `${detail} Previous index unchanged.`;
      ui.status.textContent = message;
      ui.showToast(message, isCanceled ? "warning" : "error");
    } finally {
      ui.syncOverlay.hidden = true;
      state.syncCancel = null;
      ui.setActionButtonsDisabled(false);
    }
  }

  async function runRecentConversationSync(): Promise<void> {
    state.accountId = await detectAccountIdentity(document);
    const accountId = state.accountId;
    if (!accountId) {
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

    state.records = await send({ type: "records:list", accountId });
    const knownUrls = new Set(state.records.map((record) => record.url));
    const syncedAt = Date.now();
    const foundByUrl = new Map<string, ConversationRecord>();
    let cancelled = false;
    state.syncCancel = () => {
      cancelled = true;
    };

    try {
      ui.setActionButtonsDisabled(true);
      ui.showSyncOverlay("recent");
      scrollContainer.scrollTop = 0;
      await wait(300);

      const hitKnownRecord = await scanner.scanRecentConversationList(
        scrollContainer,
        foundByUrl,
        knownUrls,
        accountId,
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

      await send({ type: "records:upsert", accountId, records });
      state.records = mergeRecentRecords(state.records, records);
      const message = `Synced ${formatConversationCount(records.length, "recent conversation")}.`;
      ui.status.textContent = message;
      renderResults();
      ui.showToast(message, "success");
    } catch (error) {
      const detail = describeError(error);
      const isCanceled = detail === "Sync canceled.";
      const message = isCanceled
        ? "Sync recent canceled. Previous index unchanged."
        : `${detail} Previous index unchanged.`;
      ui.status.textContent = message;
      ui.showToast(message, isCanceled ? "warning" : "error");
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
