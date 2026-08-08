export interface OrderableRecord {
  order?: number;
}

export function compareRecordOrder(
  left: OrderableRecord,
  right: OrderableRecord,
  fallbackOrder = 0
): number {
  return (left.order ?? fallbackOrder) - (right.order ?? fallbackOrder);
}
