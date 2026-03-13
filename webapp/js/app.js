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

// Helper to get local timezone offset in minutes (e.g. -120)
function getTzOffset() {
  return -new Date().getTimezoneOffset();
}

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
    
    if (res.status === 401 || res.status === 403) {
      throw new Error('Please open the app from Telegram');
    }

    const contentType = res.headers.get("content-type");
    const isJson = contentType && contentType.includes("application/json");
    const data = isJson ? await res.json() : null;

    if (!res.ok) {
      if (res.status === 409) throw new Error('409');
      if (data && data.msg) throw new Error(data.msg);
      if (data && data.error) throw new Error(data.error);
      throw new Error(`Server error (${res.status})`);
    }

    return data;
  } catch (e) {
    if (e.name === 'TypeError') throw new Error('Network error, check your connection');
    throw e;
  }
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

async function switchLanguage(lang) {
  if (currentLang === lang || isProcessing) return;
  currentLang = lang;
  tg.HapticFeedback.impactOccurred('light');
  
  // Show minimal visual feedback that language is changing
  document.querySelectorAll('.lang-opt').forEach(btn => {
    btn.classList.toggle('active', btn.dataset.lang === currentLang);
  });

  try {
    isProcessing = true;
    await Promise.all([loadSettings(), loadHome()]);
  } catch (e) {
    toast('Error switching language');
  } finally {
    isProcessing = false;
  }
}

let currentLimit = 20;
async function changeLimit(delta) {
  if (isProcessing) return;
  const el = document.getElementById('set-limit-val');
  let val = parseInt(el.textContent) + delta;
  if (val < 5) val = 5;
  if (val > 50) val = 50;
  el.textContent = val;
  tg.HapticFeedback.impactOccurred('light');
  await saveSetting('daily_limit', val);
}

async function loadHome(data) {
  try {
    let stats, settings;
    if (data) {
      stats    = data.stats;
      settings = data.settings;
    } else {
      [stats, settings] = await Promise.all([
        GET('/api/stats'),
        GET('/api/settings'),
      ]);
    }

    practiceMode = settings.practice_mode || 'word_to_translation';

    const due       = stats.due       || 0;
    const newWords  = stats.new       || 0;
    const todayDone = stats.today_new || 0;
    const limit     = settings.daily_limit || 20;

    const remainingLimit = Math.max(0, limit - todayDone);
    const sessionNew     = Math.min(newWords, remainingLimit);
    const sessionTotal   = due + sessionNew;

    document.querySelectorAll('.lang-opt').forEach(btn => {
      btn.classList.toggle('active', btn.dataset.lang === currentLang);
    });

    if (document.getElementById('stat-due')) document.getElementById('stat-due').textContent = due;
    if (document.getElementById('stat-new')) {
      const remaining = Math.max(0, limit - todayDone);
      document.getElementById('stat-new').textContent = remaining;
    }

    // Greeting
    const user = tg.initDataUnsafe?.user;
    const greetingEl = document.getElementById('user-greeting');
    if (greetingEl) {
      greetingEl.textContent = user?.first_name ? `Hello, ${user.first_name}!` : 'Welcome back!';
    }

    // Garden stats
    const totalWords = stats.total || 1; 
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
    toast('Failed to load stats');
  }
}

// ── Practice ──────────────────────────────────────────────────────────────

async function startPractice() {
  if (isProcessing) return;
  try {
    isProcessing = true;
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
    
    if (tg.disableVerticalSwipes) tg.disableVerticalSwipes();
  } catch(e) { 
    toast(e.message); 
  } finally {
    isProcessing = false;
  }
}

let touchStartX = 0;
let touchStartY = 0;
let touchStartTime = 0;
let isSwiping = false;
let rafId = null;

function initSwipe() {
  const card = document.getElementById('card-current');
  if (!card) return;

  // Cleanup old listeners if any (though standard app replaces nodes)
  const newCard = card.cloneNode(true);
  card.parentNode.replaceChild(newCard, card);

  newCard.addEventListener('touchstart', (e) => {
    if (isGrading) return;
    touchStartX = e.touches[0].clientX;
    touchStartY = e.touches[0].clientY;
    touchStartTime = Date.now();
    isSwiping = false;
    newCard.classList.add('swiping');
  });

  newCard.addEventListener('touchmove', (e) => {
    if (isGrading) return;
    const touchX = e.touches[0].clientX;
    const touchY = e.touches[0].clientY;
    const deltaX = touchX - touchStartX;
    const deltaY = touchY - touchStartY;

    if (Math.abs(deltaX) > 5 || Math.abs(deltaY) > 5) isSwiping = true;

    if (isSwiping) {
      if (rafId) cancelAnimationFrame(rafId);
      
      rafId = requestAnimationFrame(() => {
        const isFlipped = newCard.classList.contains('flipped');
        const baseRotation = isFlipped ? 180 : 0;
        
        // Asymmetric thresholds
        const leftThreshold = -60;
        const rightThreshold = 100;
        const upThreshold = -80;

        let swipeDir = null;
        if (Math.abs(deltaY) > Math.abs(deltaX) * 1.5) {
          if (deltaY < upThreshold) swipeDir = 'up';
        } else if (Math.abs(deltaX) > Math.abs(deltaY) * 1.2) {
          if (deltaX < leftThreshold) swipeDir = 'left';
          else if (deltaX > rightThreshold) swipeDir = 'right';
        }

        const rotationZ = deltaX * 0.1;
        newCard.style.transform = `translate(${deltaX}px, ${deltaY}px) rotateY(${baseRotation}deg) rotateZ(${rotationZ}deg)`;
        
        newCard.classList.toggle('swipe-left', swipeDir === 'left');
        newCard.classList.toggle('swipe-right', swipeDir === 'right');
        newCard.classList.toggle('swipe-up', swipeDir === 'up');

        if (swipeDir && newCard.lastDir !== swipeDir) {
          tg.HapticFeedback.impactOccurred('light');
        }
        newCard.lastDir = swipeDir;
      });
    }
  });

  newCard.addEventListener('touchend', (e) => {
    if (isGrading) return;
    if (rafId) cancelAnimationFrame(rafId);
    newCard.classList.remove('swiping');

    const deltaTime = Date.now() - touchStartTime;
    const touchEndX = e.changedTouches[0].clientX;
    const touchEndY = e.changedTouches[0].clientY;
    const deltaX = touchEndX - touchStartX;
    const deltaY = touchEndY - touchStartY;
    
    // Velocity sensing
    const velocityX = Math.abs(deltaX) / deltaTime;
    const velocityY = Math.abs(deltaY) / deltaTime;
    const vThreshold = 0.5; // px/ms

    const lastDir = newCard.lastDir;
    newCard.lastDir = null;

    if (!isSwiping) {
      newCard.classList.toggle('flipped');
      tg.HapticFeedback.impactOccurred('light');
      newCard.style.transform = newCard.classList.contains('flipped') ? 'rotateY(180deg)' : 'rotateY(0deg)';
    } else {
      const leftThreshold  = -60; 
      const rightThreshold = 100;
      const upThreshold    = -80;

      const isFlickLeft  = (deltaX < -30 && velocityX > vThreshold);
      const isFlickRight = (deltaX > 30 && velocityX > vThreshold);
      const isFlickUp    = (deltaY < -30 && velocityY > vThreshold);

      if ((deltaX < leftThreshold || isFlickLeft) && Math.abs(deltaX) > Math.abs(deltaY) * 1.1) {
        grade(1); 
      } else if ((deltaX > rightThreshold || isFlickRight) && Math.abs(deltaX) > Math.abs(deltaY) * 1.1) {
        grade(5); 
      } else if ((deltaY < upThreshold || isFlickUp) && Math.abs(deltaY) > Math.abs(deltaX) * 1.3) {
        grade(3); 
      } else {
        newCard.classList.remove('swipe-left', 'swipe-right', 'swipe-up');
        const isFlipped = newCard.classList.contains('flipped');
        newCard.style.transform = isFlipped ? 'rotateY(180deg)' : 'rotateY(0deg)';
      }
    }
  });
}

function renderWord() {
  const total = sessionWords.length;
  if (sessionIdx >= total) {
    showSummary();
    return;
  }

  const word = sessionWords[sessionIdx];
  const nextWord = sessionWords[sessionIdx + 1];
  const pct = Math.round((sessionIdx / total) * 100);

  // Update Progress
  const progEl = document.getElementById('practice-progress');
  const typeEl = document.getElementById('practice-type');
  const barEl = document.getElementById('practice-bar');
  if (progEl) progEl.textContent = `${sessionIdx + 1} / ${total}`;
  if (typeEl) {
    const isReview = Number(word.repetitions) > 0;
    typeEl.textContent = isReview ? 'Review' : 'New';
    typeEl.className = 'practice-badge ' + (isReview ? 'practice-badge-review' : 'practice-badge-new');
  }
  if (barEl) barEl.style.width = `${pct}%`;

  // Populate Current Card
  const current = document.getElementById('card-current');
  current.querySelector('#word-front').textContent = (practiceMode === 'translation_to_word') ? word.translation : word.word;
  current.querySelector('#word-translation').textContent = (practiceMode === 'translation_to_word') ? word.word : word.translation;
  const exEl = current.querySelector('#word-ex');
  exEl.textContent = word.example || '';
  exEl.style.display = word.example ? 'block' : 'none';
  
  current.classList.remove('flipped', 'swipe-left', 'swipe-right', 'swipe-up');
  current.style.transform = '';
  current.style.opacity = '1';

  // Populate Next Card (Stack)
  const next = document.getElementById('card-next');
  if (nextWord) {
    next.querySelector('.next-word-front').textContent = (practiceMode === 'translation_to_word') ? nextWord.translation : nextWord.word;
    next.querySelector('.next-word-translation').textContent = (practiceMode === 'translation_to_word') ? nextWord.word : nextWord.translation;
    const nExEl = next.querySelector('.next-word-ex');
    nExEl.textContent = nextWord.example || '';
    nExEl.style.display = nextWord.example ? 'block' : 'none';
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
  if (word.repetitions > 0) sessionStats.reviewed++;
  else sessionStats.new++;

  if (quality === 5) sessionStats.good++;
  else if (quality === 3) sessionStats.hard++;
  else sessionStats.again++;

  const current = document.getElementById('card-current');
  const next = document.getElementById('card-next');

  // 1. Animate current card out
  if (current) {
    const isFlipped = current.classList.contains('flipped');
    const rot = isFlipped ? 180 : 0;
    if (quality === 1) current.style.transform = `translate(-1000px, ${Math.random() * 400 - 200}px) rotateY(${rot}deg) rotateZ(-60deg)`;
    else if (quality === 5) current.style.transform = `translate(1000px, ${Math.random() * 400 - 200}px) rotateY(${rot}deg) rotateZ(60deg)`;
    else if (quality === 3) current.style.transform = `translate(0, -1000px) rotateY(${rot}deg) scale(0.2)`;
    current.style.opacity = '0';
  }

  // 2. OPTIMISTIC: Immediately bring next card forward
  if (next && sessionIdx + 1 < sessionWords.length) {
    next.classList.remove('card-stack-back');
    next.classList.add('card-stack-front');
  }

  tg.HapticFeedback.notificationOccurred('success');

  // 3. Background API call (Fire and forget)
  POST('/api/grade', { word_id: word.id, quality }).catch(e => console.error("Sync error", e));

  sessionIdx++;

  // 4. Transition Logic
  setTimeout(() => {
    if (sessionIdx >= sessionWords.length) {
      showSummary();
    } else {
      // Swap IDs and roles for seamless loop
      const oldCurrent = document.getElementById('card-current');
      const oldNext = document.getElementById('card-next');

      oldCurrent.id = 'card-next';
      oldCurrent.className = 'word-card card-stack-back';
      
      oldNext.id = 'card-current';
      oldNext.className = 'word-card card-stack-front';

      renderWord();
    }
    isGrading = false;
  }, 300);
}

function playAudio(e) {
  if (e) e.stopPropagation();
  if (!sessionWords.length) return;
  
  const word = sessionWords[sessionIdx];
  if (!word || !word.word) return;

  if (!window.speechSynthesis) {
    toast('Audio not supported');
    return;
  }

  window.speechSynthesis.cancel();
  const msg = new SpeechSynthesisUtterance(word.word);
  msg.lang = langVoices[currentLang] || 'de-DE';
  msg.rate = 0.85;
  window.speechSynthesis.speak(msg);
  
  tg.HapticFeedback.impactOccurred('light');
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
  if (tg.enableVerticalSwipes) tg.enableVerticalSwipes();
  showScreen('home');
  loadHome();
}

// ── Add/Search/Edit Logic ──────────────────────────────────────────────────

async function submitWords() {
  if (isProcessing) return;
  const inputEl = document.getElementById('add-input');
  if (!inputEl) return;
  const raw = inputEl.value.trim();
  if (!raw) return;
  const words = parseText(raw);
  if (words.length === 0) { toast('Nothing to parse'); return; }
  
  try {
    isProcessing = true;
    const res = await POST('/api/words', { words });
    const count = res.added ?? 0;
    if (count > 0) {
      toast(`Added ${count} words`);
      inputEl.value = '';
      tg.HapticFeedback.notificationOccurred('success');
      loadHome(); // refresh stats
    } else {
      toast('No new words added');
    }
  } catch (e) { 
    toast('Failed to add words'); 
  } finally {
    isProcessing = false;
  }
}

async function handleFileUpload(input) {
  if (isProcessing) return;
  const file = input.files[0];
  if (!file) return;
  const reader = new FileReader();
  reader.onload = async function(e) {
    const words = parseText(e.target.result);
    input.value = '';
    if (words.length === 0) { toast('No words found in file'); return; }
    try {
      isProcessing = true;
      const res = await POST('/api/words', { words });
      const count = res.added ?? 0;
      if (count > 0) {
        toast(`Added ${count} words`);
        tg.HapticFeedback.notificationOccurred('success');
        loadHome(); // refresh stats
      } else {
        toast('No new words added');
      }
    } catch (e) { 
      toast('Failed to add words'); 
    } finally {
      isProcessing = false;
    }
  };
  reader.readAsText(file);
}

function parseCSVLine(line) {
  const fields = [];
  let current = '';
  let inQuotes = false;
  for (let i = 0; i < line.length; i++) {
    const ch = line[i];
    if (ch === '"') {
      if (inQuotes && line[i + 1] === '"') { current += '"'; i++; } // escaped quote
      else inQuotes = !inQuotes;
    } else if (ch === ',' && !inQuotes) {
      fields.push(current.trim());
      current = '';
    } else {
      current += ch;
    }
  }
  fields.push(current.trim());
  return fields;
}

function parseText(text) {
  const lines = text.split('\n').filter(l => l.trim());
  const words = [];
  for (let i = 0; i < lines.length; i++) {
    const parts = parseCSVLine(lines[i]);
    const word        = (parts[0] || '').trim();
    const translation = (parts[1] || '').trim();
    const example     = (parts[2] || '').trim() || null;
    const level        = (parts[3] || '').trim() || null;
    if (i === 0 && word.toLowerCase() === 'term') continue;
    if (word && translation) {
      words.push({ word, translation, example, level });
    }
  }
  return words;
}

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
      ? `<mark>${esc(p)}</mark>` : esc(p);
  }).join('');
}

async function loadSearch(query) {
  const el = document.getElementById('search-results');
  if (!el) return;
  const q = (query || '').trim();
  if (q.length < 2) { el.innerHTML = ''; return; }
  try {
    const data = await GET(`/api/words/search?q=${encodeURIComponent(q)}`);
    if (!data.words || data.words.length === 0) {
      el.innerHTML = `<div class="no-results">No results</div>`;
      return;
    }
    el.innerHTML = data.words.map(w => `
      <div class="word-row" id="wr-${w.id}">
        <div class="word-row-content" onclick="openEdit(${JSON.stringify(w).replace(/"/g, '&quot;')})">
          <div class="word-row-text">${highlight(w.word, q)}</div>
          <div class="word-row-trans">${highlight(w.translation, q)}</div>
        </div>
        <button class="del-btn" onclick="deleteWord(${w.id})">✕</button>
      </div>
    `).join('');
  } catch (e) { 
    toast('Search failed');
  }
}

async function deleteWord(id) {
  try {
    await DEL(`/api/words/${id}`);
    document.getElementById(`wr-${id}`)?.remove();
    toast('Deleted');
    tg.HapticFeedback.impactOccurred('medium');
    loadHome(); // refresh stats
  } catch (e) { toast('Delete failed'); }
}

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
  } finally { btn.disabled = false; }
}

// ── Settings ──────────────────────────────────────────────────────────────

async function loadSettings() {
  try {
    const s      = await GET('/api/settings');
    const qStart = document.getElementById('set-quiet-start');
    const qEnd   = document.getElementById('set-quiet-end');
    const limitVal = document.getElementById('set-limit-val');
    const tzEl   = document.getElementById('info-tz');
    const wordEl = document.getElementById('info-words');
    const intEl  = document.getElementById('set-notify-interval');

    if (qStart) qStart.value = s.quiet_start || '23:00';
    if (qEnd)   qEnd.value   = s.quiet_end   || '08:00';
    if (limitVal) limitVal.textContent = s.daily_limit || 20;
    if (intEl)  intEl.value  = s.notification_interval_minutes || 240;

    const langOpts = document.querySelectorAll('.lang-opt');
    if (langOpts.length > 0) {
      langOpts.forEach(btn => {
        btn.classList.toggle('active', btn.dataset.lang === currentLang);
      });
    }

    const modeBtnWord = document.getElementById('mode-word');
    if (modeBtnWord) modeBtnWord.textContent = currentLang.toUpperCase();

    const mode = s.practice_mode || 'word_to_translation';
    document.querySelectorAll('.practice-opt').forEach(btn => {
      btn.classList.toggle('active', btn.dataset.mode === mode);
    });

    if (tzEl)   tzEl.textContent   = `Timezone: ${s.timezone || 'UTC'}`;
    if (wordEl) wordEl.textContent = `Dictionary: ${s.total_words || 0} words`;
  } catch (e) { 
    toast('Failed to load settings');
  }
}

async function saveSetting(key, value) {
  try {
    await POST('/api/settings', { [key]: value });
    toast('Settings saved');
    tg.HapticFeedback.impactOccurred('light');
    loadHome();
  } catch(e) { toast(e.message); loadSettings(); }
}

function setPracticeMode(mode) {
  document.querySelectorAll('.practice-opt').forEach(btn => {
    btn.classList.toggle('active', btn.dataset.mode === mode);
  });
  saveSetting('practice_mode', mode);
}

function clearAllWords() {
  const langUpper = currentLang.toUpperCase();
  tg.showConfirm(`Delete all ${langUpper} words?`, async (confirmed) => {
    if (!confirmed) return;
    try {
      await DEL('/api/words/all');
      toast(`All ${langUpper} words deleted`);
      tg.HapticFeedback.notificationOccurred('success');
      loadHome();
    } catch (e) { toast('Failed to delete words'); }
  });
}

async function shareWords() {
  try {
    const res = await fetch('/api/words/export', {
      method: 'GET',
      headers: { 'X-Init-Data': INIT_DATA, 'X-Language': currentLang },
    });
    if (!res.ok) { toast('Failed to load words'); return; }
    const text = await res.text();
    if (!text.trim()) { toast('No words to share'); return; }
    try {
      if (typeof navigator.share === 'function') {
        await navigator.share({ title: 'SRbot dictionary', text });
        toast('Shared');
      } else {
        await navigator.clipboard.writeText(text);
        toast('Copied to clipboard');
      }
      tg.HapticFeedback.notificationOccurred('success');
    } catch (e) {
      if (e.name === 'AbortError') return;
      await navigator.clipboard.writeText(text);
      toast('Copied to clipboard');
    }
  } catch (e) { toast('Share failed'); }
}

function esc(str) {
  return String(str)
    .replace(/&/g, '&amp;').replace(/</g, '&lt;')
    .replace(/>/g, '&gt;').replace(/"/g, '&quot;');
}

async function init() {
  try {
    const data = await POST('/api/init');
    // Sync currentLang with settings from server if needed
    if (data.settings && data.settings.language) {
      currentLang = data.settings.language;
    }
    await loadHome(data);
  } catch (e) {
    if (e.message === 'Unauthorized') toast('Please open the app from Telegram');
    else toast('Failed to load');
  }
}

document.addEventListener('DOMContentLoaded', () => {
  init();
});