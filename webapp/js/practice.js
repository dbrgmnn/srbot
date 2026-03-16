import { GET, POST, state } from './api.js';
import { showScreen } from './ui.js';

const tg = window.Telegram.WebApp;

let sessionWords = [];
let sessionIdx = 0;
let sessionStats = { reviewed: 0, new: 0, good: 0, hard: 0, again: 0 };
let isGrading = false;
let isSwiping = false;
let touchStartX = 0, touchStartY = 0, touchStartTime = 0;
let rafId = null;

export async function startPractice() {
  try {
    const data = await GET('/api/session');
    if (!data.words || data.words.length === 0) return;
    sessionWords = data.words;
    sessionIdx = 0;
    sessionStats = { reviewed: 0, new: 0, good: 0, hard: 0, again: 0 };
    showScreen('practice');
    renderWord();
  } catch(e) { console.error(e); }
}

let isMouseDown = false;

function handleStart(x, y) {
  if (isGrading) return;
  touchStartX = x;
  touchStartY = y;
  touchStartTime = Date.now();
  isSwiping = false;
  const card = document.getElementById('word-card');
  if (card) {
    card.classList.add('swiping');
    card.style.cursor = 'grabbing';
  }
}

function handleMove(x, y) {
  if (isGrading) return;
  const deltaX = x - touchStartX;
  const deltaY = y - touchStartY;
  if (Math.abs(deltaX) > 5 || Math.abs(deltaY) > 5) isSwiping = true;

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
      
      // If flipped, deltaX rotation should be inverted to look natural
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
  if (isGrading) return;
  if (rafId) cancelAnimationFrame(rafId);
  const card = document.getElementById('word-card');
  if (!card) return;
  card.classList.remove('swiping');
  card.style.cursor = 'grab';
  const deltaTime = Date.now() - touchStartTime;
  const deltaX = x - touchStartX;
  const deltaY = y - touchStartY;
  const velocity = Math.abs(deltaX) / (deltaTime || 1);

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
}

export function initSwipe() {
  const card = document.getElementById('word-card');
  if (!card) return;
  card.style.cursor = 'grab';

  card.ontouchstart = (e) => {
    handleStart(e.touches[0].clientX, e.touches[0].clientY);
  };
  card.ontouchmove = (e) => {
    handleMove(e.touches[0].clientX, e.touches[0].clientY);
  };
  card.ontouchend = (e) => {
    handleEnd(e.changedTouches[0].clientX, e.changedTouches[0].clientY);
  };

  card.onmousedown = (e) => {
    isMouseDown = true;
    handleStart(e.clientX, e.clientY);
  };
}

// Global mouse listeners to handle swipes outside the card
window.onmousemove = (e) => {
  if (!isMouseDown) return;
  handleMove(e.clientX, e.clientY);
};
window.onmouseup = (e) => {
  if (!isMouseDown) return;
  isMouseDown = false;
  handleEnd(e.clientX, e.clientY);
};

function renderWord() {
  if (sessionIdx >= sessionWords.length) { showSummary(); return; }
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
  initSwipe();
}

async function grade(quality) {
  if (isGrading) return;
  isGrading = true;
  const word = sessionWords[sessionIdx];
  if ((word.repetitions || 0) > 0) sessionStats.reviewed++; else sessionStats.new++;
  if (quality === 5) sessionStats.good++; else if (quality === 3) sessionStats.hard++; else sessionStats.again++;

  const card = document.getElementById('word-card');
  const isFlipped = card.classList.contains('flipped');
  const baseRot = isFlipped ? 180 : 0;
  if (quality === 1) card.style.transform = `translate(-1000px, 0) rotateY(${baseRot}deg) rotateZ(-30deg)`;
  else if (quality === 5) card.style.transform = `translate(1000px, 0) rotateY(${baseRot}deg) rotateZ(30deg)`;
  else if (quality === 3) card.style.transform = `translate(0, -1000px) rotateY(${baseRot}deg) scale(0.5)`;
  card.style.opacity = '0';

  tg.HapticFeedback.notificationOccurred('success');
  POST('/api/grade', { word_id: word.id, quality }).catch(() => {});
  sessionIdx++;
  setTimeout(() => { isGrading = false; renderWord(); }, 300);
}

export function playAudio(e) {
  if (e) e.stopPropagation();
  const word = sessionWords[sessionIdx];
  if (!word || !window.speechSynthesis) return;
  window.speechSynthesis.cancel();
  const msg = new SpeechSynthesisUtterance(word.word);
  msg.lang = state.ttsCode || 'en-US';
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

export function exitPractice() { showScreen('home'); }
