export interface IconRegistry {
  alertTriangle: string;
  checkCircle: string;
  database: string;
  download: string;
  help: string;
  infoCircle: string;
  refresh: string;
  search: string;
  sparkles: string;
  trash: string;
  upload: string;
  x: string;
  xCircle: string;
}

export function createIconRegistry(): IconRegistry {
  return {
    alertTriangle: svg(`<path d="m21.73 18-8-14a2 2 0 0 0-3.46 0l-8 14A2 2 0 0 0 4 21h16a2 2 0 0 0 1.73-3"/><path d="M12 9v4"/><path d="M12 17h.01"/>`),
    checkCircle: svg(`<path d="M22 11.08V12a10 10 0 1 1-5.93-9.14"/><path d="m9 11 3 3L22 4"/>`),
    database: svg(`<ellipse cx="12" cy="5" rx="9" ry="3"/><path d="M3 5v14c0 1.66 4.03 3 9 3s9-1.34 9-3V5"/><path d="M3 12c0 1.66 4.03 3 9 3s9-1.34 9-3"/>`),
    download: svg(`<path d="M12 3v12"/><path d="m7 10 5 5 5-5"/><path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"/>`),
    help: svg(`<circle cx="12" cy="12" r="10"/><path d="M9.09 9a3 3 0 0 1 5.82 1c0 2-3 2-3 4"/><path d="M12 17h.01"/>`),
    infoCircle: svg(`<circle cx="12" cy="12" r="10"/><path d="M12 16v-4"/><path d="M12 8h.01"/>`),
    refresh: svg(`<path d="M3 12a9 9 0 0 1 14.9-6.8L21 8"/><path d="M21 3v5h-5"/><path d="M21 12a9 9 0 0 1-14.9 6.8L3 16"/><path d="M3 21v-5h5"/>`),
    search: svg(`<path d="m21 21-4.34-4.34"/><circle cx="11" cy="11" r="8"/>`, "cgcs-entry-icon cgcs-icon"),
    sparkles: svg(`<path d="M9.937 15.5A2 2 0 0 0 8.5 14.063l-6.135-1.582a.5.5 0 0 1 0-.962L8.5 9.936A2 2 0 0 0 9.937 8.5l1.582-6.135a.5.5 0 0 1 .962 0L14.063 8.5A2 2 0 0 0 15.5 9.937l6.135 1.582a.5.5 0 0 1 0 .962L15.5 14.063a2 2 0 0 0-1.437 1.437l-1.582 6.135a.5.5 0 0 1-.962 0z"/><path d="M20 3v4"/><path d="M22 5h-4"/><path d="M4 17v2"/><path d="M5 18H3"/>`),
    trash: svg(`<path d="M3 6h18"/><path d="M19 6v14c0 1-1 2-2 2H7c-1 0-2-1-2-2V6"/><path d="M8 6V4c0-1 1-2 2-2h4c1 0 2 1 2 2v2"/><path d="M10 11v6"/><path d="M14 11v6"/>`),
    upload: svg(`<path d="M12 3v12"/><path d="m17 8-5-5-5 5"/><path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"/>`),
    x: svg(`<path d="M18 6 6 18"/><path d="m6 6 12 12"/>`),
    xCircle: svg(`<circle cx="12" cy="12" r="10"/><path d="m15 9-6 6"/><path d="m9 9 6 6"/>`)
  };
}

function svg(paths: string, className = "cgcs-icon"): string {
  return `<svg class="${className}" xmlns="http://www.w3.org/2000/svg" width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true" focusable="false">${paths}</svg>`;
}
