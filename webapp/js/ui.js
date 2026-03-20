import { GET, state, setLanguage } from './api.js';
import { toast } from './toast.js';

const tg = window.Telegram.WebApp;

// ── Screen switching ──────────────────────────────────────────────────────

export function showScreen(name) {
  document.querySelectorAll('.screen').forEach(s => s.classList.remove('active'));
  document.querySelectorAll('.nav-btn').forEach(b => b.classList.remove('active'));
  const screen = document.getElementById(`screen-${name}`);
  if (screen) screen.classList.add('active');
  const nav = document.getElementById(`nav-${name}`);
  if (nav) nav.classList.add('active');

  if (name === 'home') {
    if (tg.enableVerticalSwipe) tg.enableVerticalSwipe();
    loadHome();
  } else {
    if (name !== 'practice' && tg.enableVerticalSwipe) tg.enableVerticalSwipe();
  }

  if (name === 'practice') {
    if (tg.disableVerticalSwipe) tg.disableVerticalSwipe();
    document.querySelector('.nav').style.display = 'none';
    document.body.classList.add('no-nav');
  } else {
    document.querySelector('.nav').style.display = '';
    document.body.classList.remove('no-nav');
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
  if (!stats) return;

  const dueLabel = document.getElementById('label-due');
  const newLabel = document.getElementById('label-new');

  if (stats.due > 0) {
    if (dueLabel) dueLabel.textContent = 'Review';
  } else {
    const time = formatTimeLeft(stats.next_due_at);
    if (dueLabel) dueLabel.textContent = time || 'Review';
  }

  const limit = state.currentSettings?.daily_limit;
  const todayDone = stats.today_new || 0;
  const availableNew = Math.max(0, limit - todayDone);

  if (availableNew > 0 && stats.st_new > 0) {
    if (newLabel) newLabel.textContent = 'New';
  } else {
    const time = formatTimeLeft(stats.next_day_start_utc);
    if (newLabel) {
      if (stats.st_new === 0) newLabel.textContent = 'Empty';
      else newLabel.textContent = time || 'New';
    }
  }
}

// ── Heatmap ─────────────────────────────────────────────────────────────

function renderHeatmap(data) {
  const WEEKS = 13;
  const MONTHS = ['Jan','Feb','Mar','Apr','May','Jun','Jul','Aug','Sep','Oct','Nov','Dec'];

  // build lookup: date string → count
  const lookup = {};
  let maxCount = 1;
  data.forEach(({ date, count }) => {
    lookup[date] = count;
    if (count > maxCount) maxCount = count;
  });

  // generate last 91 days using local date (not UTC)
  const today = new Date();
  const days = [];
  for (let i = WEEKS * 7 - 1; i >= 0; i--) {
    const d = new Date(today);
    d.setDate(d.getDate() - i);
    const y = d.getFullYear();
    const m = String(d.getMonth() + 1).padStart(2, '0');
    const day = String(d.getDate()).padStart(2, '0');
    const key = `${y}-${m}-${day}`;
    days.push({ key, month: d.getMonth() });
  }

  function lvl(c) {
    if (c === 0) return 0;
    if (c < maxCount * 0.20) return 1;
    if (c < maxCount * 0.45) return 2;
    if (c < maxCount * 0.75) return 3;
    return 4;
  }

  // render cells
  const grid = document.getElementById('hm-grid');
  if (!grid) return;
  grid.innerHTML = '';
  days.forEach(({ key }) => {
    const count = lookup[key] || 0;
    const cell = document.createElement('div');
    cell.className = `hm-cell h${lvl(count)}`;
    cell.onclick = () => {
      toast(count.toString());
    };
    grid.appendChild(cell);
  });

  // render month labels
  const monthsEl = document.getElementById('hm-months');
  if (!monthsEl) return;
  monthsEl.innerHTML = '';
  let lastMonth = -1;
  for (let w = 0; w < WEEKS; w++) {
    const m = days[w * 7].month;
    const lbl = document.createElement('div');
    lbl.className = 'hm-month';
    lbl.textContent = (m !== lastMonth) ? MONTHS[m] : '';
    lastMonth = m;
    monthsEl.appendChild(lbl);
  }
}

// ── Home screen ───────────────────────────────────────────────────────────

export async function loadHome() {
  try {
    const resp = await GET('/api/init');
    const init = resp.result;
    const stats = init.stats;
    const settings = init.settings;

    state.currentStats = stats;
    state.currentSettings = settings;
    state.practiceMode = settings.practice_mode;

    if (init.limits) {
      state.min_daily_limit = init.limits.min_daily_limit;
      state.max_daily_limit = init.limits.max_daily_limit;
      state.min_notify_interval = init.limits.min_notify_interval;
      state.max_notify_interval = init.limits.max_notify_interval;
    }
    if (init.languages) state.languages = init.languages;
    if (settings.language) setLanguage(settings.language);
    if (init.tts_code) state.ttsCode = init.tts_code;

    const due = stats.due || 0;
    const newWords = stats.new || 0;
    const todayDone = stats.today_new || 0;
    const limit = settings.daily_limit;
    const availableNew = Math.max(0, limit - todayDone);
    const sessionTotal = due + Math.min(newWords, availableNew);

    const statDue = document.getElementById('stat-due');
    const statNew = document.getElementById('stat-new');
    if (statDue) statDue.textContent = due;
    if (statNew) statNew.textContent = availableNew;

    const flagEl = document.getElementById('header-flag');
    const langEl = document.getElementById('header-lang');
    const countEl = document.getElementById('header-count');
    if (flagEl) flagEl.textContent = init.lang_flag || '';
    if (langEl) langEl.textContent = init.lang_name || (settings.language || '').toUpperCase();
    if (countEl) countEl.textContent = stats.total || 0;

    updateCountdowns();
    if (!countdownInterval) {
      countdownInterval = setInterval(updateCountdowns, 30000);
    }

    const btn = document.getElementById('btn-practice');
    if (btn) {
      btn.textContent = sessionTotal === 0 ? 'Nothing to practice' : 'Practice';
      btn.disabled = sessionTotal === 0;
    }

    const cats = { 'new': 'st_new', 'learning': 'st_learning', 'known': 'st_known', 'mastered': 'st_mastered' };
    Object.entries(cats).forEach(([cat, key]) => {
      const el = document.getElementById(`count-${cat}`);
      if (el) el.textContent = stats[key] || 0;
    });

    renderHeatmap(init.heatmap || []);
  } catch (e) { console.error('LoadHome failed', e); }
}

window._refreshHome = async () => {
  const capsule = document.getElementById('header-flag')?.closest('.header-capsule');
  if (capsule) capsule.style.opacity = '0.5';
  await loadHome();
  if (capsule) capsule.style.opacity = '';
  tg.HapticFeedback.impactOccurred('light');
};
