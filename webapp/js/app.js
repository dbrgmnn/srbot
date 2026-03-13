const tg = window.Telegram.WebApp;
tg.ready();
tg.expand();

const INIT_DATA = tg.initData;
let sessionWords = [];
let sessionIdx = 0;
let sessionStats = { reviewed: 0, new: 0, good: 0, hard: 0, again: 0 };
let searchTimer = null;
let practiceMode = 'word_to_translation';
let currentLang = 'de';

const langVoices = {
  'de': 'de-DE',
  'en': 'en-US'
};

// ── API ────────────────────────────────────────────────────────────────────

let isProcessing = false;
let isGrading = false;

async function api(method, path, body) {
  const opts = {
    method,
    headers: { 
      'Content-Type': 'application/json', 
      'X-Init-Data': INIT_DATA,
      'X-Language': currentLang
    },
  };
  if (body) opts.body = JSON.stringify(body);
  
  try {
    const res = await fetch(path, opts);
    if (res.status === 401 || res.status === 403) throw new Error('Please open the app from Telegram');
    const contentType = res.headers.get("content-type");
    const isJson = contentType && contentType.includes("application/json");
    const data = isJson ? await res.json() : null;
    if (!res.ok) {
      if (res.status === 409) throw new Error('409');
      if (data && data.error) throw new Error(data.error);
      throw new Error(`Server error (${res.status})`);
    }
    return data;
  } catch (e) {
    if (e.name === 'TypeError') throw new Error('Network error');
    throw e;
  }
}

const GET   = (path)       => api('GET',    path);
const POST  = (path, body) => api('POST',   path, body);
const DEL   = (path)       => api('DELETE', path);
const PATCH = (path, body) => api('PATCH',  path, body);

function toast(msg) {
  const el = document.getElementById('toast');
  if (el) {
    el.textContent = msg;
    el.classList.add('show');
    setTimeout(() => el.classList.remove('show'), 3000);
  }
}

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
      stats = data.stats;
      settings = data.settings;
    } else {
      [stats, settings] = await Promise.all([GET('/api/stats'), GET('/api/settings')]);
    }

    practiceMode = settings.practice_mode || 'word_to_translation';
    const due = stats.due || 0;
    const newWords = stats.new || 0;
    const todayDone = stats.today_new || 0;
    const limit = settings.daily_limit || 20;
    const sessionTotal = due + Math.min(newWords, Math.max(0, limit - todayDone));

    if (document.getElementById('stat-due')) document.getElementById('stat-due').textContent = due;
    if (document.getElementById('stat-new')) document.getElementById('stat-new').textContent = Math.max(0, limit - todayDone);

    const btn = document.getElementById('btn-practice');
    if (btn) {
      btn.textContent = sessionTotal === 0 ? 'Nothing to practice' : 'Practice';
      btn.disabled = sessionTotal === 0;
    }

    // Garden bars
    ['seeds', 'sprouts', 'trees', 'diamonds'].forEach(cat => {
      const val = stats[`g_${cat}`] || 0;
      const bar = document.getElementById(`bar-${cat}`);
      if (bar) bar.style.width = `${Math.round((val / (stats.total || 1)) * 100)}%`;
      const count = document.getElementById(`count-${cat}`);
      if (count) count.textContent = val;
    });
  } catch (e) { toast('Failed to load home'); }
}

// ── Practice ──────────────────────────────────────────────────────────────

async function startPractice() {
  if (isProcessing) return;
  try {
    isProcessing = true;
    const data = await GET('/api/session');
    if (!data.words || data.words.length === 0) {
      toast('Nothing to practice.');
      return;
    }
    sessionWords = data.words;
    sessionIdx = 0;
    sessionStats = { reviewed: 0, new: 0, good: 0, hard: 0, again: 0 };
    showScreen('practice');
    renderWord();
  } catch(e) { toast(e.message); }
  finally { isProcessing = false; }
}

let touchStartX = 0, touchStartY = 0, touchStartTime = 0;
let isSwiping = false, rafId = null;

function initSwipe() {
  const card = document.getElementById('card-current');
  if (!card) return;

  // Use simple event attachment (don't clone to avoid ID issues)
  card.ontouchstart = (e) => {
    if (isGrading) return;
    touchStartX = e.touches[0].clientX;
    touchStartY = e.touches[0].clientY;
    touchStartTime = Date.now();
    isSwiping = false;
    card.classList.add('swiping');
  };

  card.ontouchmove = (e) => {
    if (isGrading) return;
    const deltaX = e.touches[0].clientX - touchStartX;
    const deltaY = e.touches[0].clientY - touchStartY;

    if (Math.abs(deltaX) > 5 || Math.abs(deltaY) > 5) isSwiping = true;

    if (isSwiping) {
      if (rafId) cancelAnimationFrame(rafId);
      rafId = requestAnimationFrame(() => {
        const isFlipped = card.classList.contains('flipped');
        const baseRot = isFlipped ? 180 : 0;
        
        let swipeDir = null;
        if (Math.abs(deltaY) > Math.abs(deltaX) * 1.5 && deltaY < -40) swipeDir = 'up';
        else if (Math.abs(deltaX) > Math.abs(deltaY) * 1.2) {
          if (deltaX < -40) swipeDir = 'left';
          else if (deltaX > 40) swipeDir = 'right';
        }

        card.style.transform = `translate(${deltaX}px, ${deltaY}px) rotateY(${baseRot}deg) rotateZ(${deltaX * 0.1}deg)`;
        card.classList.toggle('swipe-left', swipeDir === 'left');
        card.classList.toggle('swipe-right', swipeDir === 'right');
        card.classList.toggle('swipe-up', swipeDir === 'up');

        if (swipeDir && card.dataset.lastDir !== swipeDir) tg.HapticFeedback.impactOccurred('light');
        card.dataset.lastDir = swipeDir || '';
      });
    }
  };

  card.ontouchend = (e) => {
    if (isGrading) return;
    if (rafId) cancelAnimationFrame(rafId);
    card.classList.remove('swiping');

    const deltaTime = Date.now() - touchStartTime;
    const deltaX = e.changedTouches[0].clientX - touchStartX;
    const deltaY = e.changedTouches[0].clientY - touchStartY;
    const velocity = Math.abs(deltaX) / deltaTime;

    if (!isSwiping) {
      card.classList.toggle('flipped');
      tg.HapticFeedback.impactOccurred('light');
      const rot = card.classList.contains('flipped') ? 180 : 0;
      card.style.transform = `rotateY(${rot}deg)`;
    } else {
      const isFlick = velocity > 0.5;
      if ((deltaX < -60 || (deltaX < -30 && isFlick)) && Math.abs(deltaX) > Math.abs(deltaY) * 1.1) grade(1);
      else if ((deltaX > 100 || (deltaX > 30 && isFlick)) && Math.abs(deltaX) > Math.abs(deltaY) * 1.1) grade(5);
      else if ((deltaY < -80 || (deltaY < -30 && isFlick)) && Math.abs(deltaY) > Math.abs(deltaX) * 1.3) grade(3);
      else {
        card.classList.remove('swipe-left', 'swipe-right', 'swipe-up');
        const rot = card.classList.contains('flipped') ? 180 : 0;
        card.style.transform = `rotateY(${rot}deg)`;
      }
    }
  };
}

function updateCardContent(elementId, word) {
  const el = document.getElementById(elementId);
  if (!el || !word) return;
  
  const front = el.querySelector('.word-front-text');
  const trans = el.querySelector('.word-back-text');
  const ex = el.querySelector('.word-example-text');

  if (front) front.textContent = (practiceMode === 'translation_to_word') ? word.translation : word.word;
  if (trans) trans.textContent = (practiceMode === 'translation_to_word') ? word.word : word.translation;
  if (ex) {
    ex.textContent = word.example || '';
    ex.style.display = word.example ? 'block' : 'none';
  }
}

function renderWord() {
  if (sessionIdx >= sessionWords.length) {
    showSummary();
    return;
  }

  const word = sessionWords[sessionIdx];
  const nextWord = sessionWords[sessionIdx + 1];

  // Update stats & bar
  const progEl = document.getElementById('practice-progress');
  if (progEl) progEl.textContent = `${sessionIdx + 1} / ${sessionWords.length}`;
  const barEl = document.getElementById('practice-bar');
  if (barEl) barEl.style.width = `${Math.round((sessionIdx / sessionWords.length) * 100)}%`;

  const typeEl = document.getElementById('practice-type');
  if (typeEl) {
    const isReview = (word.repetitions || 0) > 0;
    typeEl.textContent = isReview ? 'Review' : 'New';
    typeEl.className = 'practice-badge ' + (isReview ? 'practice-badge-review' : 'practice-badge-new');
  }

  updateCardContent('card-current', word);
  
  const current = document.getElementById('card-current');
  current.classList.remove('flipped', 'swipe-left', 'swipe-right', 'swipe-up');
  current.style.transform = 'rotateY(0deg)';
  current.style.opacity = '1';

  const next = document.getElementById('card-next');
  if (nextWord) {
    updateCardContent('card-next', nextWord);
    next.style.display = 'block';
    next.classList.add('card-stack-back');
  } else {
    next.style.display = 'none';
  }

  initSwipe();
}

async function grade(quality) {
  if (isGrading) return;
  isGrading = true;

  const word = sessionWords[sessionIdx];
  if ((word.repetitions || 0) > 0) sessionStats.reviewed++;
  else sessionStats.new++;

  if (quality === 5) sessionStats.good++;
  else if (quality === 3) sessionStats.hard++;
  else sessionStats.again++;

  const current = document.getElementById('card-current');
  const next = document.getElementById('card-next');

  // Animation out
  const isFlipped = current.classList.contains('flipped');
  const baseRot = isFlipped ? 180 : 0;
  if (quality === 1) current.style.transform = `translate(-1000px, 0) rotateY(${baseRot}deg) rotateZ(-30deg)`;
  else if (quality === 5) current.style.transform = `translate(1000px, 0) rotateY(${baseRot}deg) rotateZ(30deg)`;
  else if (quality === 3) current.style.transform = `translate(0, -1000px) rotateY(${baseRot}deg) scale(0.5)`;
  current.style.opacity = '0';

  // Optimistic stack move
  if (next && sessionIdx + 1 < sessionWords.length) {
    next.classList.remove('card-stack-back');
  }

  tg.HapticFeedback.notificationOccurred('success');
  POST('/api/grade', { word_id: word.id, quality }).catch(() => {});

  sessionIdx++;
  setTimeout(() => {
    isGrading = false;
    renderWord();
  }, 300);
}

// ── Rest of app ───────────────────────────────────────────────────────────

function playAudio(e) {
  if (e) e.stopPropagation();
  const word = sessionWords[sessionIdx];
  if (!word || !window.speechSynthesis) return;
  window.speechSynthesis.cancel();
  const msg = new SpeechSynthesisUtterance(word.word);
  msg.lang = langVoices[currentLang] || 'de-DE';
  msg.rate = 0.85;
  window.speechSynthesis.speak(msg);
}

function showSummary() {
  const total = sessionStats.reviewed + sessionStats.new;
  const msgEl = document.getElementById('sum-total-msg');
  if (msgEl) msgEl.textContent = `You reviewed ${total} words`;
  if (document.getElementById('sum-good')) document.getElementById('sum-good').textContent = sessionStats.good;
  if (document.getElementById('sum-hard')) document.getElementById('sum-hard').textContent = sessionStats.hard;
  if (document.getElementById('sum-again')) document.getElementById('sum-again').textContent = sessionStats.again;
  showScreen('summary');
}

function exitPractice() {
  showScreen('home');
  loadHome();
}

async function submitWords() {
  const input = document.getElementById('add-input');
  if (!input || !input.value.trim()) return;
  const words = parseText(input.value);
  if (!words.length) return;
  try {
    const res = await POST('/api/words', { words });
    if (res.added) {
      toast(`Added ${res.added} words`);
      input.value = '';
      loadHome();
    }
  } catch (e) { toast('Add failed'); }
}

function parseCSVLine(line) {
  const fields = [];
  let current = '', inQuotes = false;
  for (let i = 0; i < line.length; i++) {
    const ch = line[i];
    if (ch === '"') {
      if (inQuotes && line[i+1] === '"') { current += '"'; i++; }
      else inQuotes = !inQuotes;
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

async function loadSearch(q) {
  const el = document.getElementById('search-results');
  if (!el || q.length < 2) { if (el) el.innerHTML = ''; return; }
  try {
    const data = await GET(`/api/words/search?q=${encodeURIComponent(q)}`);
    el.innerHTML = data.words.map(w => `
      <div class="word-row" id="wr-${w.id}">
        <div class="word-row-content" onclick='openEdit(${JSON.stringify(w)})'>
          <div class="word-row-text">${w.word}</div>
          <div class="word-row-trans">${w.translation}</div>
        </div>
        <button class="del-btn" onclick="deleteWord(${w.id})">✕</button>
      </div>
    `).join('');
  } catch(e) {}
}

async function deleteWord(id) {
  try {
    await DEL(`/api/words/${id}`);
    document.getElementById(`wr-${id}`)?.remove();
    loadHome();
  } catch(e) {}
}

let editWordId = null;
function openEdit(w) {
  editWordId = w.id;
  document.getElementById('edit-word').value = w.word;
  document.getElementById('edit-translation').value = w.translation;
  document.getElementById('edit-example').value = w.example || '';
  document.getElementById('edit-overlay').classList.add('open');
  document.getElementById('edit-sheet').classList.add('open');
}

function closeEdit() {
  document.getElementById('edit-overlay').classList.remove('open');
  document.getElementById('edit-sheet').classList.remove('open');
}

async function saveEdit() {
  const word = document.getElementById('edit-word').value.trim();
  const trans = document.getElementById('edit-translation').value.trim();
  const ex = document.getElementById('edit-example').value.trim();
  try {
    await PATCH(`/api/words/${editWordId}`, { word, translation: trans, example: ex });
    closeEdit();
    toast('Saved');
    loadHome();
  } catch(e) {}
}

async function loadSettings() {
  try {
    const s = await GET('/api/settings');
    document.getElementById('set-quiet-start').value = s.quiet_start || '23:00';
    document.getElementById('set-quiet-end').value = s.quiet_end || '08:00';
    document.getElementById('set-limit-val').textContent = s.daily_limit || 20;
    document.getElementById('set-notify-interval').value = s.notification_interval_minutes || 240;
    document.querySelectorAll('.practice-opt').forEach(b => b.classList.toggle('active', b.dataset.mode === s.practice_mode));
  } catch(e) {}
}

async function saveSetting(key, val) {
  try { await POST('/api/settings', { [key]: val }); loadHome(); } catch(e) {}
}

async function init() {
  try {
    const data = await POST('/api/init');
    currentLang = data.settings?.language || 'de';
    await loadHome(data);
  } catch(e) { toast('Init failed'); }
}

document.addEventListener('DOMContentLoaded', init);
