export const CHATGPT_THEME_STORAGE_KEY = "chatgptTheme";
export const DEFAULT_THEME = "light";

export type ChatGptTheme = "dark" | "light";

export function normalizeTheme(value: unknown): ChatGptTheme | null {
  return value === "dark" || value === "light" ? value : null;
}

export function detectChatGptTheme(
  documentRef: Document | undefined = globalThis.document,
  windowRef: Window | undefined = globalThis.window
): ChatGptTheme | null {
  const documentElement = documentRef?.documentElement;
  const explicitTheme = normalizeTheme(documentElement?.getAttribute?.("data-theme"))
    || normalizeTheme(documentElement?.dataset?.theme)
    || detectThemeFromClassList(documentElement?.classList);

  if (explicitTheme) return explicitTheme;

  return detectThemeFromColorScheme(documentElement, windowRef);
}

export function applyThemeAttribute(element: Element | null | undefined, theme: unknown): ChatGptTheme {
  const normalizedTheme = normalizeTheme(theme) || DEFAULT_THEME;
  element?.setAttribute?.("data-cgcs-theme", normalizedTheme);
  return normalizedTheme;
}

export function applyPopupTheme(
  documentRef: Document,
  theme: unknown,
  windowRef: Window | undefined = globalThis.window
): ChatGptTheme {
  const normalizedTheme = normalizeTheme(theme)
    || getPreferredTheme(documentRef)
    || getSystemTheme(windowRef)
    || DEFAULT_THEME;
  documentRef?.documentElement?.setAttribute?.("data-theme", normalizedTheme);
  return normalizedTheme;
}

export function getPreferredTheme(documentRef: Document | undefined = globalThis.document): ChatGptTheme | null {
  return normalizeTheme(documentRef?.documentElement?.getAttribute?.("data-theme"))
    || normalizeTheme(documentRef?.documentElement?.dataset?.theme);
}

export function getSystemTheme(windowRef: Window | undefined = globalThis.window): ChatGptTheme | null {
  if (typeof windowRef?.matchMedia !== "function") return null;
  if (windowRef.matchMedia("(prefers-color-scheme: dark)")?.matches) return "dark";
  if (windowRef.matchMedia("(prefers-color-scheme: light)")?.matches) return "light";
  return null;
}

function detectThemeFromClassList(classList: DOMTokenList | undefined): ChatGptTheme | null {
  if (!classList) return null;
  if (classList.contains?.("dark")) return "dark";
  if (classList.contains?.("light")) return "light";

  const classNames = String(classList.value || "").split(/\s+/);
  if (classNames.includes("dark")) return "dark";
  if (classNames.includes("light")) return "light";
  return null;
}

function detectThemeFromColorScheme(
  element: Element | undefined,
  windowRef: Window | undefined
): ChatGptTheme | null {
  const colorScheme = getComputedStyleValue(element, windowRef, "colorScheme");
  if (!colorScheme) return null;
  if (/\bdark\b/.test(colorScheme) && !/\blight\b/.test(colorScheme)) return "dark";
  if (/\blight\b/.test(colorScheme) && !/\bdark\b/.test(colorScheme)) return "light";
  return null;
}

function getComputedStyleValue(
  element: Element | undefined,
  windowRef: Window | undefined,
  property: keyof CSSStyleDeclaration
): string {
  if (!element || typeof windowRef?.getComputedStyle !== "function") return "";
  return String(windowRef.getComputedStyle(element)?.[property] || "");
}
