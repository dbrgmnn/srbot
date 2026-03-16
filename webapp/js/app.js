const tg = window.Telegram.WebApp;
tg.ready();
tg.expand();

import { GET, POST, setLanguage } from './api.js';
import { loadHome, showScreen, toast } from './ui.js';
import { startPractice, playAudio, exitPractice } from './practice.js';
import { 
  submitWords, handleFileUpload, onSearchInput, 
  saveEdit, closeEdit, clearAllWords, shareWords 
} from './dictionary.js';
import {
  switchLanguage, changeLimit, changeInterval, loadSettings,
  saveSetting, setPracticeMode, preloadDefaultWords
} from './settings.js';

// Expose functions to window for HTML onclick attributes
window.showScreen = (name) => {
  showScreen(name);
  if (name === 'settings') loadSettings();
};
window.switchLanguage = switchLanguage;
window.changeLimit = changeLimit;
window.changeInterval = changeInterval;
window.startPractice = startPractice;
window.playAudio = playAudio;
window.exitPractice = exitPractice;
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
window.preloadDefaultWords = preloadDefaultWords;
async function init() {
  try {
    const data = await GET('/api/init');
    const lang = data.settings?.language || 'de';
    import { state } from './api.js';
    state.ttsCode = data.tts_code || 'en-US';
    setLanguage(lang); // Sync API module
    await loadHome(data);
  } catch (e) {
    toast('Init failed');
    console.error(e);
  }
}

document.addEventListener('DOMContentLoaded', init);
