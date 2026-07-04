export const CHATGPT_THEME_STORAGE_KEY = "chatgptTheme";
export const DEFAULT_THEME = "light";

export function normalizeTheme(value) {
  return value === "dark" || value === "light" ? value : null;
}

export function detectChatGptTheme(documentRef = globalThis.document, windowRef = globalThis.window) {
  const documentElement = documentRef?.documentElement;
  const explicitTheme = normalizeTheme(documentElement?.getAttribute?.("data-theme"))
    || normalizeTheme(documentElement?.dataset?.theme)
    || detectThemeFromClassList(documentElement?.classList);

  if (explicitTheme) return explicitTheme;

  return detectThemeFromColorScheme(documentElement, windowRef);
}

export function applyThemeAttribute(element, theme) {
  const normalizedTheme = normalizeTheme(theme) || DEFAULT_THEME;
  element?.setAttribute?.("data-cgcs-theme", normalizedTheme);
  return normalizedTheme;
}

export function applyPopupTheme(documentRef, theme, windowRef = globalThis.window) {
  const normalizedTheme = normalizeTheme(theme)
    || getPreferredTheme(documentRef)
    || getSystemTheme(windowRef)
    || DEFAULT_THEME;
  documentRef?.documentElement?.setAttribute?.("data-theme", normalizedTheme);
  return normalizedTheme;
}

export function getPreferredTheme(documentRef = globalThis.document) {
  return normalizeTheme(documentRef?.documentElement?.getAttribute?.("data-theme"))
    || normalizeTheme(documentRef?.documentElement?.dataset?.theme);
}

export function getSystemTheme(windowRef = globalThis.window) {
  if (typeof windowRef?.matchMedia !== "function") return null;
  if (windowRef.matchMedia("(prefers-color-scheme: dark)")?.matches) return "dark";
  if (windowRef.matchMedia("(prefers-color-scheme: light)")?.matches) return "light";
  return null;
}

function detectThemeFromClassList(classList) {
  if (!classList) return null;
  if (classList.contains?.("dark")) return "dark";
  if (classList.contains?.("light")) return "light";

  const className = String(classList.value || "");
  if (/\bdark\b/.test(className)) return "dark";
  if (/\blight\b/.test(className)) return "light";
  return null;
}

function detectThemeFromColorScheme(element, windowRef) {
  const colorScheme = getComputedStyleValue(element, windowRef, "colorScheme");
  if (!colorScheme) return null;
  if (/\bdark\b/.test(colorScheme) && !/\blight\b/.test(colorScheme)) return "dark";
  if (/\blight\b/.test(colorScheme) && !/\bdark\b/.test(colorScheme)) return "light";
  return null;
}

function getComputedStyleValue(element, windowRef, property) {
  if (!element || typeof windowRef?.getComputedStyle !== "function") return "";
  return windowRef.getComputedStyle(element)?.[property] || "";
}
