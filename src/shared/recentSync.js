export const RECENT_KNOWN_STOP_THRESHOLD = 20;

export function rememberRecentVisibleRecords(
  visibleRecords,
  foundByUrl,
  knownUrls,
  visitedUrls,
  consecutiveKnownCount,
  stopThreshold = RECENT_KNOWN_STOP_THRESHOLD
) {
  let nextConsecutiveKnownCount = consecutiveKnownCount;

  for (const record of visibleRecords) {
    if (visitedUrls.has(record.url)) continue;
    visitedUrls.add(record.url);

    if (knownUrls.has(record.url)) {
      nextConsecutiveKnownCount += 1;
      if (nextConsecutiveKnownCount >= stopThreshold) {
        return { hitKnownLimit: true, consecutiveKnownCount: nextConsecutiveKnownCount };
      }
      continue;
    }

    nextConsecutiveKnownCount = 0;
    const existing = foundByUrl.get(record.url);
    foundByUrl.set(record.url, existing ? { ...existing, ...record, order: existing.order } : { ...record, order: foundByUrl.size });
  }

  return { hitKnownLimit: false, consecutiveKnownCount: nextConsecutiveKnownCount };
}
