import test from "node:test";
import assert from "node:assert/strict";

import { detectChatGptTheme } from "../src/shared/theme.js";

interface FakeDocumentOptions {
  bodyBackgroundColor?: string;
  className?: string;
  colorScheme?: string;
}

interface StyledElement {
  colorScheme?: string;
  backgroundColor?: string;
}

function fakeDocument({
  bodyBackgroundColor = "rgba(0, 0, 0, 0)",
  className = "",
  colorScheme = ""
}: FakeDocumentOptions = {}): Document {
  const classNames = new Set(className ? className.split(/\s+/) : []);
  return {
    body: { backgroundColor: bodyBackgroundColor },
    documentElement: {
      colorScheme,
      dataset: {},
      getAttribute(): string | null {
        return null;
      },
      classList: {
        contains(name: string) {
          return classNames.has(name);
        },
        value: className
      }
    }
  } as unknown as Document;
}

function fakeWindow(documentRef: Document): Window {
  return {
    getComputedStyle(element: Element): Record<string, string> {
      const styled = element as unknown as StyledElement;
      return element === documentRef.documentElement
        ? { colorScheme: styled.colorScheme ?? "" }
        : { backgroundColor: styled.backgroundColor ?? "" };
    }
  } as unknown as Window;
}

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
