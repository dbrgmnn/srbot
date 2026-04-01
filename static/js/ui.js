import { API, UI } from "./utils.js";
import { state } from "./state.js";

const tg = window.Telegram.WebApp;

/** --- Screen Switching --- */

export function showScreen(name) {
  document
    .querySelectorAll(".screen")
    .forEach((s) => s.classList.remove("active"));
  document
    .querySelectorAll(".nav-btn")
    .forEach((b) => b.classList.remove("active"));
  const screen = document.getElementById(`screen-${name}`);
  if (screen) screen.classList.add("active");
  const nav = document.getElementById(`nav-${name}`);
  if (nav) nav.classList.add("active");

  if (name === "home") {
    if (tg.enableVerticalSwipe) tg.enableVerticalSwipe();
  } else {
    if (name !== "practice" && tg.enableVerticalSwipe) tg.enableVerticalSwipe();
  }

  if (name === "practice") {
    if (tg.disableVerticalSwipe) tg.disableVerticalSwipe();
    document.querySelector(".nav").style.display = "none";
    document.body.classList.add("no-nav");
  } else {
    document.querySelector(".nav").style.display = "";
    document.body.classList.remove("no-nav");
  }
}

/** --- Countdown Helpers --- */

let countdownInterval = null;

function formatTimeLeft(targetDate) {
  if (!targetDate) return null;
  const diff = new Date(targetDate) - new Date();
  if (diff <= 0) return null;
  const hours = Math.floor(diff / (1000 * 60 * 60));
  const mins = Math.floor((diff % (1000 * 60 * 60)) / (1000 * 60));
  return hours > 0 ? `In ${hours}h ${mins}m` : `In ${mins}m`;
}

function updateCountdowns() {
  const stats = state.currentStats;
  if (!stats || !state.currentSettings) return;

  const statDue = document.getElementById("stat-due");
  const statNew = document.getElementById("stat-new");

  // Review
  const dueCount = stats.due || 0;
  if (statDue) {
    if (dueCount > 0) {
      statDue.textContent = dueCount;
      statDue.classList.remove("is-timer");
    } else {
      const time = formatTimeLeft(stats.next_due_at);
      statDue.textContent = time || "0";
      statDue.classList.toggle("is-timer", !!time);
    }
  }

  // New
  const limit = state.currentSettings.daily_limit;
  const todayDone = stats.today_new || 0;
  const availableNew = Math.max(0, limit - todayDone);
  if (statNew) {
    if (availableNew > 0 || stats.st_new === 0) {
      statNew.textContent = availableNew;
      statNew.classList.remove("is-timer");
    } else {
      const time = formatTimeLeft(stats.next_day_start_utc);
      statNew.textContent = time || "0";
      statNew.classList.toggle("is-timer", !!time);
    }
  }
}

/** --- State Subscriptions --- */

function initSubscriptions() {
  if (window._subsInit) return;
  window._subsInit = true;

  state.subscribe("currentStats", (stats) => {
    const home = document.getElementById("screen-home");
    if (stats === null) {
      if (home) {
        home.classList.add("loading");
        home.classList.remove("not-loading");
      }
      loadHome();
    } else {
      if (home) {
        home.classList.remove("loading");
        home.classList.add("not-loading");
      }
      updateCountdowns();
      renderStats();
    }
  });

  state.subscribe("sessionTotal", (total) => {
    const btn = document.getElementById("btn-practice");
    if (btn) {
      btn.textContent = total === 0 ? "Nothing to practice" : "Practice";
      btn.disabled = total === 0;
    }
  });

  state.subscribe("currentLang", (newLang, oldLang) => {
    // Only reload home if the language has truly changed
    if (oldLang && newLang !== oldLang) {
      state.currentStats = null;
    }
  });

  state.subscribe("currentSettings", (newS, oldS) => {
    if (oldS && JSON.stringify(newS) !== JSON.stringify(oldS)) {
      state.currentStats = null;
    }
  });
}

function renderStats() {
  const stats = state.currentStats;
  if (!stats) return;

  const st_new = stats.st_new || 0;
  const st_learning = stats.st_learning || 0;
  const st_known = stats.st_known || 0;
  const st_mastered = stats.st_mastered || 0;
  const elNew = document.getElementById("count-new");
  if (elNew) elNew.textContent = st_new;
  const elLearning = document.getElementById("count-learning");
  if (elLearning) elLearning.textContent = st_learning;
  const elKnown = document.getElementById("count-known");
  if (elKnown) elKnown.textContent = st_known;
  const elMastered = document.getElementById("count-mastered");
  if (elMastered) elMastered.textContent = st_mastered;

  const statTodayReviewed = document.getElementById("stat-today-reviewed");
  if (statTodayReviewed)
    statTodayReviewed.textContent = stats.today_reviewed || 0;

  const statTodayAdded = document.getElementById("stat-today-added");
  if (statTodayAdded) statTodayAdded.textContent = stats.today_added || 0;
}

/** --- Home Screen --- */

export async function loadHome() {
  initSubscriptions();
  try {
    const resp = await API.get("/api/init");
    const init = resp.result;

    // This will trigger all subscriptions automatically
    state.languages = init.languages;
    state.ttsCode = init.tts_code;

    if (init.limits) {
      state.min_daily_limit = init.limits.min_daily_limit;
      state.max_daily_limit = init.limits.max_daily_limit;
      state.min_notify_interval = init.limits.min_notify_interval;
      state.max_notify_interval = init.limits.max_notify_interval;
    }

    state.currentSettings = init.settings;
    state.practiceMode = init.settings.practice_mode;

    const stats = init.stats;
    state.sessionTotal = stats.session_total || 0;
    state.currentStats = stats;

    if (!countdownInterval) {
      countdownInterval = setInterval(updateCountdowns, 30000);
    }
  } catch (e) {
    console.error("LoadHome failed", e);
  }
}
