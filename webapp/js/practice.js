import { GET, POST, state } from './api.js';
import { showScreen } from './ui.js';
import { toast, T } from './toast.js';

const tg = window.Telegram.WebApp;

let sessionWords = [];
let sessionIdx = 0;
let sessionStats = { good: 0, hard: 0, again: 0 };
let practiceHistory = [];
let isGrading = false;
let isSwiping = false;
let pointerStartX = 0, pointerStartY = 0, pointerStartTime = 0;
let rafId = null;
let hintCache = {};

export async function startPractice() {
  try {
    const data = await GET('/api/session');
    const words = data.result.words;
    if (!words || words.length === 0) return;
    sessionWords = words;
    sessionIdx = 0;
    sessionStats = { good: 0, hard: 0, again: 0 };
    practiceHistory = [];
    hintCache = {};
    showScreen('practice');
    initSwipe();
    renderWord();
  } catch(e) { console.error(e); toast(T.SESSION_FAIL, 'error'); }
}

function handleStart(x, y) {
  if (isGrading) return;
  pointerStartX = x;
  pointerStartY = y;
  pointerStartTime = Date.now();
  isSwiping = false;
  const card = document.getElementById('word-card');
  if (card) {
    card.classList.add('swiping');
    card.style.cursor = 'grabbing';
  }
}

function handleMove(x, y) {
  if (isGrading || (pointerStartX === 0 && pointerStartY === 0)) return;
  const deltaX = x - pointerStartX;
  const deltaY = y - pointerStartY;
  if (Math.abs(deltaX) > 5 || Math.abs(deltaY) > 5) {
    isSwiping = true;
  }

  if (isSwiping) {
    const card = document.getElementById('word-card');
    if (!card) return;
    if (rafId) cancelAnimationFrame(rafId);
    rafId = requestAnimationFrame(() => {
      const isFlipped = card.classList.contains('flipped');
      const baseRot = isFlipped ? 180 : 0;
      let swipeDir = null;
      if (Math.abs(deltaY) > Math.abs(deltaX) * 1.5 && deltaY < -40) swipeDir = 'up';
      else if (Math.abs(deltaX) > Math.abs(deltaY) * 1.2) {
        if (deltaX < -60) swipeDir = 'left';
        else if (deltaX > 100) swipeDir = 'right';
      }
      
      const tilt = isFlipped ? -deltaX * 0.1 : deltaX * 0.1;
      card.style.transform = `translate(${deltaX}px, ${deltaY}px) rotateY(${baseRot}deg) rotateZ(${tilt}deg)`;
      card.classList.toggle('swipe-left', swipeDir === 'left');
      card.classList.toggle('swipe-right', swipeDir === 'right');
      card.classList.toggle('swipe-up', swipeDir === 'up');
      if (swipeDir && card.dataset.lastDir !== swipeDir) tg.HapticFeedback.impactOccurred('light');
      card.dataset.lastDir = swipeDir || '';
    });
  }
}

function handleEnd(x, y) {
  if (isGrading || (pointerStartX === 0 && pointerStartY === 0)) return;
  if (rafId) cancelAnimationFrame(rafId);
  const card = document.getElementById('word-card');
  if (!card) return;
  card.classList.remove('swiping');
  card.style.cursor = 'grab';

  const deltaTime = Date.now() - pointerStartTime;
  const deltaX = x - pointerStartX;
  const deltaY = y - pointerStartY;
  const velocity = Math.abs(deltaX) / (deltaTime || 1);

  if (!isSwiping) {
    card.classList.toggle('flipped');
    // Vibration for card flip (interactive gesture)
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
  pointerStartX = 0; pointerStartY = 0;
}

function initSwipe() {
  const card = document.getElementById('word-card');
  if (!card) return;
  
  card.onpointerdown = (e) => {
    card.setPointerCapture(e.pointerId);
    handleStart(e.clientX, e.clientY);
  };
  card.onpointermove = (e) => {
    handleMove(e.clientX, e.clientY);
  };
  card.onpointerup = (e) => {
    card.releasePointerCapture(e.pointerId);
    handleEnd(e.clientX, e.clientY);
  };
  card.onpointercancel = (e) => {
    card.releasePointerCapture(e.pointerId);
    pointerStartX = 0; pointerStartY = 0;
  };
}

function renderWord() {
  if (sessionIdx >= sessionWords.length) {
    exitPractice();
    return;
  }

  const undoRow = document.getElementById('practice-undo-row');
  if (undoRow) undoRow.classList.toggle('visible', practiceHistory.length > 0);

  const word = sessionWords[sessionIdx];
  const progEl = document.getElementById('practice-progress');
  if (progEl) progEl.textContent = `${sessionIdx + 1} / ${sessionWords.length}`;
  const barEl = document.getElementById('practice-bar');
  if (barEl) barEl.style.width = `${Math.round((sessionIdx / sessionWords.length) * 100)}%`;

  const typeEl = document.getElementById('practice-type');
  if (typeEl) {
    const isReview = !!word.started_at;
    typeEl.textContent = isReview ? 'Review' : 'New';
    typeEl.className = 'practice-badge ' + (isReview ? 'practice-badge-review' : 'practice-badge-new');
  }

  const card = document.getElementById('word-card');
  card.querySelector('#word-front').textContent = (state.practiceMode === 'translation_to_word') ? word.translation : word.word;
  card.querySelector('#word-translation').textContent = (state.practiceMode === 'translation_to_word') ? word.word : word.translation;
  
  const exEl = card.querySelector('#word-ex');
  exEl.textContent = word.example || '';
  exEl.style.display = word.example ? 'block' : 'none';

  const fLvl = card.querySelector('#word-front-level');
  const bLvl = card.querySelector('#word-back-level');
  fLvl.textContent = word.level || '';
  bLvl.textContent = word.level || '';
  fLvl.style.display = word.level ? 'block' : 'none';
  bLvl.style.display = word.level ? 'block' : 'none';
  
  card.classList.remove('flipped', 'swipe-left', 'swipe-right', 'swipe-up');
  card.style.transition = 'none';
  card.style.transform = 'scale(0.8) rotateY(0deg)';
  card.style.opacity = '0';
  setTimeout(() => {
    card.style.transition = 'transform 0.4s cubic-bezier(0.175, 0.885, 0.32, 1.1), opacity 0.3s ease';
    card.style.transform = 'scale(1) rotateY(0deg)';
    card.style.opacity = '1';
  }, 10);
}

async function grade(quality) {
  if (isGrading) return;
  isGrading = true;
  try {
    const word = sessionWords[sessionIdx];

    practiceHistory.push({
      sessionIdx,
      word: JSON.parse(JSON.stringify(word)),
      stats: { ...sessionStats }
    });

    if (quality === 5) sessionStats.good++;
    else if (quality === 3) sessionStats.hard++;
    else sessionStats.again++;

    const card = document.getElementById('word-card');
    const isFlipped = card.classList.contains('flipped');
    const baseRot = isFlipped ? 180 : 0;
    if (quality === 1) card.style.transform = `translate(-1000px, 0) rotateY(${baseRot}deg) rotateZ(-30deg)`;
    else if (quality === 5) card.style.transform = `translate(1000px, 0) rotateY(${baseRot}deg) rotateZ(30deg)`;
    else if (quality === 3) card.style.transform = `translate(0, -1000px) rotateY(${baseRot}deg) scale(0.5)`;
    card.style.opacity = '0';

    tg.HapticFeedback.notificationOccurred('success');
    sessionIdx++;
    POST('/api/grade', { word_id: word.id, quality }).catch((e) => {
      console.error('Grade failed, word progress may not be saved:', e);
      toast(T.GRADE_FAIL, 'error');
    });
    setTimeout(() => { isGrading = false; renderWord(); }, 300);
  } catch(e) {
    console.error('Grade failed', e);
    isGrading = false;
  }
}

export async function undo() {
  if (isGrading) return;
  if (practiceHistory.length === 0) return;
  const last = practiceHistory.pop();
  
  try {
    await POST('/api/undo', { 
      word_id: last.word.id, 
      old_state: {
        repetitions: last.word.repetitions ?? 0,
        easiness: last.word.easiness ?? 2.5,
        interval: last.word.interval ?? 1,
        next_review: last.word.next_review ?? null,
        last_reviewed_at: last.word.last_reviewed_at ?? null,
        started_at: last.word.started_at ?? null
      }
    });
  } catch (e) { console.error('Undo failed', e); toast(T.UNDO_FAIL, 'error'); }

  sessionIdx = last.sessionIdx;
  sessionStats = last.stats;
  renderWord();
}

export function playAudio(e) {
  if (e) e.stopPropagation();
  const word = sessionWords[sessionIdx];
  if (!word || !window.speechSynthesis) return;

  const card = document.getElementById('word-card');
  const isFlipped = card && card.classList.contains('flipped');
  const text = (isFlipped && word.example) ? word.example : word.word;

  const synth = window.speechSynthesis;
  synth.cancel();
  synth.resume();
  const msg = new SpeechSynthesisUtterance(text);
  msg.lang = state.ttsCode || 'en-US';
  msg.rate = 0.85;
  synth.speak(msg);
}

function toastSession(good, hard, again) {
  const el = document.getElementById('toast');
  if (!el) return;
  el.innerHTML = [
    again > 0 ? `<span style="color:#ff453a">${again}</span>` : null,
    hard  > 0 ? `<span style="color:#ffd60a">${hard}</span>`  : null,
    good  > 0 ? `<span style="color:#30d158">${good}</span>`  : null,
  ].filter(Boolean).join('<span style="opacity:0.3"> · </span>');
  el.className = 'toast show';
  setTimeout(() => {
    el.classList.remove('show');
    setTimeout(() => { el.innerHTML = ''; }, 300);
  }, 3000);
}

export async function triggerHint() {
  const word = sessionWords[sessionIdx];
  if (!word) return;

  tg.HapticFeedback.impactOccurred('medium');

  // open sheet immediately with loader
  const titleEl = document.getElementById('hint-word-title');
  const loaderEl = document.getElementById('hint-loader');
  const contentEl = document.getElementById('hint-content');
  if (titleEl) titleEl.textContent = word.word;
  if (loaderEl) loaderEl.style.display = 'flex';
  if (contentEl) contentEl.style.display = 'none';

  document.getElementById('hint-overlay').classList.add('open');
  document.getElementById('hint-sheet').classList.add('open');
  window._lockScroll();

  // use cache if available
  if (hintCache[word.id]) {
    renderHintContent(hintCache[word.id]);
    return;
  }

  try {
    const data = await GET(`/api/hint?word_id=${word.id}`);
    hintCache[word.id] = data.result;
    renderHintContent(data.result);
  } catch (e) {
    console.error('Hint failed', e);
    if (loaderEl) loaderEl.style.display = 'none';
    if (contentEl) {
      contentEl.style.display = 'block';
      const metaEl = document.getElementById('hint-meta');
      const mnemonicEl = document.getElementById('hint-mnemonic');
      if (metaEl) metaEl.innerHTML = '';
      if (mnemonicEl) mnemonicEl.textContent = 'Failed to load hint.';
    }
  }
}

function renderHintContent(hint) {
  const loaderEl = document.getElementById('hint-loader');
  const contentEl = document.getElementById('hint-content');
  const mnemonicEl = document.getElementById('hint-mnemonic');

  if (mnemonicEl) mnemonicEl.textContent = hint.mnemonic || '';

  if (loaderEl) loaderEl.style.display = 'none';
  if (contentEl) contentEl.style.display = 'block';
}

export function closeHint() {
  document.getElementById('hint-overlay').classList.remove('open');
  document.getElementById('hint-sheet').classList.remove('open');
  window._unlockScroll();
}

export function exitPractice() {
  isGrading = false;
  const total = sessionStats.good + sessionStats.hard + sessionStats.again;
  if (total > 0) toastSession(sessionStats.good, sessionStats.hard, sessionStats.again);
  showScreen('home');
}
