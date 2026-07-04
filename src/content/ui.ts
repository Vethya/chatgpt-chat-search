const TOAST_STATUS_MS = 2000;
const TOAST_EXIT_MS = 180;

import type { ContentUi, IconRegistry, ToastTone, SyncOverlayMode } from "./types.js";

interface CreateContentUiOptions {
  documentRef?: Document;
  icon: IconRegistry;
  shortcutLabel: string;
}

export function createContentUi({ documentRef = document, icon, shortcutLabel }: CreateContentUiOptions): ContentUi {
  const toastIcons = {
    error: icon.xCircle,
    info: icon.infoCircle,
    success: icon.checkCircle,
    warning: icon.alertTriangle
  };

  const root = documentRef.createElement("div");
  root.id = "cgcs-root";
  root.innerHTML = `
    <button class="cgcs-entry" type="button" title="Search conversations">
      ${icon.search}
      <span>Search</span>
      <kbd class="cgcs-shortcut">${shortcutLabel}</kbd>
    </button>
    <div class="cgcs-modal-backdrop" hidden>
      <section class="cgcs-modal" role="dialog" aria-modal="true" aria-label="Conversation search">
        <div class="cgcs-toolbar">
          <div class="cgcs-input-wrap">
            <input class="cgcs-input" type="search" placeholder="Search conversations" autocomplete="off" />
            <button class="cgcs-clear-search" type="button" title="Clear search" aria-label="Clear search" hidden>${icon.x}</button>
          </div>
          <div class="cgcs-sync-actions" aria-label="Sync actions">
            <button class="cgcs-small cgcs-primary cgcs-quick-sync" type="button" title="Adds new or changed conversations from the top of the sidebar.">${icon.refresh}<span>Sync recent</span></button>
            <button class="cgcs-small cgcs-sync" type="button" title="Scans the full sidebar and rebuilds the local index.">${icon.database}<span>Full sync</span></button>
          </div>
        </div>
        <div class="cgcs-status-row">
          <div class="cgcs-status"></div>
          <button class="cgcs-icon-button cgcs-info" type="button" title="Explain index actions" aria-label="Explain index actions">
            ${icon.help}
          </button>
        </div>
        <div class="cgcs-empty-state" hidden></div>
        <ol class="cgcs-results"></ol>
        <div class="cgcs-actions">
          <button class="cgcs-small cgcs-import" type="button" title="Import">${icon.upload}<span>Import</span></button>
          <button class="cgcs-small cgcs-export" type="button" title="Export">${icon.download}<span>Export</span></button>
          <button class="cgcs-small cgcs-danger cgcs-reset" type="button" title="Clear index">${icon.trash}<span>Clear index</span></button>
        </div>
      </section>
    </div>
    <div class="cgcs-help-backdrop" hidden>
      <section class="cgcs-help-dialog" role="dialog" aria-modal="true" aria-labelledby="cgcs-help-title">
        <div class="cgcs-help-header">
          <h2 id="cgcs-help-title">Index actions</h2>
          <button class="cgcs-icon-button cgcs-help-close" type="button" title="Close" aria-label="Close">
            ${icon.x}
          </button>
        </div>
        <div class="cgcs-help-list" role="list">
          <article class="cgcs-help-card" role="listitem">
            <span class="cgcs-help-icon" aria-hidden="true">${icon.sparkles}</span>
            <div class="cgcs-help-copy">
              <h3>Automatic indexing</h3>
              <p>Chats you open or start are saved to the local index automatically. You usually do not need to sync manually.</p>
            </div>
          </article>
          <article class="cgcs-help-card" role="listitem">
            <span class="cgcs-help-icon" aria-hidden="true">${icon.refresh}</span>
            <div class="cgcs-help-copy">
              <h3>Sync recent</h3>
              <p>Adds new or changed conversations from the top of the sidebar. Best for everyday updates.</p>
            </div>
          </article>
          <article class="cgcs-help-card" role="listitem">
            <span class="cgcs-help-icon" aria-hidden="true">${icon.database}</span>
            <div class="cgcs-help-copy">
              <h3>Full sync</h3>
              <p>Scans the full sidebar and rebuilds the local index for the current ChatGPT account.</p>
            </div>
          </article>
          <article class="cgcs-help-card" role="listitem">
            <span class="cgcs-help-icon" aria-hidden="true">${icon.upload}</span>
            <div class="cgcs-help-copy">
              <h3>Import</h3>
              <p>Loads a previously exported JSON backup into the local browser index.</p>
            </div>
          </article>
          <article class="cgcs-help-card" role="listitem">
            <span class="cgcs-help-icon" aria-hidden="true">${icon.download}</span>
            <div class="cgcs-help-copy">
              <h3>Export</h3>
              <p>Downloads the local index as JSON. Conversation contents are not included.</p>
            </div>
          </article>
          <article class="cgcs-help-card is-danger" role="listitem">
            <span class="cgcs-help-icon" aria-hidden="true">${icon.trash}</span>
            <div class="cgcs-help-copy">
              <h3>Clear index</h3>
              <p>Deletes only this account's local search index after confirmation. It does not delete ChatGPT conversations.</p>
            </div>
          </article>
        </div>
      </section>
    </div>
    <div class="cgcs-sync-overlay" hidden>
      <div class="cgcs-sync-card">
        <div class="cgcs-sync-visual" aria-hidden="true"></div>
        <strong class="cgcs-sync-title">Preparing sync</strong>
        <p class="cgcs-sync-summary">Your current index stays unchanged until sync finishes.</p>
        <p class="cgcs-sync-detail" role="status" aria-live="polite">Preparing...</p>
        <button class="cgcs-cancel" type="button">${icon.x}<span>Cancel</span></button>
      </div>
    </div>
    <div class="cgcs-toast" role="status" hidden>
      <span class="cgcs-toast-icon" aria-hidden="true"></span>
      <span class="cgcs-toast-message"></span>
    </div>
  `;
  documentRef.documentElement.append(root);

  const elements = {
    root,
    entryButton: requiredElement<HTMLButtonElement>(root, ".cgcs-entry"),
    modalBackdrop: requiredElement<HTMLDivElement>(root, ".cgcs-modal-backdrop"),
    modal: requiredElement<HTMLElement>(root, ".cgcs-modal"),
    input: requiredElement<HTMLInputElement>(root, ".cgcs-input"),
    clearSearchButton: requiredElement<HTMLButtonElement>(root, ".cgcs-clear-search"),
    status: requiredElement<HTMLDivElement>(root, ".cgcs-status"),
    emptyState: requiredElement<HTMLDivElement>(root, ".cgcs-empty-state"),
    toast: requiredElement<HTMLDivElement>(root, ".cgcs-toast"),
    toastIcon: requiredElement<HTMLSpanElement>(root, ".cgcs-toast-icon"),
    toastMessage: requiredElement<HTMLSpanElement>(root, ".cgcs-toast-message"),
    resultsList: requiredElement<HTMLOListElement>(root, ".cgcs-results"),
    infoButton: requiredElement<HTMLButtonElement>(root, ".cgcs-info"),
    quickSyncButton: requiredElement<HTMLButtonElement>(root, ".cgcs-quick-sync"),
    syncButton: requiredElement<HTMLButtonElement>(root, ".cgcs-sync"),
    importButton: requiredElement<HTMLButtonElement>(root, ".cgcs-import"),
    exportButton: requiredElement<HTMLButtonElement>(root, ".cgcs-export"),
    resetButton: requiredElement<HTMLButtonElement>(root, ".cgcs-reset"),
    helpBackdrop: requiredElement<HTMLDivElement>(root, ".cgcs-help-backdrop"),
    helpCloseButton: requiredElement<HTMLButtonElement>(root, ".cgcs-help-close"),
    syncOverlay: requiredElement<HTMLDivElement>(root, ".cgcs-sync-overlay"),
    syncVisual: requiredElement<HTMLDivElement>(root, ".cgcs-sync-visual"),
    syncTitle: requiredElement<HTMLElement>(root, ".cgcs-sync-title"),
    syncSummary: requiredElement<HTMLParagraphElement>(root, ".cgcs-sync-summary"),
    syncDetail: requiredElement<HTMLParagraphElement>(root, ".cgcs-sync-detail"),
    cancelButton: requiredElement<HTMLButtonElement>(root, ".cgcs-cancel")
  };

  let toastTimer: number | null = null;
  let toastExitTimer: number | null = null;

  return {
    ...elements,
    closeSearch() {
      this.closeHelp({ restoreFocus: false });
      elements.modalBackdrop.hidden = true;
    },
    openHelp() {
      elements.helpBackdrop.hidden = false;
      elements.helpCloseButton.focus();
    },
    closeHelp({ restoreFocus = true } = {}) {
      elements.helpBackdrop.hidden = true;
      if (restoreFocus) elements.infoButton.focus();
    },
    updateSearchClearButton() {
      elements.clearSearchButton.hidden = elements.input.value.length === 0;
    },
    showToast(message: string, tone: ToastTone = "info") {
      if (toastTimer) window.clearTimeout(toastTimer);
      if (toastExitTimer) window.clearTimeout(toastExitTimer);
      elements.toast.className = `cgcs-toast is-${tone}`;
      elements.toastIcon.innerHTML = toastIcons[tone] || toastIcons.info;
      elements.toastMessage.textContent = message;
      elements.toast.hidden = false;
      toastTimer = window.setTimeout(() => {
        toastTimer = null;
        elements.toast.classList.toggle("is-exiting", true);
        toastExitTimer = window.setTimeout(() => {
          toastExitTimer = null;
          elements.toast.hidden = true;
          elements.toastIcon.textContent = "";
          elements.toastMessage.textContent = "";
          elements.toast.classList.toggle("is-exiting", false);
        }, TOAST_EXIT_MS);
      }, TOAST_STATUS_MS);
    },
    showSyncOverlay(mode: SyncOverlayMode) {
      const isRecent = mode === "recent";
      elements.syncVisual.innerHTML = isRecent ? icon.refresh : icon.database;
      elements.syncTitle.textContent = isRecent ? "Syncing recent chats" : "Rebuilding search index";
      elements.syncSummary.textContent = isRecent
        ? "Adding new sidebar chats without rebuilding everything."
        : "Scanning your sidebar and refreshing the local search index.";
      elements.syncDetail.textContent = "Preparing your sidebar...";
      elements.syncOverlay.hidden = false;
    },
    updateSyncDetail(message: string) {
      elements.syncDetail.textContent = message;
    },
    setActionButtonsDisabled(disabled: boolean) {
      for (const button of [elements.quickSyncButton, elements.syncButton, elements.importButton, elements.exportButton, elements.resetButton]) {
        button.disabled = disabled;
        button.classList.toggle("is-busy", disabled);
      }
    }
  };
}

function requiredElement<T extends Element>(root: ParentNode, selector: string): T {
  const element = root.querySelector(selector);
  if (!element) throw new Error(`Missing content UI element: ${selector}`);
  return element as T;
}
