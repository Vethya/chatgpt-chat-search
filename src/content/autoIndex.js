const AUTO_INDEX_DEBOUNCE_MS = 1200;
const AUTO_INDEX_POLL_MS = 2500;

export function createAutoIndexer({
  detectAccountIdentity,
  extractConversationAnchorTitle,
  getAnchorHref,
  isNonConversationTitle,
  mergeRecentRecords,
  normalizeConversationUrl,
  renderResults,
  sendMessage,
  state,
  ui
}) {
  function startAutomaticIndexing() {
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

  function scheduleAutoIndexCurrentConversation(delay = AUTO_INDEX_DEBOUNCE_MS) {
    window.clearTimeout(state.autoIndexTimer);
    state.autoIndexTimer = window.setTimeout(() => {
      state.autoIndexTimer = null;
      autoIndexCurrentConversation().catch(() => {});
    }, delay);
  }

  async function autoIndexCurrentConversation() {
    if (state.syncCancel) return;

    const record = await buildCurrentConversationRecord();
    if (!record) return;

    const indexKey = `${record.accountId}|${record.url}|${record.title}`;
    if (state.lastAutoIndexedKey === indexKey) return;

    await sendMessage({ type: "records:upsert", accountId: record.accountId, records: [record] });
    state.lastAutoIndexedKey = indexKey;

    if (!state.accountId || state.accountId === record.accountId) {
      state.accountId = record.accountId;
      state.records = mergeRecentRecords(state.records, [record]);
      if (!ui.modalBackdrop.hidden) renderResults();
    }
  }

  async function buildCurrentConversationRecord() {
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

  function updateObservedConversationState(url) {
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

  function findCurrentConversationTitle(url) {
    const currentAnchor = Array.from(document.querySelectorAll("a[href]")).find((anchor) =>
      isUsableConversationAnchor(anchor) &&
      normalizeConversationUrl(getAnchorHref(anchor), location.origin) === url
    );
    const anchorTitle = cleanConversationTitle(extractElementTitle(currentAnchor));
    if (anchorTitle) return { title: anchorTitle, source: "anchor" };

    const documentTitle = cleanConversationTitle(document.title);
    if (documentTitle) return { title: documentTitle, source: "document" };

    return null;
  }

  function extractElementTitle(element) {
    if (!element) return "";
    return extractConversationAnchorTitle(element) || "";
  }

  function cleanConversationTitle(value) {
    const title = String(value || "")
      .replace(/\s+/g, " ")
      .replace(/^ChatGPT\s*[-|]\s*/i, "")
      .replace(/\s*[-|]\s*ChatGPT$/i, "")
      .trim();
    if (isNonConversationTitle(title)) return "";
    return title;
  }

  function isUsableConversationAnchor(anchor) {
    if (!anchor || anchor.closest("#cgcs-root")) return false;
    if (!isVisible(anchor)) return false;
    if (!normalizeConversationUrl(getAnchorHref(anchor), location.origin)) return false;
    return Boolean(extractConversationAnchorTitle(anchor));
  }

  return {
    startAutomaticIndexing
  };
}

function isVisible(element) {
  const rect = element.getBoundingClientRect();
  return rect.width > 0 && rect.height > 0;
}
