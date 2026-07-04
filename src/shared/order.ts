import type { ConversationRecord } from "../types.js";

export function compareRecordOrder(
  left: Pick<ConversationRecord, "order">,
  right: Pick<ConversationRecord, "order">,
  fallbackOrder = 0
): number {
  return (left.order ?? fallbackOrder) - (right.order ?? fallbackOrder);
}
