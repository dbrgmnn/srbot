import { loadHome, showScreen } from './ui.js';
import { toast, T } from './toast.js';
import { startPractice, exitPractice, undo, playAudio } from './practice.js';
import { submitWords, handleFileUpload, onSearchInput, clearSearch, saveEdit, closeEdit, shareWords } from './dictionary.js';
import { loadSettings, openPicker, closePicker, openDeleteAllSheet, closeDeleteAllSheet } from './settings.js';

const tg = window.Telegram.WebApp;
tg.ready();
tg.expand();
tg.isVerticalSwipesEnabled = false;
if (tg.lockOrientation) tg.lockOrientation();

// ── Theme detection ──────────────────────────────────────────────────────────────

function applyTheme() {
  const bg = tg.themeParams?.bg_color || '#111113';
  const r = parseInt(bg.slice(1, 3), 16);
  const g = parseInt(bg.slice(3, 5), 16);
  const b = parseInt(bg.slice(5, 7), 16);
  const luminance = (r * 299 + g * 587 + b * 114) / 1000;
  document.body.classList.toggle('theme-light', luminance > 160);
}

tg.onEvent('themeChanged', applyTheme);
applyTheme();

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
window.shareWords      = shareWords;
// settings
window.openPicker      = openPicker;
window.closePicker     = closePicker;
window.openDeleteAllSheet = openDeleteAllSheet;
window.closeDeleteAllSheet = closeDeleteAllSheet;

// ── Haptics ──────────────────────────────────────────────────────────────────────

function initGlobalHaptics() {
  const selector = 'button, .nav-btn, .picker-item, .settings-row, .word-row-content, .del-btn, .capsule, .picker-trigger';
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
