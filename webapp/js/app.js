import { state } from './api.js';
import { loadHome, showScreen, toast } from './ui.js';
import { startPractice, playAudio, exitPractice, undo } from './practice.js';
import { 
  submitWords, handleFileUpload, onSearchInput, 
  saveEdit, closeEdit, clearAllWords, shareWords 
} from './dictionary.js';
import {
  switchLanguage, loadSettings,
  saveSetting, setPracticeMode, preloadDefaultWords,
  openPicker, closePicker
} from './settings.js';

const tg = window.Telegram.WebApp;
tg.ready();
tg.expand();
tg.isVerticalSwipesEnabled = false;

// Expose functions to window for HTML onclick attributes
window.showScreen = (name) => {
  showScreen(name);
  if (name === 'settings') loadSettings();
};
window.switchLanguage = switchLanguage;
window.startPractice = startPractice;
window.playAudio = playAudio;
window.exitPractice = exitPractice;
window.undo = undo;
window.submitWords = submitWords;
window.handleFileUpload = handleFileUpload;
window.onSearchInput = onSearchInput;
window.saveEdit = saveEdit;
window.closeEdit = closeEdit;
window.saveSetting = saveSetting;
window.setPracticeMode = setPracticeMode;
window.clearAllWords = clearAllWords;
window.shareWords = shareWords;
window.loadSettings = loadSettings;
window.openPicker = openPicker;
window.closePicker = closePicker;
window.preloadDefaultWords = preloadDefaultWords;

function initGlobalHaptics() {
  // Common interactive elements selector
  const selector = 'button, .nav-btn, .picker-item, .stat-card, .btn-action, .settings-row, .word-row-content, .del-btn, .file-input-label, .stepper button';
  
  document.addEventListener('click', (e) => {
    const target = e.target.closest(selector);
    if (target) {
      // Light impact for regular button clicks
      tg.HapticFeedback.impactOccurred('light');
    }
  }, { passive: true });
}

async function init() {
  try {
    initGlobalHaptics();
    await loadHome();
  } catch (e) {
    toast('Init failed');
    console.error(e);
  }
}

document.addEventListener('DOMContentLoaded', init);
