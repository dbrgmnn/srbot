import { loadHome, showScreen } from './ui.js';
import { toast, T } from './toast.js';
import { startPractice, exitPractice, undo, playAudio } from './practice.js';
import { submitWords, handleFileUpload, onSearchInput, clearSearch, saveEdit, closeEdit, clearAllWords, shareWords } from './dictionary.js';
import { loadSettings, preloadDefaultWords, openPicker, closePicker } from './settings.js';

const tg = window.Telegram.WebApp;
tg.ready();
tg.expand();
tg.isVerticalSwipesEnabled = false;

// ── Window bindings (HTML onclick attributes) ────────────────────────────────────

// ui
window.showScreen = (name) => { showScreen(name); if (name === 'settings') loadSettings(); };
// practice
window.startPractice   = startPractice;
window.exitPractice    = exitPractice;
window.undo            = undo;
window.playAudio       = playAudio;
// dictionary
window.submitWords     = submitWords;
window.handleFileUpload = handleFileUpload;
window.onSearchInput   = onSearchInput;
window.clearSearch     = clearSearch;
window.saveEdit        = saveEdit;
window.closeEdit       = closeEdit;
window.clearAllWords   = clearAllWords;
window.shareWords      = shareWords;
// settings
window.openPicker      = openPicker;
window.closePicker     = closePicker;
window.preloadDefaultWords = preloadDefaultWords;

// ── Haptics ──────────────────────────────────────────────────────────────────────

function initGlobalHaptics() {
  const selector = 'button, .nav-btn, .picker-item, .stat-card, .settings-row, .word-row-content, .del-btn, .file-input-label';
  document.addEventListener('pointerdown', (e) => {
    if (e.target.closest(selector)) tg.HapticFeedback.impactOccurred('light');
  }, { passive: true });
}

// ── Init ────────────────────────────────────────────────────────────────────────

async function init() {
  try {
    initGlobalHaptics();
    await loadHome();
  } catch (e) {
    toast(T.INIT_FAIL, 'error');
    console.error(e);
  }
}

document.addEventListener('DOMContentLoaded', init);
