// ── Toast function ────────────────────────────────────────────────────────

export function toast(msg, type = 'info') {
  const el = document.getElementById('toast');
  if (!el) return;
  el.textContent = msg;
  el.className = `toast toast-${type} show`;
  setTimeout(() => el.classList.remove('show'), 3000);
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
  WORD_SAVED:     _saved,
  WORD_SAVE_FAIL: _fail('save'),
  DELETE_FAIL:    _fail('delete'),

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
  IMPORT_ADDED:   _added,
  IMPORT_FAIL:    _fail('import'),

  // App
  INIT_FAIL:      _fail('load app'),

  // Practice
  SESSION_FAIL:   _fail('load session'),
  GRADE_FAIL:     _fail('save progress'),
  UNDO_FAIL:      _fail('undo'),
};
