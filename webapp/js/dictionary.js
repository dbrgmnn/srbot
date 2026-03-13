import { GET, POST, DEL, PATCH, state } from './api.js';
import { toast, loadHome } from './ui.js';

const tg = window.Telegram.WebApp;
let searchTimer = null;
let editWordId = null;

export async function submitWords() {
  const input = document.getElementById('add-input');
  if (!input || !input.value.trim()) return;
  const words = parseText(input.value);
  if (!words.length) { toast('Nothing to parse'); return; }
  try {
    const res = await POST('/api/words', { words });
    if (res.added) { toast(`Added ${res.added} words`); input.value = ''; loadHome(); }
  } catch (e) { toast('Add failed'); }
}

export async function handleFileUpload(input) {
  const file = input.files[0];
  if (!file) return;
  const reader = new FileReader();
  reader.onload = async (e) => {
    const words = parseText(e.target.result);
    input.value = '';
    if (!words.length) { toast('No words found'); return; }
    try {
      const res = await POST('/api/words', { words });
      if (res.added) { toast(`Added ${res.added} words`); loadHome(); }
    } catch (e) { toast('Upload failed'); }
  };
  reader.readAsText(file);
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
  return text.split('\n').filter(l => l.trim()).map(line => {
    const p = parseCSVLine(line);
    return (p[0] && p[1]) ? { word: p[0], translation: p[1], example: p[2] || null } : null;
  }).filter(x => x);
}

export function onSearchInput(val) {
  clearTimeout(searchTimer);
  searchTimer = setTimeout(() => loadSearch(val), 300);
}

function highlight(text, query) {
  if (!query || query.length < 2) return esc(text);
  const escapedQuery = query.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  const parts = text.split(new RegExp(`(${escapedQuery})`, 'gi'));
  return parts.map(p => p.toLowerCase() === query.toLowerCase() ? `<mark>${esc(p)}</mark>` : esc(p)).join('');
}

function esc(str) {
  return String(str).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
}

async function loadSearch(q) {
  const el = document.getElementById('search-results');
  if (!el || q.length < 2) { if (el) el.innerHTML = ''; return; }
  try {
    const data = await GET(`/api/words/search?q=${encodeURIComponent(q)}`);
    el.innerHTML = data.words.map(w => `
      <div class="word-row" id="wr-${w.id}">
        <div class="word-row-content" data-word='${JSON.stringify(w).replace(/'/g, "&apos;")}'>
          <div class="word-row-text">${highlight(w.word, q)}</div>
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
  } catch(e) { toast('Search failed'); }
}

async function deleteWord(id) {
  try {
    await DEL(`/api/words/${id}`);
    document.getElementById(`wr-${id}`)?.remove();
    loadHome();
  } catch(e) { toast('Delete failed'); }
}

export function openEdit(w) {
  editWordId = w.id;
  document.getElementById('edit-word').value = w.word;
  document.getElementById('edit-translation').value = w.translation;
  document.getElementById('edit-example').value = w.example || '';
  document.getElementById('edit-overlay').classList.add('open');
  document.getElementById('edit-sheet').classList.add('open');
}

export function closeEdit() {
  document.getElementById('edit-overlay').classList.remove('open');
  document.getElementById('edit-sheet').classList.remove('open');
}

export async function saveEdit() {
  const word = document.getElementById('edit-word').value.trim();
  const trans = document.getElementById('edit-translation').value.trim();
  const ex = document.getElementById('edit-example').value.trim();
  try {
    await PATCH(`/api/words/${editWordId}`, { word, translation: trans, example: ex });
    closeEdit();
    toast('Saved');
    loadHome();
  } catch(e) { toast('Save failed'); }
}

export function clearAllWords() {
  tg.showConfirm(`Delete all ${state.currentLang.toUpperCase()} words?`, async (ok) => {
    if (ok) {
      try { await DEL('/api/words/all'); toast('Cleared'); loadHome(); }
      catch(e) { toast('Failed'); }
    }
  });
}

export async function shareWords() {
  try {
    const res = await fetch('/api/words/export', { headers: { 'X-Init-Data': tg.initData, 'X-Language': state.currentLang }});
    const text = await res.text();
    if (navigator.share) await navigator.share({ title: 'SRbot dictionary', text });
    else { await navigator.clipboard.writeText(text); toast('Copied'); }
  } catch (e) { toast('Export failed'); }
}
