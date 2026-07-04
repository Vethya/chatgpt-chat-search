import type {
  AccountId,
  ConversationRecord,
  ConversationRecordInput,
  RuntimeMessage,
  RuntimeMessageResult,
  SearchResult
} from "../types.js";

export type CancelSync = () => void;
export type Sleep = (ms: number) => Promise<void>;
export type SendMessage = <T extends RuntimeMessage>(message: T) => Promise<RuntimeMessageResult<T>>;

export interface ContentState {
  accountId: AccountId | null;
  records: ConversationRecord[];
  results: SearchResult[];
  selectedIndex: number;
  query: string;
  syncCancel: CancelSync | null;
  autoIndexTimer: number | null;
  lastAutoIndexedKey: string;
  currentConversationUrl: string;
  conversationUrlChangedAt: number;
  lastDocumentTitle: string;
  documentTitleChangedAt: number;
}

export type IconName =
  | "alertTriangle"
  | "checkCircle"
  | "database"
  | "download"
  | "help"
  | "infoCircle"
  | "refresh"
  | "search"
  | "sparkles"
  | "trash"
  | "upload"
  | "x"
  | "xCircle";

export type IconRegistry = Record<IconName, string>;

export type ToastTone = "error" | "info" | "success" | "warning";
export type SyncOverlayMode = "full" | "recent";

export interface ContentUi {
  root: HTMLDivElement;
  entryButton: HTMLButtonElement;
  modalBackdrop: HTMLDivElement;
  modal: HTMLElement;
  input: HTMLInputElement;
  clearSearchButton: HTMLButtonElement;
  status: HTMLDivElement;
  emptyState: HTMLDivElement;
  toast: HTMLDivElement;
  toastIcon: HTMLSpanElement;
  toastMessage: HTMLSpanElement;
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
  syncVisual: HTMLDivElement;
  syncTitle: HTMLElement;
  syncSummary: HTMLParagraphElement;
  syncDetail: HTMLParagraphElement;
  cancelButton: HTMLButtonElement;
  closeSearch(): void;
  openHelp(): void;
  closeHelp(options?: { restoreFocus?: boolean }): void;
  updateSearchClearButton(): void;
  showToast(message: string, tone?: ToastTone): void;
  showSyncOverlay(mode: SyncOverlayMode): void;
  updateSyncDetail(message: string): void;
  setActionButtonsDisabled(disabled: boolean): void;
}

export interface CurrentConversationTitle {
  title: string;
  source: "anchor" | "document";
}

export type ConversationRecordMap = Map<string, ConversationRecord>;
export type ConversationRecordInputMap = Map<string, ConversationRecordInput>;
