const tg = window.Telegram.WebApp;

let toastTimeout = null;

/**
 * Main notification dispatcher
 * @param {string} msg - Message to show
 * @param {'info'|'success'|'error'} type - Style of notification
 * @param {boolean} native - Force native Telegram Alert for error/success
 */
export function toast(msg, type = 'info', native = false) {
  // Use native Telegram Alert for critical errors or forced native
  if (native || (type === 'error' && msg.length > 50)) {
    tg.showAlert(msg);
    if (type === 'error') tg.HapticFeedback.notificationOccurred('error');
    return;
  }

  const el = document.getElementById('toast');
  if (!el) return;
  
  if (toastTimeout) clearTimeout(toastTimeout);
  
  el.innerHTML = msg;
  el.className = `toast toast-${type} show`;

  // Haptics
  if (type === 'success') tg.HapticFeedback.notificationOccurred('success');
  else if (type === 'error') tg.HapticFeedback.notificationOccurred('error');
  else tg.HapticFeedback.impactOccurred('light');
  
  toastTimeout = setTimeout(() => {
    el.classList.remove('show');
    toastTimeout = null;
  }, 2500); // Slightly faster for native feel
}

// ── Shared base messages ──────────────────────────────────────────────────

const _saved  = 'Saved';
const _fail   = (what) => `Failed to ${what}`;
const _added  = (n) => `Added ${n} words`;

// ── Message constants ─────────────────────────────────────────────────────

export const T = {

  // Dictionary — add
  WORD_REQUIRED:  'Fill in word and translation',
  WORD_ADDED:     (w) => `Added: ${w}`,
  WORD_ADD_FAIL:  _fail('add word'),

  // Dictionary — CSV upload
  NO_WORDS_CSV:   'No words found in file',
  CSV_ADDED:      _added,
  CSV_FAIL:       _fail('upload file'),

  // Dictionary — edit / delete
  WORD_SAVED:      _saved,
  WORD_SAVE_FAIL:  _fail('save'),
  WORD_DUPLICATE:  'Word already exists',
  DELETE_FAIL:     _fail('delete'),

  // Dictionary — clear / export / search
  CLEARED:        'Dictionary cleared',
  CLEAR_FAIL:     _fail('clear'),
  COPIED:         'Copied to clipboard',
  EXPORT_FAIL:    _fail('export'),
  SEARCH_FAIL:    'Search error',

  // Settings
  SAVED:          _saved,
  SAVE_FAIL:      _fail('save'),
  LANG_SWITCHED:  (l) => `Switched to ${l}`,
  LANG_FAIL:      _fail('switch language'),

  // App
  INIT_FAIL:      _fail('load app'),

  // Practice
  SESSION_FAIL:   _fail('load session'),
  GRADE_FAIL:     _fail('save progress'),
  UNDO_FAIL:      'Reverted',
};
