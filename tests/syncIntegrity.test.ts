import test from "node:test";
import assert from "node:assert/strict";
import { isSuspiciouslySmallSync } from "../src/shared/syncIntegrity.js";

test("flags a large unexpected sync drop", () => {
  assert.equal(isSuspiciouslySmallSync(420, 29), true);
});

test("allows normal smaller indexes and modest changes", () => {
  assert.equal(isSuspiciouslySmallSync(40, 12), false);
  assert.equal(isSuspiciouslySmallSync(420, 390), false);
});

test("uses a sixty percent threshold for large indexes", () => {
  assert.equal(isSuspiciouslySmallSync(100, 60), false);
  assert.equal(isSuspiciouslySmallSync(100, 59), true);
  assert.equal(isSuspiciouslySmallSync(50, 29), true);
});

test("ignores non-finite counts", () => {
  assert.equal(isSuspiciouslySmallSync(Number.NaN, 10), false);
  assert.equal(isSuspiciouslySmallSync(100, Number.POSITIVE_INFINITY), false);
});
