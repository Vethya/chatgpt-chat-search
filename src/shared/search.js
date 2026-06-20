export function normalizeText(value) {
  return String(value || "")
    .toLowerCase()
    .normalize("NFKD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/[^a-z0-9]+/g, " ")
    .trim();
}

export function searchConversations(records, query, limit = 20) {
  const normalizedQuery = normalizeText(query);
  const sortedRecords = [...records].sort(compareByOrder);

  if (!normalizedQuery) {
    return sortedRecords.slice(0, limit).map((record) => ({ record, score: 0 }));
  }

  return sortedRecords
    .map((record) => ({ record, score: scoreTitle(record.title, normalizedQuery) }))
    .filter((result) => result.score > 0)
    .sort((left, right) => right.score - left.score || compareByOrder(left.record, right.record))
    .slice(0, limit);
}

export function scoreTitle(title, normalizedQuery) {
  const normalizedTitle = normalizeText(title);
  if (!normalizedTitle || !normalizedQuery) return 0;
  if (normalizedTitle === normalizedQuery) return 120;

  let score = 0;
  if (normalizedTitle.includes(normalizedQuery)) {
    score += 70 + Math.min(20, normalizedQuery.length);
  }

  const titleTokens = normalizedTitle.split(" ").filter(Boolean);
  const queryTokens = normalizedQuery.split(" ").filter(Boolean);
  const acronym = titleTokens.map((token) => token[0]).join("");

  if (acronym.includes(normalizedQuery)) score += 24;
  if (isSubsequence(normalizedQuery, normalizedTitle)) score += Math.min(24, normalizedQuery.length * 2);

  for (const queryToken of queryTokens) {
    let tokenScore = 0;
    for (const titleToken of titleTokens) {
      if (titleToken === queryToken) tokenScore = Math.max(tokenScore, 38);
      else if (titleToken.startsWith(queryToken)) tokenScore = Math.max(tokenScore, 28);
      else if (titleToken.includes(queryToken)) tokenScore = Math.max(tokenScore, 18);
      else tokenScore = Math.max(tokenScore, typoScore(titleToken, queryToken));
    }
    score += tokenScore;
  }

  return score;
}

function typoScore(titleToken, queryToken) {
  if (queryToken.length < 3 || titleToken.length < 3) return 0;
  const distance = levenshtein(titleToken.slice(0, Math.max(queryToken.length, 4)), queryToken);
  if (distance === 1) return 18;
  if (distance === 2 && queryToken.length >= 5) return 10;
  return 0;
}

function compareByOrder(left, right) {
  return (left.order ?? Number.MAX_SAFE_INTEGER) - (right.order ?? Number.MAX_SAFE_INTEGER);
}

function isSubsequence(needle, haystack) {
  let cursor = 0;
  for (const char of haystack) {
    if (char === needle[cursor]) cursor += 1;
    if (cursor === needle.length) return true;
  }
  return false;
}

function levenshtein(left, right) {
  const previous = Array.from({ length: right.length + 1 }, (_, index) => index);
  const current = Array.from({ length: right.length + 1 }, () => 0);

  for (let row = 1; row <= left.length; row += 1) {
    current[0] = row;
    for (let column = 1; column <= right.length; column += 1) {
      const cost = left[row - 1] === right[column - 1] ? 0 : 1;
      current[column] = Math.min(
        previous[column] + 1,
        current[column - 1] + 1,
        previous[column - 1] + cost
      );
    }
    previous.splice(0, previous.length, ...current);
  }

  return previous[right.length];
}
