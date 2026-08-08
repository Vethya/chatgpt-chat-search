import { detectAccountIdentity } from "../shared/account.js";
import {
  extractConversationAnchorTitle,
  extractConversationRecordsFromDocument,
  getAnchorHref,
  isNonConversationTitle,
  normalizeConversationUrl
} from "../shared/extract.js";
import { mergeRecentRecords } from "../shared/importExport.js";
import { compareRecordOrder } from "../shared/order.js";
import { RECENT_KNOWN_STOP_THRESHOLD, rememberRecentVisibleRecords } from "../shared/recentSync.js";
import { searchConversations } from "../shared/search.js";
import { isSuspiciouslySmallSync } from "../shared/syncIntegrity.js";
import { applyThemeAttribute, CHATGPT_THEME_STORAGE_KEY, detectChatGptTheme } from "../shared/theme.js";
import { isUiMessage } from "../shared/types.js";
import type { ContentScriptState } from "../shared/types.js";
import { formatConversationCount, formatNumber, getShortcutLabel } from "../utils/format.js";
import { createContentActions } from "./actions.js";
import { createAutoIndexer } from "./autoIndex.js";
import { createIconRegistry } from "./icons.js";
import { sendMessage, sleep } from "./runtime.js";
import { createSidebarScanner } from "./sidebarScan.js";
import { createSyncController } from "./sync.js";
import { createContentUi } from "./ui.js";

export async function startContentScript(): Promise<void> {
  const state: ContentScriptState = {
    accountId: null,
    records: [],
    results: [],
    selectedIndex: 0,
    query: "",
    syncCancel: null,
    autoIndexTimer: null,
    lastAutoIndexedKey: "",
    currentConversationUrl: "",
    conversationUrlChangedAt: 0,
    lastDocumentTitle: "",
    documentTitleChangedAt: 0
  };
  const icon = createIconRegistry();
  const ui = createContentUi({ icon, shortcutLabel: getShortcutLabel() });
  syncTheme({ root: ui.root });
  const actions = createContentActions({
    detectAccountIdentity,
    formatConversationCount,
    formatNumber,
    icon,
    mergeRecentRecords,
    searchConversations,
    sendMessage,
    state,
    ui
  });
  const scanner = createSidebarScanner({
    compareRecordOrder,
    extractConversationAnchorTitle,
    extractConversationRecordsFromDocument,
    formatConversationCount,
    getAnchorHref,
    normalizeConversationUrl,
    rememberRecentVisibleRecords,
    sleep,
    updateSyncDetail: ui.updateSyncDetail
  });
  const sync = createSyncController({
    detectAccountIdentity,
    formatConversationCount,
    isSuspiciouslySmallSync,
    mergeRecentRecords,
    recentKnownStopThreshold: RECENT_KNOWN_STOP_THRESHOLD,
    scanner,
    sendMessage,
    sleep,
    state,
    ui,
    renderResults: actions.renderResults
  });
  const autoIndexer = createAutoIndexer({
    detectAccountIdentity,
    extractConversationAnchorTitle,
    getAnchorHref,
    isNonConversationTitle,
    mergeRecentRecords,
    normalizeConversationUrl,
    renderResults: actions.renderResults,
    sendMessage,
    state,
    ui
  });

  ui.entryButton.addEventListener("click", actions.openSearch);
  ui.infoButton.addEventListener("click", ui.openHelp);
  ui.quickSyncButton.addEventListener("click", sync.runRecentConversationSync);
  ui.syncButton.addEventListener("click", sync.runConversationSync);
  ui.importButton.addEventListener("click", actions.importIndex);
  ui.exportButton.addEventListener("click", actions.exportIndex);
  ui.resetButton.addEventListener("click", actions.resetIndex);
  ui.helpCloseButton.addEventListener("click", () => ui.closeHelp());
  ui.cancelButton.addEventListener("click", () => state.syncCancel?.());
  ui.input.addEventListener("input", () => {
    state.query = ui.input.value;
    ui.updateSearchClearButton();
    actions.renderResults();
  });
  ui.clearSearchButton.addEventListener("click", actions.clearSearch);
  ui.input.addEventListener("keydown", actions.handleSearchKeydown);

  document.addEventListener("keydown", (event) => {
    if (event.key !== "Escape") return;
    if (!ui.helpBackdrop.hidden) {
      event.preventDefault();
      ui.closeHelp();
      return;
    }
    if (!ui.modalBackdrop.hidden) {
      ui.closeSearch();
    }
  });

  ui.modalBackdrop.addEventListener("click", (event) => {
    if (event.target === ui.modalBackdrop) ui.closeSearch();
  });
  ui.helpBackdrop.addEventListener("click", (event) => {
    if (event.target === ui.helpBackdrop) ui.closeHelp();
  });

  chrome.runtime.onMessage.addListener((message) => {
    if (!isUiMessage(message)) return;
    if (message.type === "ui:openSearch") actions.openSearch();
    else actions.toggleSearch();
  });

  autoIndexer.startAutomaticIndexing();
}

interface SyncThemeOptions {
  documentRef?: Document;
  root: Element;
  storageArea?: chrome.storage.LocalStorageArea;
  windowRef?: Window;
}

function syncTheme({
  documentRef = document,
  root,
  storageArea = chrome.storage?.local,
  windowRef = window
}: SyncThemeOptions): void {
  const detectedTheme = detectChatGptTheme(documentRef, windowRef);
  if (!detectedTheme) return;

  const theme = applyThemeAttribute(root, detectedTheme);
  try {
    storageArea?.set?.({ [CHATGPT_THEME_STORAGE_KEY]: theme });
  } catch {
    // The content UI should still theme correctly if extension storage is unavailable.
  }
}
