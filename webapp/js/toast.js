const tg = window.Telegram.WebApp;

let toastTimeout = null;

const ICONS = {
  success:
    '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-linecap="round" stroke-linejoin="round"><polyline points="20 6 9 17 4 12"></polyline></svg>',
  error:
    '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-linecap="round" stroke-linejoin="round"><line x1="18" y1="6" x2="6" y2="18"></line><line x1="6" y1="6" x2="18" y2="18"></line></svg>',
  info: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-linecap="round" stroke-linejoin="round"><circle cx="12" cy="12" r="10"></circle><line x1="12" y1="16" x2="12" y2="12"></line><line x1="12" y1="8" x2="12.01" y2="8"></line></svg>',
  stats:
    '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-linecap="round" stroke-linejoin="round"><line x1="18" y1="20" x2="18" y2="10"></line><line x1="12" y1="20" x2="12" y2="4"></line><line x1="6" y1="20" x2="6" y2="14"></line></svg>',
};

/**
 * Modern Pill Notification
 * @param {string} msg - Message text (supports HTML)
 * @param {'info'|'success'|'error'|'stats'} type - Notification style
 */
export function toast(msg, type = "info") {
  const el = document.getElementById("toast");
  if (!el) return;

  if (toastTimeout) clearTimeout(toastTimeout);

  // Update content with icon
  const iconHtml = `<div class="toast-icon">${ICONS[type] || ICONS.info}</div>`;
  el.innerHTML = `${iconHtml}<div class="toast-text">${msg}</div>`;
  el.className = `toast toast-${type} show`;

  // Haptics
  if (type === "success" || (type === "stats" && msg.includes("stat-good")))
    tg.HapticFeedback.notificationOccurred("success");
  else if (type === "error") tg.HapticFeedback.notificationOccurred("error");
  else tg.HapticFeedback.impactOccurred("light");

  const duration = type === "stats" ? 4500 : 2200;

  toastTimeout = setTimeout(() => {
    el.classList.remove("show");
    toastTimeout = null;
  }, duration);
}

// ── Shared base messages ──────────────────────────────────────────────────

const _saved = "Saved";
const _fail = (what) => `Failed to ${what}`;
const _added = (n) => `Added ${n} words`;

// ── Message constants ─────────────────────────────────────────────────────

export const T = {
  // Dictionary — add
  WORD_REQUIRED: "Fill in word and translation",
  WORD_ADDED: (w) => `Added: ${w}`,
  WORD_ADD_FAIL: _fail("add word"),

  // Dictionary — CSV upload
  NO_WORDS_CSV: "No words found in file",
  CSV_ADDED: _added,
  CSV_FAIL: _fail("upload file"),

  // Dictionary — edit / delete
  WORD_SAVED: _saved,
  WORD_SAVE_FAIL: _fail("save"),
  WORD_DUPLICATE: "Word already exists",
  DELETE_FAIL: _fail("delete"),

  // Dictionary — clear / export / search
  CLEARED: "Dictionary cleared",
  CLEAR_FAIL: _fail("clear"),
  COPIED: "Copied to clipboard",
  EXPORT_FAIL: _fail("export"),
  SEARCH_FAIL: "Search error",

  // Settings
  SAVED: _saved,
  SAVE_FAIL: _fail("save"),
  LANG_SWITCHED: (l) => `Switched to ${l}`,
  LANG_FAIL: _fail("switch language"),

  // App
  INIT_FAIL: _fail("load app"),

  // Practice
  SESSION_FAIL: _fail("load session"),
  GRADE_FAIL: _fail("save progress"),
  UNDO_FAIL: "Reverted",
};
