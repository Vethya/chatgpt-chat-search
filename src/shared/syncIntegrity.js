export function isSuspiciouslySmallSync(previousCount, nextCount) {
  if (!Number.isFinite(previousCount) || !Number.isFinite(nextCount)) return false;
  if (previousCount < 50) return false;
  return nextCount < Math.floor(previousCount * 0.6);
}
