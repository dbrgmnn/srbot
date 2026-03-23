import { GET, state, setLanguage } from "./api.js";
import { toast } from "./toast.js";

const tg = window.Telegram.WebApp;

// ── Screen switching ──────────────────────────────────────────────────────

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
    // loadHome is now handled by subscriptions and initial init
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

// ── Countdown helpers ─────────────────────────────────────────────────────

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

// ── Week activity ────────────────────────────────────────────────────────

function renderWeek(data) {
  const DAYS = ["Su", "Mo", "Tu", "We", "Th", "Fr", "Sa"];

  // build lookup: date string → count
  const lookup = {};
  data.forEach(({ date, count }) => {
    lookup[date] = count;
  });

  const grid = document.getElementById("week-grid");
  if (!grid) return;
  grid.innerHTML = "";

  const today = new Date();
  // todayKey для определения сегодняшней ячейки
  const todayKey = `${today.getFullYear()}-${String(
    today.getMonth() + 1,
  ).padStart(2, "0")}-${String(today.getDate()).padStart(2, "0")}`;

  // последние 7 дней: i=0 → 6 дней назад, i=6 → сегодня
  for (let i = 0; i < 7; i++) {
    const d = new Date(today);
    d.setDate(d.getDate() - 6 + i);
    const key = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(
      2,
      "0",
    )}-${String(d.getDate()).padStart(2, "0")}`;
    const count = lookup[key] || 0;
    const isToday = key === todayKey;

    const col = document.createElement("div");
    col.className = "week-day-column";

    const dayEl = document.createElement("div");
    dayEl.className = "week-cell-day";
    dayEl.textContent = DAYS[d.getDay()];

    const cell = document.createElement("div");
    const classes = ["week-cell"];
    if (count > 0) {
      if (count <= 5) classes.push("wc-lvl-1");
      else if (count <= 15) classes.push("wc-lvl-2");
      else classes.push("wc-lvl-3");
    }
    if (isToday) classes.push("wc-today");
    cell.className = classes.join(" ");

    const num = document.createElement("div");
    num.className = "week-cell-num";
    num.textContent = count > 0 ? count : "0";

    cell.appendChild(num);
    col.appendChild(dayEl);
    col.appendChild(cell);

    grid.appendChild(col);
  }
}

// ── State Subscriptions ───────────────────────────────────────────────────

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
    // If settings changed (not the initial load), refresh stats
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
  const total = st_new + st_learning + st_known + st_mastered;

  const elNew = document.getElementById("count-new");
  if (elNew) elNew.textContent = st_new;
  const elLearning = document.getElementById("count-learning");
  if (elLearning) elLearning.textContent = st_learning;
  const elKnown = document.getElementById("count-known");
  if (elKnown) elKnown.textContent = st_known;
  const elMastered = document.getElementById("count-mastered");
  if (elMastered) elMastered.textContent = st_mastered;
  const elTotal = document.getElementById("count-total");
  if (elTotal) elTotal.textContent = total;

  // bar widths
  const pct = (n) => (total > 0 ? `${((n / total) * 100).toFixed(1)}%` : "0%");
  const barNew = document.getElementById("bar-new");
  if (barNew) {
    barNew.style.width = pct(st_new);
    barNew.style.background = "#8e8e93";
  }
  const barLearning = document.getElementById("bar-learning");
  if (barLearning) {
    barLearning.style.width = pct(st_learning);
    barLearning.style.background = "#ff9f0a";
  }
  const barKnown = document.getElementById("bar-known");
  if (barKnown) {
    barKnown.style.width = pct(st_known);
    barKnown.style.background = "#30d158";
  }
  const barMastered = document.getElementById("bar-mastered");
  if (barMastered) {
    barMastered.style.width = pct(st_mastered);
    barMastered.style.background = "#bf5af2";
  }
}

// ── Home screen ───────────────────────────────────────────────────────────

export async function loadHome() {
  initSubscriptions();
  try {
    const resp = await GET("/api/init");
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
    const due = stats.due || 0;
    const newWords = stats.new || 0;
    const todayDone = stats.today_new || 0;
    const limit = init.settings.daily_limit;
    const availableNew = Math.max(0, limit - todayDone);

    state.sessionTotal = due + Math.min(newWords, availableNew);
    state.currentStats = stats; // triggers renderStats and updateCountdowns

    if (!countdownInterval) {
      countdownInterval = setInterval(updateCountdowns, 30000);
    }

    renderWeek(init.heatmap || []);
  } catch (e) {
    console.error("LoadHome failed", e);
  }
}
