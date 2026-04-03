import { API, UI, lockScroll, unlockScroll } from "./utils.js";
import { state } from "./state.js";
import { T } from "./toast.js";

const tg = window.Telegram.WebApp;
let searchTimer = null;
let currentSearchId = 0;
let editWordId = null;
let isSelectMode = false;
let selectedWords = new Set();

/** --- Internal Helpers --- */

function esc(str) {
  return String(str)
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

function parseCSVLine(line) {
  const fields = [];
  let current = "",
    inQuotes = false;
  for (let i = 0; i < line.length; i++) {
    const ch = line[i];
    if (ch === '"') {
      if (inQuotes && line[i + 1] === '"') {
        current += '"';
        i++;
      } else inQuotes = !inQuotes;
    } else if (ch === "," && !inQuotes) {
      fields.push(current.trim());
      current = "";
    } else current += ch;
  }
  fields.push(current.trim());
  return fields;
}

function parseText(text) {
  return text
    .split("\n")
    .filter((l) => l.trim())
    .filter((line) => {
      const first = line.split(",")[0].trim().toLowerCase();
      return first !== "word";
    })
    .map((line) => {
      const p = parseCSVLine(line);
      return p[0] && p[1]
        ? {
            word: p[0],
            translation: p[1],
            example: p[2] || null,
            level: p[3] || null,
          }
        : null;
    })
    .filter((x) => x);
}

/** --- Public Functions --- */

let isSubmitting = false;

export async function handleFileUpload(input) {
  const file = input.files[0];
  if (!file) return;
  const reader = new FileReader();
  reader.onload = async (e) => {
    const words = parseText(e.target.result);
    input.value = "";
    if (!words.length) {
      UI.toast(T.NO_WORDS_CSV, "error");
      return;
    }
    try {
      const res = await API.post("/api/words/batch", { words });
      if (res.result && res.result.added) {
        UI.toast(T.CSV_ADDED(res.result.added), "success");
        state.currentStats = null;
      } else {
        UI.toast(T.WORD_DUPLICATE, "error");
      }
    } catch (e) {
      UI.toast(T.CSV_FAIL, "error");
    }
  };
  reader.readAsText(file);
}

export function onSearchInput(val) {
  clearTimeout(searchTimer);
  const clearBtn = document.getElementById("search-clear");
  if (clearBtn) clearBtn.classList.toggle("u-hidden", !val);
  searchTimer = setTimeout(() => loadSearch(val), 300);
}

export function clearSearch(shouldFocus = true) {
  clearTimeout(searchTimer);
  currentSearchId++;
  const input = document.getElementById("search-input");
  const clearBtn = document.getElementById("search-clear");
  const results = document.getElementById("search-results");
  if (input) input.value = "";
  if (clearBtn) clearBtn.classList.add("u-hidden");
  if (results) results.innerHTML = "";
  if (shouldFocus && input) input.focus();

  if (isSelectMode) toggleSelectMode();
  checkSearchActions(0);
}

export function openEdit(w) {
  editWordId = w.id;
  document.getElementById("edit-word").value = w.word;
  document.getElementById("edit-translation").value = w.translation;
  document.getElementById("edit-example").value = w.example || "";

  const levelVal = w.level || "";
  const levelInput = document.getElementById("edit-level");
  const levelDisp = document.getElementById("edit-level-display");
  if (levelInput) levelInput.value = levelVal;
  if (levelDisp) {
    levelDisp.textContent = levelVal || "Level";
    levelDisp.classList.toggle("picker-trigger-placeholder", !levelVal);
  }

  document.getElementById("edit-overlay").classList.add("open");
  document.getElementById("edit-sheet").classList.add("open");
  lockScroll();
}

export function closeEdit() {
  document.getElementById("edit-overlay").classList.remove("open");
  document.getElementById("edit-sheet").classList.remove("open");
  unlockScroll();
}

/** --- Word Row Builder --- */

function highlightMatch(text, query) {
  if (!query) return esc(text);
  const search = query.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
  const regex = new RegExp(`(${search})`, "gi");
  const parts = String(text).split(regex);
  return parts
    .map((part, i) => {
      if (i % 2 === 1) return `<mark class="u-highlight">${esc(part)}</mark>`;
      return esc(part);
    })
    .join("");
}

function createWordRow(w, q = "") {
  const row = document.createElement("div");
  row.className = "word-row";
  if (isSelectMode) {
    row.classList.add("is-selecting");
    if (selectedWords.has(w.id)) row.classList.add("is-selected");
  }
  row.id = `wr-${w.id}`;

  row.innerHTML = `
    <div class="word-row-checkbox">
      <div class="checkbox-circle"></div>
    </div>
    <div class="word-row-info">
      <div class="word-row-text">${highlightMatch(w.word, q)}</div>
      <div class="word-row-trans">${highlightMatch(w.translation, q)}</div>
    </div>
    ${w.level ? `<span class="word-row-level">${esc(w.level)}</span>` : ""}
  `;

  row.onclick = () => {
    if (isSelectMode) {
      toggleWordSelection(w.id, row);
    } else {
      openEdit(w);
    }
  };

  return row;
}

function toggleWordSelection(id, row) {
  if (selectedWords.has(id)) {
    selectedWords.delete(id);
    row.classList.remove("is-selected");
  } else {
    selectedWords.add(id);
    row.classList.add("is-selected");
  }
  updateBulkBar();
}

function updateBulkBar() {
  const btnDelete = document.getElementById("btn-bulk-delete");
  const count = selectedWords.size;

  if (count > 0) {
    btnDelete.classList.remove("u-hidden");
    btnDelete.textContent = `Delete ${count}`;
  } else {
    btnDelete.classList.add("u-hidden");
  }
}

function checkSearchActions(count) {
  const actions = document.getElementById("search-actions");
  if (!actions) return;
  actions.classList.toggle("u-hidden", count === 0);
}

export function toggleSelectMode() {
  isSelectMode = !isSelectMode;
  const btnSelect = document.getElementById("btn-select-mode");

  if (isSelectMode) {
    btnSelect.textContent = "Cancel";
    btnSelect.classList.remove("btn-secondary");
  } else {
    btnSelect.textContent = "Select";
    btnSelect.classList.add("btn-secondary");
    selectedWords.clear();
    updateBulkBar();
  }

  const results = document.getElementById("search-results");
  const rows = results.querySelectorAll(".word-row");
  rows.forEach((r) => {
    r.classList.toggle("is-selecting", isSelectMode);
    if (!isSelectMode) r.classList.remove("is-selected");
  });
}

export async function executeBulkDelete() {
  const count = selectedWords.size;
  if (count === 0) return;

  const proceed = async (ok) => {
    if (ok) {
      try {
        const ids = Array.from(selectedWords);
        await API.delete("/api/words/batch", { ids });

        ids.forEach((id) => {
          document.getElementById(`wr-${id}`)?.remove();
        });

        selectedWords.clear();
        updateBulkBar();
        if (isSelectMode) toggleSelectMode();
        state.currentStats = null;
        UI.toast(`Deleted ${count} words`, "success");

        // Hide actions if no words left in view
        checkSearchActions(document.querySelectorAll(".word-row").length);
      } catch (e) {
        UI.toast(T.DELETE_FAIL, "error");
      }
    }
  };

  if (tg.showConfirm) {
    tg.showConfirm("Delete selected words?", proceed);
  } else if (confirm("Delete selected words?")) {
    proceed(true);
  }
}

export async function addWordWithAI(word, btn) {
  if (isSubmitting || !word) return;
  isSubmitting = true;

  const originalContent = btn.innerHTML;
  btn.classList.add("is-loading");
  btn.disabled = true;
  btn.innerHTML = `<span class="spinner"></span> Generating...`;

  try {
    const res = await API.post("/api/words", { word });
    if (res.ok && res.result) {
      const added = res.result;
      if (added.added === 0) {
        UI.toast(T.WORD_DUPLICATE, "info");
      } else {
        UI.toast(`Added: ${added.word}`, "success");
      }

      // Clear input and hide the clear button
      const input = document.getElementById("search-input");
      const clearBtn = document.getElementById("search-clear");
      if (input) input.value = "";
      if (clearBtn) clearBtn.classList.add("u-hidden");

      // Show the newly added word as the sole result
      const results = document.getElementById("search-results");
      results.innerHTML = "";
      results.appendChild(createWordRow(added));
      checkSearchActions(1);

      state.currentStats = null; // Trigger home stats refresh
    } else {
      UI.toast(T.WORD_ADD_FAIL, "error");
    }
  } catch (e) {
    UI.toast(T.WORD_ADD_FAIL, "error");
  } finally {
    isSubmitting = false;
    btn.classList.remove("is-loading");
    btn.disabled = false;
    btn.innerHTML = originalContent;
  }
}

export async function saveEdit() {
  if (isSubmitting) return;
  const word = document.getElementById("edit-word").value.trim();
  const trans = document.getElementById("edit-translation").value.trim();
  const ex = document.getElementById("edit-example").value.trim();
  const level = document.getElementById("edit-level").value.trim();

  isSubmitting = true;
  try {
    await API.patch(`/api/words/${editWordId}`, {
      word,
      translation: trans,
      example: ex,
      level,
    });
    closeEdit();
    UI.toast(T.WORD_SAVED, "success");
    state.currentStats = null;

    // Update the row in the DOM directly for immediate feedback
    const searchInput = document.getElementById("search-input");
    const q = searchInput ? searchInput.value : "";
    const existingRow = document.getElementById(`wr-${editWordId}`);
    if (existingRow) {
      existingRow.replaceWith(
        createWordRow(
          {
            id: editWordId,
            word,
            translation: trans,
            example: ex,
            level,
          },
          q,
        ),
      );
    }
  } catch (e) {
    UI.toast(
      e.message === "409" ? T.WORD_DUPLICATE : T.WORD_SAVE_FAIL,
      "error",
    );
  } finally {
    isSubmitting = false;
  }
}

/** --- Filtered Views --- */

async function showByFilter(filter) {
  const reqId = ++currentSearchId;
  window.showScreen("search");
  if (isSelectMode) toggleSelectMode();
  const results = document.getElementById("search-results");
  const input = document.getElementById("search-input");
  const clearBtn = document.getElementById("search-clear");

  if (input) input.value = "";
  if (clearBtn) clearBtn.classList.add("u-hidden");
  if (results)
    results.innerHTML = `<div class="u-flex-center u-p24"><span class="spinner"></span></div>`;
  checkSearchActions(0);

  try {
    const data = await API.get(`/api/words/search?filter=${filter}`);
    if (reqId !== currentSearchId) return;

    if (!data.result.words.length) {
      results.innerHTML = "";
      return;
    }

    results.innerHTML = "";
    data.result.words.forEach((w) => {
      results.appendChild(createWordRow(w));
    });
    checkSearchActions(data.result.words.length);
  } catch (e) {
    if (reqId !== currentSearchId) return;
    results.innerHTML = `<div class="u-p32 u-text-center u-danger">Could not load words</div>`;
    checkSearchActions(0);
  }
}

export function showTodayAdded() {
  showByFilter("today");
}

export function showTodayLearned() {
  showByFilter("reviewed");
}

export function showQueue() {
  showByFilter("new");
}

export function showLearning() {
  showByFilter("learning");
}

export function showKnown() {
  showByFilter("known");
}

export function showMastered() {
  showByFilter("mastered");
}

export async function shareWords() {
  try {
    const text = await API.get("/api/words/export");
    if (navigator.share) {
      try {
        await navigator.share({ title: "SRbot dictionary", text });
      } catch (e) {
        if (e.name === "AbortError") return;
        throw e;
      }
    } else {
      await navigator.clipboard.writeText(text);
      UI.toast(T.COPIED, "success");
    }
  } catch (e) {
    UI.toast(T.EXPORT_FAIL, "error");
  }
}

/** --- Internal Async --- */

async function loadSearch(q) {
  const reqId = ++currentSearchId;
  const el = document.getElementById("search-results");
  if (!el || q.length < 2) {
    if (el) el.innerHTML = "";
    checkSearchActions(0);
    return;
  }
  try {
    const data = await API.get(`/api/words/search?q=${encodeURIComponent(q)}`);
    if (reqId !== currentSearchId) return;

    if (data.result.words.length === 0) {
      el.innerHTML = `
        <div class="settings-row" style="padding: 12px 16px; gap: 12px;">
          <div class="settings-row-left" style="min-width: 0; flex: 1;">
            <div class="settings-label" style="font-weight: 600; color: var(--text); white-space: nowrap; overflow: hidden; text-overflow: ellipsis;">
              "${esc(q)}"
            </div>
          </div>
          <button class="btn btn-sm" style="width: auto; margin: 0; padding: 10px 24px; flex-shrink: 0;" onclick="addWordWithAI('${esc(
            q,
          )}', this)">
            Add
          </button>
        </div>
      `;
      checkSearchActions(0);
      return;
    }
    el.innerHTML = "";
    data.result.words.forEach((w) => {
      el.appendChild(createWordRow(w, q));
    });
    checkSearchActions(data.result.words.length);
  } catch (e) {
    if (reqId !== currentSearchId) return;
    UI.toast(T.SEARCH_FAIL, "error");
  }
}

/** --- Keyboard Support --- */
document.addEventListener("focusin", (e) => {
  if (e.target.tagName === "INPUT" || e.target.tagName === "TEXTAREA") {
    document.body.classList.add("keyboard-visible");
  }
});
document.addEventListener("focusout", (e) => {
  document.body.classList.remove("keyboard-visible");
});
