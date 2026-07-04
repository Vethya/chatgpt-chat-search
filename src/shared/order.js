export function compareRecordOrder(left, right, fallbackOrder = 0) {
  return (left.order ?? fallbackOrder) - (right.order ?? fallbackOrder);
}
