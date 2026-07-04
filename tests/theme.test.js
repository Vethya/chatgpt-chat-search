import test from "node:test";
import assert from "node:assert/strict";

import { detectChatGptTheme } from "../dist/extension/src/shared/theme.js";

test("detects explicit ChatGPT theme classes", () => {
  assert.equal(detectChatGptTheme(fakeDocument({ className: "dark" })), "dark");
  assert.equal(detectChatGptTheme(fakeDocument({ className: "light" })), "light");
});

test("ignores theme words inside utility class tokens", () => {
  const documentRef = fakeDocument({ className: "dark:bg-slate-900 no-dark-mode lightness" });

  assert.equal(detectChatGptTheme(documentRef), null);
});

test("does not infer theme from ambiguous color-scheme or body background", () => {
  const documentRef = fakeDocument({
    bodyBackgroundColor: "rgb(255, 255, 255)",
    colorScheme: "light dark"
  });

  assert.equal(detectChatGptTheme(documentRef, fakeWindow(documentRef)), null);
});

test("detects unambiguous computed color-scheme", () => {
  const darkDocument = fakeDocument({ colorScheme: "dark" });
  const lightDocument = fakeDocument({ colorScheme: "light" });

  assert.equal(detectChatGptTheme(darkDocument, fakeWindow(darkDocument)), "dark");
  assert.equal(detectChatGptTheme(lightDocument, fakeWindow(lightDocument)), "light");
});

function fakeDocument({ bodyBackgroundColor = "rgba(0, 0, 0, 0)", className = "", colorScheme = "" } = {}) {
  const classNames = new Set(className ? className.split(/\s+/) : []);
  return {
    body: { backgroundColor: bodyBackgroundColor },
    documentElement: {
      colorScheme,
      dataset: {},
      getAttribute() {
        return null;
      },
      classList: {
        contains(name) {
          return classNames.has(name);
        },
        value: className
      }
    }
  };
}

function fakeWindow(documentRef) {
  return {
    getComputedStyle(element) {
      return element === documentRef.documentElement
        ? { colorScheme: element.colorScheme }
        : { backgroundColor: element.backgroundColor };
    }
  };
}
