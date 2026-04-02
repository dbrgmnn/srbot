import { API, UI, lockScroll, unlockScroll } from "./utils.js";
import { state } from "./state.js";
import { T } from "./toast.js";

const tg = window.Telegram.WebApp;
let searchTimer = null;
let editWordId = null;

/** --- Internal Helpers --- */

function esc(str) {
  return String(str)
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

function highlight(text, query) {
  if (!query || query.length < 2) return esc(text);
  const escapedQuery = query.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
  const parts = text.split(new RegExp(`(${escapedQuery})`, "gi"));
  return parts
    .map((p) =>
      p.toLowerCase() === query.toLowerCase()
        ? `<mark>${esc(p)}</mark>`
        : esc(p),
    )
    .join("");
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
      toast(T.NO_WORDS_CSV, "error");
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

export function clearSearch() {
  const input = document.getElementById("search-input");
  const clearBtn = document.getElementById("search-clear");
  const results = document.getElementById("search-results");
  if (input) input.value = "";
  if (clearBtn) clearBtn.classList.add("u-hidden");
  if (results) results.innerHTML = "";
  if (input) input.focus();
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
      results.innerHTML = `
        <div class="word-row" id="wr-${added.id}">
          <div class="word-row-content" data-word='${JSON.stringify(
            added,
          ).replace(/'/g, "&apos;")}'>
            <div class="word-row-text">
              ${esc(added.word)}
              ${
                added.level
                  ? `<span class="word-row-level">${esc(added.level)}</span>`
                  : ""
              }
            </div>
            <div class="word-row-trans">${esc(added.translation)}</div>
          </div>
          <button class="del-btn" data-id="${added.id}">
            <svg class="u-svg-md"><use href="#icon-trash"></use></svg>
          </button>
        </div>
      `;

      // Bind the click listeners
      const row = results.querySelector(".word-row");
      row.querySelector(".word-row-content").onclick = (e) => {
        const item = e.currentTarget;
        if (item.dataset.word) openEdit(JSON.parse(item.dataset.word));
      };
      row.querySelector(".del-btn").onclick = () => deleteWord(added.id);

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

    // Refresh search results to show the updated word
    const searchInput = document.getElementById("search-input");
    if (searchInput && searchInput.value) {
      loadSearch(searchInput.value);
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

export async function showTodayAdded() {
  window.showScreen("search");
  const results = document.getElementById("search-results");
  const input = document.getElementById("search-input");
  const clearBtn = document.getElementById("search-clear");

  if (input) input.value = "";
  if (clearBtn) clearBtn.classList.add("u-hidden");
  if (results)
    results.innerHTML = `<div class="u-flex-center u-p24"><span class="spinner"></span></div>`;

  try {
    const data = await API.get("/api/words/search?filter=today");
    if (!data.result.words.length) {
      results.innerHTML = `<div class="u-p32 u-text-center u-hint">No words added today yet</div>`;
      return;
    }

    results.innerHTML = data.result.words
      .map(
        (w) => `
      <div class="word-row" id="wr-${w.id}">
        <div class="word-row-content" data-word='${JSON.stringify(w).replace(
          /'/g,
          "&apos;",
        )}'>
          <div class="word-row-text">
            ${esc(w.word)}
            ${
              w.level
                ? `<span class="word-row-level">${esc(w.level)}</span>`
                : ""
            }
          </div>
          <div class="word-row-trans">${esc(w.translation)}</div>
        </div>
        <button class="del-btn" data-id="${w.id}">
          <svg class="u-svg-md"><use href="#icon-trash"></use></svg>
        </button>
      </div>
    `,
      )
      .join("");

    results.querySelectorAll(".word-row-content").forEach((item) => {
      item.onclick = () => openEdit(JSON.parse(item.dataset.word));
    });
    results.querySelectorAll(".del-btn").forEach((btn) => {
      btn.onclick = () => deleteWord(btn.dataset.id);
    });
  } catch (e) {
    UI.toast(T.SEARCH_FAIL, "error");
  }
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
  const el = document.getElementById("search-results");
  if (!el || q.length < 2) {
    if (el) el.innerHTML = "";
    return;
  }
  try {
    const data = await API.get(`/api/words/search?q=${encodeURIComponent(q)}`);
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
      return;
    }
    el.innerHTML = data.result.words
      .map(
        (w) => `
      <div class="word-row" id="wr-${w.id}">
        <div class="word-row-content" data-word='${JSON.stringify(w).replace(
          /'/g,
          "&apos;",
        )}'>
          <div class="word-row-text">
            ${highlight(w.word, q)}
            ${
              w.level
                ? `<span class="word-row-level">${esc(w.level)}</span>`
                : ""
            }
          </div>
          <div class="word-row-trans">${highlight(w.translation, q)}</div>
        </div>
        <button class="del-btn" data-id="${w.id}">
          <svg class="u-svg-md"><use href="#icon-trash"></use></svg>
        </button>
      </div>
    `,
      )
      .join("");

    el.querySelectorAll(".word-row-content").forEach((item) => {
      item.onclick = () => openEdit(JSON.parse(item.dataset.word));
    });
    el.querySelectorAll(".del-btn").forEach((btn) => {
      btn.onclick = () => deleteWord(btn.dataset.id);
    });
  } catch (e) {
    toast(T.SEARCH_FAIL, "error");
  }
}

export async function deleteWord(id) {
  try {
    await API.delete(`/api/words/${id}`);
    document.getElementById(`wr-${id}`)?.remove();
    state.currentStats = null;
  } catch (e) {
    UI.toast(T.DELETE_FAIL, "error");
  }
}

export async function showTodayLearned() {
  window.showScreen("search");
  const results = document.getElementById("search-results");
  const input = document.getElementById("search-input");
  const clearBtn = document.getElementById("search-clear");

  if (input) input.value = "";
  if (clearBtn) clearBtn.classList.add("u-hidden");
  if (results)
    results.innerHTML = `<div class="u-flex-center u-p24"><span class="spinner"></span></div>`;

  try {
    const data = await API.get("/api/words/search?filter=reviewed");
    if (!data.result.words.length) {
      results.innerHTML = `<div class="u-p32 u-text-center u-hint">No words learned today yet</div>`;
      return;
    }

    results.innerHTML = data.result.words
      .map(
        (w) => `
      <div class="word-row" id="wr-${w.id}">
        <div class="word-row-content" data-word='${JSON.stringify(w).replace(
          /'/g,
          "&apos;",
        )}'>
          <div class="word-row-text">
            ${esc(w.word)}
            ${
              w.level
                ? `<span class="word-row-level">${esc(w.level)}</span>`
                : ""
            }
          </div>
          <div class="word-row-trans">${esc(w.translation)}</div>
        </div>
        <button class="del-btn" data-id="${w.id}">
          <svg class="u-svg-md"><use href="#icon-trash"></use></svg>
        </button>
      </div>
    `,
      )
      .join("");

    results.querySelectorAll(".word-row-content").forEach((item) => {
      item.onclick = () => openEdit(JSON.parse(item.dataset.word));
    });
    results.querySelectorAll(".del-btn").forEach((btn) => {
      btn.onclick = () => deleteWord(btn.dataset.id);
    });
  } catch (e) {
    console.error("Show today learned error:", e);
    results.innerHTML = `<div class="u-p32 u-text-center u-danger">Could not load words</div>`;
  }
}
