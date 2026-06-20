const CONVERSATION_PATH_PATTERN = /\/c\/[a-zA-Z0-9-]+/;

export function extractConversationRecordsFromDocument(documentRef, accountId, syncedAt, origin) {
  const anchors = Array.from(documentRef.querySelectorAll("a[href]"));
  return extractConversationRecordsFromAnchors(anchors, accountId, syncedAt, origin);
}

export function extractConversationRecordsFromAnchors(anchors, accountId, syncedAt, origin = "https://chatgpt.com") {
  const records = [];
  const seen = new Set();

  for (const anchor of anchors) {
    const url = normalizeConversationUrl(anchor.href || anchor.getAttribute?.("href"), origin);
    if (!url || seen.has(url)) continue;

    const title = extractAnchorTitle(anchor);
    if (!title || isNonConversationTitle(title)) continue;

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
    Boolean(normalizeConversationUrl(anchor.href || anchor.getAttribute?.("href"), location.origin))
  );
}

function extractAnchorTitle(anchor) {
  const values = [
    anchor.getAttribute?.("aria-label"),
    anchor.getAttribute?.("title"),
    anchor.textContent
  ];

  return values
    .map((value) => String(value || "").replace(/\s+/g, " ").trim())
    .find(Boolean);
}

function isNonConversationTitle(title) {
  const normalized = title.toLowerCase();
  return normalized === "new chat" || normalized === "chatgpt" || normalized === "explore gpts";
}
