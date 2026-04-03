import {
  addWordWithAI,
  clearSearch,
  closeEdit,
  handleFileUpload,
  onSearchInput,
  openEdit,
  saveEdit,
  shareWords,
  showTodayAdded,
  showTodayLearned,
  deleteWord,
  deleteCurrentWord,
  showQueue,
  showLearning,
  showKnown,
  showMastered,
} from "./dictionary.js";
import { exitPractice, playAudio, startPractice, undo } from "./practice.js";
import {
  closeApiAccessSheet,
  closeDeleteAllSheet,
  closePicker,
  closeQuietHoursSheet,
  loadSettings,
  openApiAccessSheet,
  openDeleteAllSheet,
  openPicker,
  openQuietHoursSheet,
  saveQuietHours,
} from "./settings.js";
import { T } from "./toast.js";
import { UI } from "./utils.js";
import { loadHome, showScreen } from "./ui.js";

const tg = window.Telegram.WebApp;
tg.ready();
tg.expand();
tg.isVerticalSwipesEnabled = false;
if (tg.lockOrientation) tg.lockOrientation();

// --- Theme Detection ---

function applyTheme() {
  const bg = tg.themeParams?.bg_color || "#111113";
  const r = parseInt(bg.slice(1, 3), 16);
  const g = parseInt(bg.slice(3, 5), 16);
  const b = parseInt(bg.slice(5, 7), 16);
  const luminance = (r * 299 + g * 587 + b * 114) / 1000;
  document.body.classList.toggle("theme-light", luminance > 160);
}

tg.onEvent("themeChanged", applyTheme);
applyTheme();

// --- Window Bindings (HTML onclick attributes) ---

// UI
window.showScreen = (name) => {
  showScreen(name);
  if (name === "settings") loadSettings();
};

// Practice
window.startPractice = startPractice;
window.exitPractice = exitPractice;
window.undo = undo;
window.playAudio = playAudio;

// Dictionary
window.handleFileUpload = handleFileUpload;
window.onSearchInput = onSearchInput;
window.clearSearch = clearSearch;
window.saveEdit = saveEdit;
window.closeEdit = closeEdit;
window.addWordWithAI = addWordWithAI;
window.shareWords = shareWords;
window.openEdit = openEdit;
window.showTodayAdded = showTodayAdded;
window.showTodayLearned = showTodayLearned;
window.showQueue = showQueue;
window.showLearning = showLearning;
window.showKnown = showKnown;
window.showMastered = showMastered;
window.deleteWord = deleteWord;
window.deleteCurrentWord = deleteCurrentWord;

// Settings
window.openPicker = openPicker;
window.closePicker = closePicker;
window.openDeleteAllSheet = openDeleteAllSheet;
window.closeDeleteAllSheet = closeDeleteAllSheet;
window.openApiAccessSheet = openApiAccessSheet;
window.closeApiAccessSheet = closeApiAccessSheet;
window.openQuietHoursSheet = openQuietHoursSheet;
window.closeQuietHoursSheet = closeQuietHoursSheet;
window.saveQuietHours = saveQuietHours;

// --- Haptics ---

function initGlobalHaptics() {
  const selector =
    "button, .nav-btn, .picker-item, .settings-row, .word-row, .capsule, .picker-trigger, .stat-pill[onclick], .progress-legend-item";
  document.addEventListener(
    "click",
    (e) => {
      if (e.target.closest(selector)) tg.HapticFeedback.impactOccurred("light");
    },
    { passive: true },
  );
}

// --- Initialization ---

async function init() {
  try {
    initGlobalHaptics();
    await loadHome();
  } catch (e) {
    UI.toast(T.INIT_FAIL, "error");
    console.error(e);
  }
}

document.addEventListener("DOMContentLoaded", init);
