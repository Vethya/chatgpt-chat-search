import type { IconRegistry } from "./icons.js";

const TOAST_STATUS_MS = 2000;
const TOAST_EXIT_MS = 180;

export type ToastTone = "info" | "warning" | "success" | "error";

export interface ContentUiDeps {
  documentRef?: Document;
  icon: IconRegistry;
  shortcutLabel: string;
}

export interface ContentUiElements {
  root: HTMLDivElement;
  entryButton: HTMLButtonElement;
  modalBackdrop: HTMLDivElement;
  modal: HTMLElement;
  input: HTMLInputElement;
  clearSearchButton: HTMLButtonElement;
  status: HTMLElement;
  emptyState: HTMLElement;
  toast: HTMLElement;
  toastIcon: HTMLElement;
  toastMessage: HTMLElement;
  resultsList: HTMLOListElement;
  infoButton: HTMLButtonElement;
  quickSyncButton: HTMLButtonElement;
  syncButton: HTMLButtonElement;
  importButton: HTMLButtonElement;
  exportButton: HTMLButtonElement;
  resetButton: HTMLButtonElement;
  helpBackdrop: HTMLDivElement;
  helpCloseButton: HTMLButtonElement;
  syncOverlay: HTMLDivElement;
  syncVisual: HTMLElement;
  syncTitle: HTMLElement;
  syncSummary: HTMLElement;
  syncDetail: HTMLElement;
  cancelButton: HTMLButtonElement;
}

export interface ContentUi extends ContentUiElements {
  closeSearch(): void;
  openHelp(): void;
  closeHelp(options?: { restoreFocus?: boolean }): void;
  updateSearchClearButton(): void;
  showToast(message: string, tone?: ToastTone): void;
  showSyncOverlay(mode: "recent" | "full"): void;
  updateSyncDetail(message: string): void;
  setActionButtonsDisabled(disabled: boolean): void;
}

export function createContentUi({ documentRef = document, icon, shortcutLabel }: ContentUiDeps): ContentUi {
  const toastIcons: Record<ToastTone, string> = {
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

  const elements: ContentUiElements = {
    root,
    entryButton: requiredChild(root, ".cgcs-entry"),
    modalBackdrop: requiredChild(root, ".cgcs-modal-backdrop"),
    modal: requiredChild(root, ".cgcs-modal"),
    input: requiredChild(root, ".cgcs-input"),
    clearSearchButton: requiredChild(root, ".cgcs-clear-search"),
    status: requiredChild(root, ".cgcs-status"),
    emptyState: requiredChild(root, ".cgcs-empty-state"),
    toast: requiredChild(root, ".cgcs-toast"),
    toastIcon: requiredChild(root, ".cgcs-toast-icon"),
    toastMessage: requiredChild(root, ".cgcs-toast-message"),
    resultsList: requiredChild(root, ".cgcs-results"),
    infoButton: requiredChild(root, ".cgcs-info"),
    quickSyncButton: requiredChild(root, ".cgcs-quick-sync"),
    syncButton: requiredChild(root, ".cgcs-sync"),
    importButton: requiredChild(root, ".cgcs-import"),
    exportButton: requiredChild(root, ".cgcs-export"),
    resetButton: requiredChild(root, ".cgcs-reset"),
    helpBackdrop: requiredChild(root, ".cgcs-help-backdrop"),
    helpCloseButton: requiredChild(root, ".cgcs-help-close"),
    syncOverlay: requiredChild(root, ".cgcs-sync-overlay"),
    syncVisual: requiredChild(root, ".cgcs-sync-visual"),
    syncTitle: requiredChild(root, ".cgcs-sync-title"),
    syncSummary: requiredChild(root, ".cgcs-sync-summary"),
    syncDetail: requiredChild(root, ".cgcs-sync-detail"),
    cancelButton: requiredChild(root, ".cgcs-cancel")
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
    showSyncOverlay(mode: "recent" | "full") {
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

function requiredChild<T extends Element>(root: Element, selector: string): T {
  const element = root.querySelector<T>(selector);
  if (!element) throw new Error(`Missing UI element: ${selector}`);
  return element;
}
