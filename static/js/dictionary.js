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

export async function submitWords() {
  if (isSubmitting) return;
  const wordEl = document.getElementById("add-word");
  const transEl = document.getElementById("add-translation");
  const exEl = document.getElementById("add-example");
  const levelEl = document.getElementById("add-level");

  const word = wordEl.value.trim();
  const translation = transEl.value.trim();
  const example = exEl.value.trim() || null;
  const level = levelEl.value.trim() || null;

  if (!word || !translation) {
    toast(T.WORD_REQUIRED, "error");
    return;
  }

  isSubmitting = true;
  try {
    const res = await API.post("/api/words", {
      words: [{ word, translation, example, level }],
    });
    if (res.result && res.result.added) {
      UI.toast(T.WORD_ADDED(word), "success");
      wordEl.value = "";
      transEl.value = "";
      exEl.value = "";
      levelEl.value = "";
      const levelDisp = document.getElementById("add-level-display");
      if (levelDisp) {
        levelDisp.textContent = "Level";
        levelDisp.classList.add("picker-trigger-placeholder");
      }

      state.currentStats = null;
    } else {
      UI.toast(T.WORD_DUPLICATE, "error");
    }
  } catch (e) {
    UI.toast(T.WORD_ADD_FAIL, "error");
  } finally {
    isSubmitting = false;
  }
}

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
      const res = await API.post("/api/words", { words });
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
            ${w.level ? `<span class="word-row-level">${w.level}</span>` : ""}
          </div>
          <div class="word-row-trans">${highlight(w.translation, q)}</div>
        </div>
        <button class="del-btn" data-id="${w.id}">
          <svg><use href="#icon-trash"></use></svg>
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

async function deleteWord(id) {
  try {
    await API.delete(`/api/words/${id}`);
    document.getElementById(`wr-${id}`)?.remove();
    state.currentStats = null;
  } catch (e) {
    UI.toast(T.DELETE_FAIL, "error");
  }
}
