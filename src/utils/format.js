export function formatNumber(value) {
  const safeValue = Number.isFinite(value) ? value : 0;
  return new Intl.NumberFormat().format(safeValue);
}

export function formatConversationLabel(count, label = "conversation") {
  const safeCount = Number.isFinite(count) ? count : 0;
  return `${label}${safeCount === 1 ? "" : "s"}`;
}

export function formatConversationCount(count, label = "conversation") {
  const safeCount = Number.isFinite(count) ? count : 0;
  return `${formatNumber(safeCount)} ${formatConversationLabel(safeCount, label)}`;
}
