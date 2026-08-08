import { sendMessage } from "./runtime.js";
import type { ContentUi } from "./ui.js";
import type { ContentScriptState, ConversationRecord } from "../shared/types.js";

const AUTO_INDEX_DEBOUNCE_MS = 1200;
const AUTO_INDEX_POLL_MS = 2500;

export interface AutoIndexerDeps {
  detectAccountIdentity: (documentRef: Document) => Promise<string | null>;
  extractConversationAnchorTitle: (anchor: HTMLAnchorElement | null | undefined) => string | null;
  getAnchorHref: (anchor: HTMLAnchorElement | null | undefined) => string | null;
  isNonConversationTitle: (title: string | null | undefined) => boolean;
  mergeRecentRecords: (
    existingRecords: ConversationRecord[],
    incomingRecords: ConversationRecord[]
  ) => ConversationRecord[];
  normalizeConversationUrl: (href: string | null | undefined, origin?: string) => string | null;
  renderResults: () => void;
  sendMessage: typeof sendMessage;
  state: ContentScriptState;
  ui: ContentUi;
}

interface CurrentConversationTitle {
  title: string;
  source: "anchor" | "document";
}

export interface AutoIndexer {
  startAutomaticIndexing(): void;
}

export function createAutoIndexer({
  detectAccountIdentity,
  extractConversationAnchorTitle,
  getAnchorHref,
  isNonConversationTitle,
  mergeRecentRecords,
  normalizeConversationUrl,
  renderResults,
  sendMessage: send,
  state,
  ui
}: AutoIndexerDeps): AutoIndexer {
  function startAutomaticIndexing(): void {
    const observer = new MutationObserver(() => scheduleAutoIndexCurrentConversation());
    observer.observe(document.documentElement, {
      childList: true,
      subtree: true,
      characterData: true,
      attributes: true,
      attributeFilter: ["href", "aria-label", "title"]
    });

    window.addEventListener("popstate", () => scheduleAutoIndexCurrentConversation(0));
    window.addEventListener("hashchange", () => scheduleAutoIndexCurrentConversation(0));
    window.setInterval(() => scheduleAutoIndexCurrentConversation(), AUTO_INDEX_POLL_MS);
    scheduleAutoIndexCurrentConversation(0);
  }

  function scheduleAutoIndexCurrentConversation(delay = AUTO_INDEX_DEBOUNCE_MS): void {
    window.clearTimeout(state.autoIndexTimer ?? undefined);
    state.autoIndexTimer = window.setTimeout(() => {
      state.autoIndexTimer = null;
      autoIndexCurrentConversation().catch(() => {});
    }, delay);
  }

  async function autoIndexCurrentConversation(): Promise<void> {
    if (state.syncCancel) return;

    const record = await buildCurrentConversationRecord();
    if (!record) return;

    const indexKey = `${record.accountId}|${record.url}|${record.title}`;
    if (state.lastAutoIndexedKey === indexKey) return;

    await send({ type: "records:upsert", accountId: record.accountId, records: [record] });
    state.lastAutoIndexedKey = indexKey;

    if (!state.accountId || state.accountId === record.accountId) {
      state.accountId = record.accountId;
      state.records = mergeRecentRecords(state.records, [record]);
      if (!ui.modalBackdrop.hidden) renderResults();
    }
  }

  async function buildCurrentConversationRecord(): Promise<ConversationRecord | null> {
    const url = normalizeConversationUrl(location.href, location.origin);
    if (!url) return null;
    updateObservedConversationState(url);

    const titleResult = findCurrentConversationTitle(url);
    if (!titleResult) return null;
    if (titleResult.source === "document" && state.documentTitleChangedAt < state.conversationUrlChangedAt) return null;

    const accountId = await detectAccountIdentity(document);
    if (!accountId) return null;

    return {
      accountId,
      url,
      title: titleResult.title,
      order: 0,
      syncedAt: Date.now()
    };
  }

  function updateObservedConversationState(url: string): void {
    const now = Date.now();
    if (state.currentConversationUrl !== url) {
      state.currentConversationUrl = url;
      state.conversationUrlChangedAt = now;
      state.lastAutoIndexedKey = "";
    }
    if (state.lastDocumentTitle !== document.title) {
      state.lastDocumentTitle = document.title;
      state.documentTitleChangedAt = now;
    }
  }

  function findCurrentConversationTitle(url: string): CurrentConversationTitle | null {
    const currentAnchor = Array.from(document.querySelectorAll<HTMLAnchorElement>("a[href]")).find((anchor) =>
      normalizeConversationUrl(getAnchorHref(anchor), location.origin) === url &&
      isUsableConversationAnchor(anchor)
    );
    const anchorTitle = cleanConversationTitle(extractElementTitle(currentAnchor));
    if (anchorTitle) return { title: anchorTitle, source: "anchor" };

    const documentTitle = cleanConversationTitle(document.title);
    if (documentTitle) return { title: documentTitle, source: "document" };

    return null;
  }

  function extractElementTitle(element: HTMLAnchorElement | null | undefined): string {
    if (!element) return "";
    return extractConversationAnchorTitle(element) || "";
  }

  function cleanConversationTitle(value: string | null | undefined): string {
    const title = String(value || "")
      .replace(/\s+/g, " ")
      .replace(/^ChatGPT\s*[-|]\s*/i, "")
      .replace(/\s*[-|]\s*ChatGPT$/i, "")
      .trim();
    if (isNonConversationTitle(title)) return "";
    return title;
  }

  function isUsableConversationAnchor(anchor: HTMLAnchorElement): boolean {
    if (!anchor || anchor.closest("#cgcs-root")) return false;
    if (!isVisible(anchor)) return false;
    if (!normalizeConversationUrl(getAnchorHref(anchor), location.origin)) return false;
    return Boolean(extractConversationAnchorTitle(anchor));
  }

  return {
    startAutomaticIndexing
  };
}

function isVisible(element: Element): boolean {
  const rect = element.getBoundingClientRect();
  return rect.width > 0 && rect.height > 0;
}
