const CHATGPT_HOST = "chatgpt.com";
const CONVERSATION_ROUTE_PATTERN = /^\/c\/[a-zA-Z0-9-]+\/?$/;
const PROJECT_ROUTE_PATTERN = /^\/projects\/[^/]+\/?$/;

export function isSearchSurfaceUrl(href) {
  let url;
  try {
    url = new URL(href);
  } catch {
    return false;
  }

  if (url.hostname !== CHATGPT_HOST) return false;
  return (
    url.pathname === "/" ||
    CONVERSATION_ROUTE_PATTERN.test(url.pathname) ||
    PROJECT_ROUTE_PATTERN.test(url.pathname)
  );
}
