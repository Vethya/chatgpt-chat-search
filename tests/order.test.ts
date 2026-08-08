import test from "node:test";
import assert from "node:assert/strict";
import { compareRecordOrder } from "../src/shared/order.js";

test("compares records by order with a configurable fallback", () => {
  const records = [
    { title: "Missing order" },
    { title: "Second", order: 1 },
    { title: "First", order: 0 }
  ];

  assert.deepEqual(
    [...records].sort(compareRecordOrder).map((record) => record.title),
    ["Missing order", "First", "Second"]
  );
  assert.deepEqual(
    [...records].sort((left, right) => compareRecordOrder(left, right, Number.MAX_SAFE_INTEGER)).map((record) => record.title),
    ["First", "Second", "Missing order"]
  );
});
