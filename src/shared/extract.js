const CONVERSATION_PATH_PATTERN = /\/c\/[a-zA-Z0-9-]+/;

export function extractConversationRecordsFromDocument(documentRef, accountId, syncedAt, origin, options = {}) {
  const anchors = Array.from(documentRef.querySelectorAll("a[href]"));
  return extractConversationRecordsFromAnchors(anchors, accountId, syncedAt, origin, options);
}

export function extractConversationRecordsFromAnchors(anchors, accountId, syncedAt, origin = "https://chatgpt.com", options = {}) {
  const records = [];
  const seen = new Set();

  for (const anchor of anchors) {
    if (!isConversationAnchorCandidate(anchor, options)) continue;

    const url = normalizeConversationUrl(getAnchorHref(anchor), origin);
    if (!url || seen.has(url)) continue;

    const title = extractConversationAnchorTitle(anchor);
    if (!title) continue;

    seen.add(url);
    records.push({
      accountId,
      url,
      title,
      order: records.length,
      syncedAt
    });
  }

  return records;
}

export function normalizeConversationUrl(href, origin = "https://chatgpt.com") {
  if (!href) return null;
  if (String(href).trim().startsWith("#")) return null;
  let parsed;
  try {
    parsed = new URL(href, origin);
  } catch {
    return null;
  }

  const match = parsed.pathname.match(CONVERSATION_PATH_PATTERN);
  if (!match) return null;
  return `${parsed.origin}${match[0]}`;
}

export function hasConversationLinks(documentRef) {
  return Array.from(documentRef.querySelectorAll("a[href]")).some((anchor) =>
    Boolean(normalizeConversationUrl(getAnchorHref(anchor), location.origin))
  );
}

export function extractConversationAnchorTitle(anchor) {
  const values = [
    anchor.getAttribute?.("aria-label"),
    anchor.getAttribute?.("title"),
    anchor.textContent
  ];

  return values
    .map((value) => String(value || "").replace(/\s+/g, " ").trim())
    .find((title) => title && !isNonConversationTitle(title));
}

export function isNonConversationTitle(title) {
  const normalized = String(title || "").replace(/\s+/g, " ").trim().toLowerCase();
  return /^(|chatgpt|new chat|temporary chat|explore gpts|search chats|skip(?:\s+\S+){0,4}\s+content|main content|skip navigation|open sidebar|close sidebar|toggle sidebar)$/.test(normalized);
}

export function getAnchorHref(anchor) {
  return anchor?.getAttribute?.("href") || anchor?.href;
}

function isConversationAnchorCandidate(anchor, options) {
  if (!anchor || anchor.closest?.("#cgcs-root")) return false;
  if (options.requireVisible && !isVisible(anchor)) return false;
  return true;
}

function isVisible(element) {
  const rect = element.getBoundingClientRect?.();
  if (!rect || rect.width <= 0 || rect.height <= 0) return false;
  const style = element.ownerDocument?.defaultView?.getComputedStyle?.(element);
  return !style || (style.visibility !== "hidden" && style.display !== "none");
}
