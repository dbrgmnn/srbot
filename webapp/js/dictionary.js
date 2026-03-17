import { GET, POST, DEL, PATCH, state } from './api.js';
import { loadHome } from './ui.js';
import { toast, T } from './toast.js';

const tg = window.Telegram.WebApp;
let searchTimer = null;
let editWordId = null;

// ── Internal helpers ──────────────────────────────────────────────────────

function esc(str) {
  return String(str).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
}

function highlight(text, query) {
  if (!query || query.length < 2) return esc(text);
  const escapedQuery = query.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  const parts = text.split(new RegExp(`(${escapedQuery})`, 'gi'));
  return parts.map(p => p.toLowerCase() === query.toLowerCase() ? `<mark>${esc(p)}</mark>` : esc(p)).join('');
}

function parseCSVLine(line) {
  const fields = [];
  let current = '', inQuotes = false;
  for (let i = 0; i < line.length; i++) {
    const ch = line[i];
    if (ch === '"') {
      if (inQuotes && line[i+1] === '"') { current += '"'; i++; } else inQuotes = !inQuotes;
    } else if (ch === ',' && !inQuotes) { fields.push(current.trim()); current = ''; }
    else current += ch;
  }
  fields.push(current.trim());
  return fields;
}

function parseText(text) {
  return text.split('\n').filter(l => l.trim()).filter(line => {
    const first = line.split(',')[0].trim().toLowerCase();
    return first !== 'term' && first !== 'word';
  }).map(line => {
    const p = parseCSVLine(line);
    return (p[0] && p[1]) ? {
      word: p[0],
      translation: p[1],
      example: p[2] || null,
      level: p[3] || null
    } : null;
  }).filter(x => x);
}

// ── Public functions ──────────────────────────────────────────────────────

export async function submitWords() {
  const wordEl = document.getElementById('add-word');
  const transEl = document.getElementById('add-translation');
  const exEl = document.getElementById('add-example');
  const levelEl = document.getElementById('add-level');

  const word = wordEl.value.trim();
  const translation = transEl.value.trim();
  const example = exEl.value.trim() || null;
  const level = levelEl.value.trim() || null;

  if (!word || !translation) {
    toast(T.WORD_REQUIRED, 'error');
    return;
  }

  try {
    const res = await POST('/api/words', { words: [{ word, translation, example, level }] });
    if (res.result && res.result.added) {
      toast(T.WORD_ADDED(word), 'success');
      wordEl.value = ''; transEl.value = ''; exEl.value = ''; levelEl.value = '';
      const levelDisp = document.getElementById('add-level-display');
      if (levelDisp) { levelDisp.textContent = 'Level'; levelDisp.classList.add('picker-trigger-placeholder'); }
      loadHome();
    }
  } catch (e) { toast(T.WORD_ADD_FAIL, 'error'); }
}

export async function handleFileUpload(input) {
  const file = input.files[0];
  if (!file) return;
  const reader = new FileReader();
  reader.onload = async (e) => {
    const words = parseText(e.target.result);
    input.value = '';
    if (!words.length) { toast(T.NO_WORDS_CSV, 'error'); return; }
    try {
      const res = await POST('/api/words', { words });
      if (res.result && res.result.added) { toast(T.CSV_ADDED(res.result.added), 'success'); loadHome(); }
    } catch (e) { toast(T.CSV_FAIL, 'error'); }
  };
  reader.readAsText(file);
}

export function onSearchInput(val) {
  clearTimeout(searchTimer);
  searchTimer = setTimeout(() => loadSearch(val), 300);
}

export function openEdit(w) {
  editWordId = w.id;
  document.getElementById('edit-word').value = w.word;
  document.getElementById('edit-translation').value = w.translation;
  document.getElementById('edit-example').value = w.example || '';

  const levelVal = w.level || '';
  const levelInput = document.getElementById('edit-level');
  const levelDisp = document.getElementById('edit-level-display');
  if (levelInput) levelInput.value = levelVal;
  if (levelDisp) {
    levelDisp.textContent = levelVal || 'Level';
    levelDisp.classList.toggle('picker-trigger-placeholder', !levelVal);
  }

  document.getElementById('edit-overlay').classList.add('open');
  document.getElementById('edit-sheet').classList.add('open');
  window._lockScroll();
}

export function closeEdit() {
  document.getElementById('edit-overlay').classList.remove('open');
  document.getElementById('edit-sheet').classList.remove('open');
  window._unlockScroll();
}

export async function saveEdit() {
  const word = document.getElementById('edit-word').value.trim();
  const trans = document.getElementById('edit-translation').value.trim();
  const ex = document.getElementById('edit-example').value.trim();
  const level = document.getElementById('edit-level').value.trim();
  try {
    await PATCH(`/api/words/${editWordId}`, { word, translation: trans, example: ex, level });
    closeEdit();
    toast(T.WORD_SAVED, 'success');
    loadHome();
  } catch(e) { toast(T.WORD_SAVE_FAIL, 'error'); }
}

export function clearAllWords() {
  tg.showConfirm(`Delete all ${state.currentLang.toUpperCase()} words?`, async (ok) => {
    if (ok) {
      try { await DEL('/api/words/all'); toast(T.CLEARED, 'success'); loadHome(); }
      catch(e) { toast(T.CLEAR_FAIL, 'error'); }
    }
  });
}

export async function shareWords() {
  try {
    const res = await fetch('/api/words/export', {
      headers: {
        'X-Init-Data': tg.initData,
        'X-Language': state.currentLang,
        'X-Timezone': Intl.DateTimeFormat().resolvedOptions().timeZone,
      }
    });
    if (!res.ok) throw new Error(`Error ${res.status}`);
    const text = await res.text();
    if (navigator.share) await navigator.share({ title: 'SRbot dictionary', text });
    else { await navigator.clipboard.writeText(text); toast(T.COPIED, 'success'); }
  } catch (e) { toast(T.EXPORT_FAIL, 'error'); }
}

// ── Internal async ────────────────────────────────────────────────────────

async function loadSearch(q) {
  const el = document.getElementById('search-results');
  if (!el || q.length < 2) { if (el) el.innerHTML = ''; return; }
  try {
    const data = await GET(`/api/words/search?q=${encodeURIComponent(q)}`);
    el.innerHTML = data.result.words.map(w => `
      <div class="word-row" id="wr-${w.id}">
        <div class="word-row-content" data-word='${JSON.stringify(w).replace(/'/g, "&apos;")}'>
          <div class="word-row-text">
            ${highlight(w.word, q)}
            ${w.level ? `<span class="word-row-level">${w.level}</span>` : ''}
          </div>
          <div class="word-row-trans">${highlight(w.translation, q)}</div>
        </div>
        <button class="del-btn" data-id="${w.id}">✕</button>
      </div>
    `).join('');

    el.querySelectorAll('.word-row-content').forEach(item => {
      item.onclick = () => openEdit(JSON.parse(item.dataset.word));
    });
    el.querySelectorAll('.del-btn').forEach(btn => {
      btn.onclick = () => deleteWord(btn.dataset.id);
    });
  } catch(e) { toast(T.SEARCH_FAIL, 'error'); }
}

async function deleteWord(id) {
  try {
    await DEL(`/api/words/${id}`);
    document.getElementById(`wr-${id}`)?.remove();
    loadHome();
  } catch(e) { toast(T.DELETE_FAIL, 'error'); }
}
