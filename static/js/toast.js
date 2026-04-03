/** ── Translation Logic ──
 * This file contains all UI-facing strings for the application.
 */

const _fail = (what) => `Failed to ${what}`;
const _added = (n) => `Added ${n} words`;

export const T = {
  // Dictionary — Add
  WORD_REQUIRED: "Fill in word and translation",
  WORD_ADDED: (w) => `Added: ${w}`,
  WORD_ADD_FAIL: _fail("add word"),

  // Dictionary — CSV Upload
  NO_WORDS_CSV: "No words found in file",
  CSV_ADDED: _added,
  CSV_FAIL: _fail("upload file"),

  // Dictionary — Edit / Delete
  WORD_SAVED: "Saved",
  WORD_SAVE_FAIL: _fail("save"),
  WORD_DUPLICATE: "Word already exists",
  DELETE_FAIL: _fail("delete"),

  // Dictionary — Clear / Export / Search
  CLEARED: "Dictionary cleared",
  CLEAR_FAIL: _fail("clear"),
  COPIED: "Copied to clipboard",
  COPY_FAIL: "Please copy the token manually",
  EXPORT_FAIL: _fail("export"),
  SEARCH_FAIL: "Search error",

  // Settings
  SAVED: "Saved",
  SAVE_FAIL: _fail("save"),
  LANG_SWITCHED: (l) => `Switched to ${l}`,
  LANG_FAIL: _fail("switch language"),
  TOKEN_REVOKED: "New token generated",
  REVOKE_FAIL: _fail("revoke token"),

  // App
  INIT_FAIL: _fail("load app"),

  // Practice
  SESSION_FAIL: _fail("load session"),
  GRADE_FAIL: _fail("save progress"),
  UNDO_FAIL: "Reverted",

  // Filters
  EMPTY_QUEUE: "Your queue is empty",
  EMPTY_LEARNING: "No words in learning status",
  EMPTY_KNOWN: "No known words yet",
  EMPTY_MASTERED: "No mastered words yet",
  EMPTY_TODAY_ADDED: "No words added today yet",
  EMPTY_TODAY_LEARNED: "No words learned today yet",
};
