export function formatNumber(value: number): string {
  const safeValue = Number.isFinite(value) ? value : 0;
  return new Intl.NumberFormat().format(safeValue);
}

export function formatConversationLabel(count: number, label = "conversation"): string {
  const safeCount = Number.isFinite(count) ? count : 0;
  return `${label}${safeCount === 1 ? "" : "s"}`;
}

export function formatConversationCount(count: number, label = "conversation"): string {
  const safeCount = Number.isFinite(count) ? count : 0;
  return `${formatNumber(safeCount)} ${formatConversationLabel(safeCount, label)}`;
}

export function getShortcutLabel(): string {
  const navigatorRef = globalThis.navigator as Navigator & { userAgentData?: { platform?: string } };
  const platform = navigatorRef?.userAgentData?.platform || navigatorRef?.platform || "";
  return /mac/i.test(platform) ? "Cmd+Shift+." : "Ctrl+Shift+.";
}
