import test from "node:test";
import assert from "node:assert/strict";
import { formatConversationCount, formatConversationLabel, formatNumber, getShortcutLabel } from "../dist/extension/src/utils/format.js";

test("formats numbers with separators", () => {
  assert.equal(formatNumber(1199), "1,199");
  assert.equal(formatNumber(Number.NaN), "0");
});

test("formats conversation labels and counts", () => {
  assert.equal(formatConversationLabel(1), "conversation");
  assert.equal(formatConversationLabel(2), "conversations");
  assert.equal(formatConversationCount(1199), "1,199 conversations");
  assert.equal(formatConversationCount(1, "record"), "1 record");
});

test("gets shortcut label for Mac platforms", (t) => {
  const previousNavigator = globalThis.navigator;
  Object.defineProperty(globalThis, "navigator", {
    configurable: true,
    value: { userAgentData: { platform: "macOS" }, platform: "Win32" }
  });
  t.after(() => {
    Object.defineProperty(globalThis, "navigator", {
      configurable: true,
      value: previousNavigator
    });
  });

  assert.equal(getShortcutLabel(), "Cmd+Shift+.");
});

test("gets shortcut label for non-Mac platforms", (t) => {
  const previousNavigator = globalThis.navigator;
  Object.defineProperty(globalThis, "navigator", {
    configurable: true,
    value: { platform: "Win32" }
  });
  t.after(() => {
    Object.defineProperty(globalThis, "navigator", {
      configurable: true,
      value: previousNavigator
    });
  });

  assert.equal(getShortcutLabel(), "Ctrl+Shift+.");
});
