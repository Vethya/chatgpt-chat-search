import type { Theme } from "./types.js";

export const CHATGPT_THEME_STORAGE_KEY = "chatgptTheme";
export const DEFAULT_THEME: Theme = "light";

export function normalizeTheme(value: string | null | undefined): Theme | null {
  return value === "dark" || value === "light" ? value : null;
}

export function detectChatGptTheme(
  documentRef: Document | null | undefined = globalThis.document,
  windowRef: Window | null | undefined = globalThis.window
): Theme | null {
  const documentElement = documentRef?.documentElement;
  const explicitTheme = normalizeTheme(documentElement?.getAttribute?.("data-theme"))
    || normalizeTheme(documentElement?.dataset?.theme)
    || detectThemeFromClassList(documentElement?.classList);

  if (explicitTheme) return explicitTheme;

  return detectThemeFromColorScheme(documentElement, windowRef);
}

export function applyThemeAttribute(element: Element | null, theme: string | null | undefined): Theme {
  const normalizedTheme = normalizeTheme(theme) || DEFAULT_THEME;
  element?.setAttribute?.("data-cgcs-theme", normalizedTheme);
  return normalizedTheme;
}

export function applyPopupTheme(
  documentRef: Document | null,
  theme: string | null | undefined,
  windowRef: Window | null | undefined = globalThis.window
): Theme {
  const normalizedTheme = normalizeTheme(theme)
    || getPreferredTheme(documentRef)
    || getSystemTheme(windowRef)
    || DEFAULT_THEME;
  documentRef?.documentElement?.setAttribute?.("data-theme", normalizedTheme);
  return normalizedTheme;
}

export function getPreferredTheme(
  documentRef: Document | null | undefined = globalThis.document
): Theme | null {
  return normalizeTheme(documentRef?.documentElement?.getAttribute?.("data-theme"))
    || normalizeTheme(documentRef?.documentElement?.dataset?.theme);
}

export function getSystemTheme(
  windowRef: Window | null | undefined = globalThis.window
): Theme | null {
  if (typeof windowRef?.matchMedia !== "function") return null;
  if (windowRef.matchMedia("(prefers-color-scheme: dark)")?.matches) return "dark";
  if (windowRef.matchMedia("(prefers-color-scheme: light)")?.matches) return "light";
  return null;
}

function detectThemeFromClassList(classList: DOMTokenList | null | undefined): Theme | null {
  if (!classList) return null;
  if (classList.contains?.("dark")) return "dark";
  if (classList.contains?.("light")) return "light";

  const classNames = String(classList.value || "").split(/\s+/);
  if (classNames.includes("dark")) return "dark";
  if (classNames.includes("light")) return "light";
  return null;
}

function detectThemeFromColorScheme(
  element: Element | null | undefined,
  windowRef: Window | null | undefined
): Theme | null {
  const colorScheme = getComputedStyleValue(element, windowRef, "colorScheme");
  if (!colorScheme) return null;
  if (/\bdark\b/.test(colorScheme) && !/\blight\b/.test(colorScheme)) return "dark";
  if (/\blight\b/.test(colorScheme) && !/\bdark\b/.test(colorScheme)) return "light";
  return null;
}

function getComputedStyleValue(
  element: Element | null | undefined,
  windowRef: Window | null | undefined,
  property: keyof CSSStyleDeclaration
): string {
  if (!element || typeof windowRef?.getComputedStyle !== "function") return "";
  const value = windowRef.getComputedStyle(element)?.[property];
  return typeof value === "string" ? value : "";
}
