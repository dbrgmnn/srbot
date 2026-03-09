const tg = window.Telegram.WebApp;
tg.ready();
tg.expand();

const INIT_DATA = tg.initData;
let sessionWords = [];
let sessionIdx = 0;
let sessionStats = { reviewed: 0, new: 0, good: 0, hard: 0, again: 0 };
let searchTimer = null;
let practiceMode = 'word_to_translation';

// ── API ────────────────────────────────────────────────────────────────────

async function api(method, path, body) {
  const opts = {
    method,
    headers: { 'Content-Type': 'application/json', 'X-Init-Data': INIT_DATA },
  };
  if (body) opts.body = JSON.stringify(body);
  const res = await fetch(path, opts);
  if (res.status === 401 || res.status === 403) throw new Error('Unauthorized');
  if (res.status === 409) throw new Error('409');
  if (res.status === 400) {
    const error = await res.json();
    throw new Error(error.msg || 'Bad request');
  }
  return res.json();
}

const GET   = (path)       => api('GET',    path);
const POST  = (path, body) => api('POST',   path, body);
const DEL   = (path)       => api('DELETE', path);
const PATCH = (path, body) => api('PATCH',  path, body);

// ── Toast ─────────────────────────────────────────────────────────────────

function toast(msg) {
  const el = document.getElementById('toast');
  if (el) {
    el.textContent = msg;
    el.classList.add('show');
    setTimeout(() => el.classList.remove('show'), 3000);
  }
}

// ── Nav ───────────────────────────────────────────────────────────────────

function showScreen(name) {
  document.querySelectorAll('.screen').forEach(s => s.classList.remove('active'));
  document.querySelectorAll('.nav-btn').forEach(b => b.classList.remove('active'));
  const screen = document.getElementById(`screen-${name}`);
  if (screen) screen.classList.add('active');
  const nav = document.getElementById(`nav-${name}`);
  if (nav) nav.classList.add('active');
}

// ── Home ──────────────────────────────────────────────────────────────────

async function loadHome(data) {
  try {
    let stats, settings;
    if (data) {
      stats    = data.stats;
      settings = { ...data.settings, timezone: data.timezone };
    } else {
      [stats, settings] = await Promise.all([
        GET('/api/stats'),
        GET('/api/settings'),
      ]);
    }

    practiceMode = settings.practice_mode || 'word_to_translation';

    const due     = stats.due     || 0;
    const newW    = stats.new     || 0;
    const learned = stats.learned || 0;
    const total   = stats.total   || 0;
    const limit   = settings.daily_limit || 20;

    const sessionDue   = Math.min(due, limit);
    const sessionNew   = Math.min(newW, Math.max(0, limit - sessionDue));
    const sessionTotal = sessionDue + sessionNew;

    if (document.getElementById('stat-due')) document.getElementById('stat-due').textContent = due;
    if (document.getElementById('stat-new')) document.getElementById('stat-new').textContent = sessionNew;

    // Garden stats
    const totalWords = stats.total || 1; // avoid div by 0
    const categories = ['seeds', 'sprouts', 'trees', 'diamonds'];
    categories.forEach(cat => {
      const val = stats[`g_${cat}`] || 0;
      const countEl = document.getElementById(`count-${cat}`);
      const barEl   = document.getElementById(`bar-${cat}`);
      if (countEl) countEl.textContent = val;
      if (barEl)   barEl.style.width = `${Math.round((val / totalWords) * 100)}%`;
    });

    const btn = document.getElementById('btn-practice');
    if (btn) {
      if (sessionTotal === 0) {
        btn.textContent  = 'Nothing to practice';
        btn.disabled = true;
      } else {
        btn.textContent  = 'Practice';
        btn.disabled = false;
      }
    }
  } catch (e) {
    if (e.message === 'Unauthorized') toast('Please open the app from Telegram');
    else toast('Failed to load stats');
  }
}

// ── Practice ──────────────────────────────────────────────────────────────

async function startPractice() {
  try {
    const data = await GET('/api/session');
    if (!data.words || data.words.length === 0) {
      toast('Nothing to practice right now.');
      return;
    }
    sessionWords = data.words;
    sessionIdx   = 0;
    sessionStats = { reviewed: 0, new: 0, good: 0, hard: 0, again: 0 };
    showScreen('practice');
    renderWord();
  } catch(e) { toast(e.message); }
}

function renderWord() {
  const total = sessionWords.length;
  const word  = sessionWords[sessionIdx];
  const pct   = Math.round((sessionIdx / total) * 100);

  const progEl  = document.getElementById('practice-progress');
  const typeEl  = document.getElementById('practice-type');
  const barEl   = document.getElementById('practice-bar');
  const frontEl = document.getElementById('word-front');

  if (progEl) progEl.textContent = `${sessionIdx + 1} / ${total}`;
  if (typeEl) {
    const isReview = Number(word.repetitions) > 0;
    typeEl.textContent = isReview ? 'Review' : 'New';
    typeEl.className = 'practice-badge ' + (isReview ? 'practice-badge-review' : 'practice-badge-new');
  }
  if (barEl) barEl.style.width = `${pct}%`;
  if (frontEl) {
    frontEl.textContent = (practiceMode === 'translation_to_word')
      ? word.translation
      : word.word;
  }

  // reset card
  const card = document.querySelector('.word-card');
  if (card) {
    card.classList.remove('flipped');
    card.onclick = flipCard;
  }

  // lock grade buttons until flip
  ['grade-again', 'grade-hard', 'grade-good'].forEach(id => {
    const btn = document.getElementById(id);
    if (btn) btn.disabled = true;
  });
}

function flipCard() {
  const card = document.querySelector('.word-card');
  if (!card || card.classList.contains('flipped')) return;
  showAnswer();
}

function showAnswer() {
  const word    = sessionWords[sessionIdx];
  const transEl = document.getElementById('word-translation');
  const exEl    = document.getElementById('word-ex');

  if (transEl) {
    transEl.textContent = (practiceMode === 'translation_to_word')
      ? word.word
      : word.translation;
  }
  if (exEl) {
    if (word.example) {
      exEl.textContent   = word.example;
      exEl.style.display = 'block';
    } else {
      exEl.style.display = 'none';
    }
  }

  const card = document.querySelector('.word-card');
  if (card) card.classList.add('flipped');

  // unlock grade buttons after flip
  ['grade-again', 'grade-hard', 'grade-good'].forEach(id => {
    const btn = document.getElementById(id);
    if (btn) btn.disabled = false;
  });

  tg.HapticFeedback.impactOccurred('light');
}

async function grade(quality) {
  const word = sessionWords[sessionIdx];
  if (word.repetitions > 0) sessionStats.reviewed++;
  else sessionStats.new++;

  if (quality === 5) sessionStats.good++;
  else if (quality === 3) sessionStats.hard++;
  else sessionStats.again++;

  await POST('/api/grade', { word_id: word.id, quality, word });
  tg.HapticFeedback.impactOccurred('light');

  sessionIdx++;
  if (sessionIdx >= sessionWords.length) showSummary();
  else renderWord();
}

function showSummary() {
  const total   = sessionStats.reviewed + sessionStats.new;
  const msgEl   = document.getElementById('sum-total-msg');
  const goodEl  = document.getElementById('sum-good');
  const hardEl  = document.getElementById('sum-hard');
  const againEl = document.getElementById('sum-again');

  if (msgEl)   msgEl.textContent   = `You reviewed ${total} words`;
  if (goodEl)  goodEl.textContent  = sessionStats.good;
  if (hardEl)  hardEl.textContent  = sessionStats.hard;
  if (againEl) againEl.textContent = sessionStats.again;

  showScreen('summary');
  document.querySelectorAll('.nav-btn').forEach(b => b.classList.remove('active'));
}

function exitPractice() {
  showScreen('home');
  loadHome();
}

// ── Add words ─────────────────────────────────────────────────────────────

async function submitWords() {
  const inputEl = document.getElementById('add-input');
  if (!inputEl) return;
  const raw = inputEl.value.trim();
  if (!raw) return;
  const words = parseText(raw);
  if (words.length === 0) { toast('Nothing to parse'); return; }
  try {
    const res = await POST('/api/words', { words });
    const count = res.added ?? 0;
    if (count > 0) {
      toast(`Added ${count} words`);
      inputEl.value = '';
      tg.HapticFeedback.notificationOccurred('success');
    } else {
      toast('No new words added');
    }
  } catch (e) {
    toast('Failed to add words');
  }
}

function handleFileUpload(input) {
  const file = input.files[0];
  if (!file) return;
  const reader = new FileReader();
  reader.onload = function(e) {
    const text  = e.target.result;
    const words = parseText(text);
    if (words.length > 0) {
      const inputEl = document.getElementById('add-input');
      if (inputEl) inputEl.value = text;
      toast(`Parsed ${words.length} words`);
    }
  };
  reader.readAsText(file);
}

function parseText(text) {
  const lines = text.split('\n').filter(l => l.trim());
  const words = [];
  for (const line of lines) {
    const sep   = line.includes(';') ? ';' : ',';
    const parts = line.split(sep);
    if (parts.length >= 2 && parts[0] && parts[1]) {
      words.push({ word: parts[0], translation: parts[1], example: parts[2] || null });
    }
  }
  return words;
}

// ── Search ────────────────────────────────────────────────────────────────

function onSearchInput(val) {
  clearTimeout(searchTimer);
  searchTimer = setTimeout(() => loadSearch(val), 300);
}

function highlight(text, query) {
  if (!query || query.length < 2) return esc(text);
  const escapedQuery = query.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  const parts = text.split(new RegExp(`(${escapedQuery})`, 'gi'));
  return parts.map(p => {
    return p.toLowerCase() === query.toLowerCase()
      ? `<mark>${esc(p)}</mark>`
      : esc(p);
  }).join('');
}

async function loadSearch(query) {
  const el = document.getElementById('search-results');
  if (!el) return;

  const q = (query || '').trim();

  if (q.length < 2) {
    el.innerHTML = '';
    return;
  }

  try {
    const data = await GET(`/api/words/search?q=${encodeURIComponent(q)}`);
    if (!data.words || data.words.length === 0) {
      el.innerHTML = `<div class="no-results">No results</div>`;
      return;
    }
    el.innerHTML = data.words.map(w => `
      <div class="word-row" id="wr-${w.id}">
        <div class="word-row-content" onclick='openEdit(${JSON.stringify(w)})'>
          <div class="word-row-text">${highlight(w.word, query)}</div>
          <div class="word-row-trans">${highlight(w.translation, query)}</div>
        </div>
        <button class="del-btn" onclick="deleteWord(${w.id})">✕</button>
      </div>
    `).join('');
  } catch (e) {
    console.error(e);
  }
}

async function deleteWord(id) {
  try {
    await DEL(`/api/words/${id}`);
    document.getElementById(`wr-${id}`)?.remove();
    toast('Deleted');
    tg.HapticFeedback.impactOccurred('medium');
  } catch (e) {
    toast('Delete failed');
  }
}

// ── Edit word ────────────────────────────────────────────────────────────

let editWordId = null;

function openEdit(w) {
  editWordId = w.id;
  document.getElementById('edit-word').value        = w.word        || '';
  document.getElementById('edit-translation').value = w.translation || '';
  document.getElementById('edit-example').value     = w.example     || '';
  document.getElementById('edit-overlay').classList.add('open');
  document.getElementById('edit-sheet').classList.add('open');
  tg.HapticFeedback.impactOccurred('light');
}

function closeEdit() {
  document.getElementById('edit-overlay').classList.remove('open');
  document.getElementById('edit-sheet').classList.remove('open');
  editWordId = null;
}

async function saveEdit() {
  const word        = document.getElementById('edit-word').value.trim();
  const translation = document.getElementById('edit-translation').value.trim();
  const example     = document.getElementById('edit-example').value.trim();
  if (!word || !translation) { toast('Word and translation required'); return; }
  const btn = document.getElementById('edit-save-btn');
  btn.disabled = true;
  try {
    await PATCH(`/api/words/${editWordId}`, { word, translation, example });
    const row = document.getElementById(`wr-${editWordId}`);
    if (row) {
      row.querySelector('.word-row-text').textContent  = word;
      row.querySelector('.word-row-trans').textContent = translation;
    }
    closeEdit();
    toast('Saved');
    tg.HapticFeedback.notificationOccurred('success');
  } catch (e) {
    toast(e.message === '409' ? 'Word already exists' : 'Failed to save');
  } finally {
    btn.disabled = false;
  }
}

// ── Settings ──────────────────────────────────────────────────────────────

async function loadSettings() {
  try {
    const s      = await GET('/api/settings');
    const qStart = document.getElementById('set-quiet-start');
    const qEnd   = document.getElementById('set-quiet-end');
    const limit  = document.getElementById('set-limit');
    const tzEl   = document.getElementById('info-tz');
    const wordEl = document.getElementById('info-words');
    const intEl = document.getElementById('set-notify-interval');

    if (qStart) qStart.value = s.quiet_start || '23:00';
    if (qEnd)   qEnd.value   = s.quiet_end   || '08:00';
    if (limit)  limit.value  = s.daily_limit || 20;
    if (intEl)  intEl.value  = s.notification_interval_minutes || 240;

    const mode = s.practice_mode || 'word_to_translation';
    document.querySelectorAll('.practice-opt').forEach(btn => {
      btn.classList.toggle('active', btn.dataset.mode === mode);
    });

    if (tzEl)   tzEl.textContent  = `Timezone: ${s.timezone || 'UTC'}`;
    if (wordEl) wordEl.textContent = `Dictionary: ${s.total_words || 0} words`;
  } catch (e) {
    console.error(e);
  }
}

async function saveSetting(key, value) {
  try {
    await POST('/api/settings', { [key]: value });
    toast('Settings saved');
    tg.HapticFeedback.impactOccurred('light');
    loadHome();
  } catch(e) {
    toast(e.message);
    loadSettings();
  }
}

function setPracticeMode(mode) {
  document.querySelectorAll('.practice-opt').forEach(btn => {
    btn.classList.toggle('active', btn.dataset.mode === mode);
  });
  saveSetting('practice_mode', mode);
}

// ── Delete all words ─────────────────────────────────────────────────────

function clearAllWords() {
  tg.showConfirm('Delete all words?', async (confirmed) => {
    if (!confirmed) return;
    try {
      await DEL('/api/words/all');
      toast('All words deleted');
      tg.HapticFeedback.notificationOccurred('success');
      loadHome();
    } catch (e) {
      toast('Failed to delete words');
    }
  });
}

// ── Share words as text ─────────────────────────────────────────────────────

async function shareWords() {
  try {
    const res = await fetch('/api/words/export', {
      method: 'GET',
      headers: { 'X-Init-Data': INIT_DATA },
    });
    if (!res.ok) {
      toast('Failed to load words');
      return;
    }
    const text = await res.text();
    if (!text.trim()) {
      toast('No words to share');
      return;
    }
    try {
      if (typeof navigator.share === 'function') {
        await navigator.share({ title: 'SRbot dictionary', text });
        toast('Shared');
      } else {
        await navigator.clipboard.writeText(text);
        toast('Copied to clipboard');
      }
      if (tg.HapticFeedback) tg.HapticFeedback.notificationOccurred('success');
    } catch (e) {
      if (e.name === 'AbortError') return;
      await navigator.clipboard.writeText(text);
      toast('Copied to clipboard');
    }
  } catch (e) {
    console.error(e);
    toast('Share failed');
  }
}

function esc(str) {
  return String(str)
    .replace(/&/g, '&amp;').replace(/</g, '&lt;')
    .replace(/>/g, '&gt;').replace(/"/g, '&quot;');
}

// ── Init ──────────────────────────────────────────────────────────────────

async function init() {
  try {
    const data = await POST('/api/init', {});
    await loadHome(data);
  } catch (e) {
    if (e.message === 'Unauthorized') toast('Please open the app from Telegram');
    else toast('Failed to load');
  }
}

document.addEventListener('DOMContentLoaded', () => {
  init();
});
