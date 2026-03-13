import { GET, state } from './api.js';

const tg = window.Telegram.WebApp;

export function toast(msg) {
  const el = document.getElementById('toast');
  if (el) {
    el.textContent = msg;
    el.classList.add('show');
    setTimeout(() => el.classList.remove('show'), 3000);
  }
}

export function showScreen(name) {
  document.querySelectorAll('.screen').forEach(s => s.classList.remove('active'));
  document.querySelectorAll('.nav-btn').forEach(b => b.classList.remove('active'));
  const screen = document.getElementById(`screen-${name}`);
  if (screen) screen.classList.add('active');
  const nav = document.getElementById(`nav-${name}`);
  if (nav) nav.classList.add('active');
  
  if (name === 'home') {
    if (tg.enableVerticalSwipes) tg.enableVerticalSwipes();
    loadHome();
  }
  if (name === 'practice') {
    if (tg.disableVerticalSwipes) tg.disableVerticalSwipes();
  }
}

export async function loadHome(data) {
  try {
    let stats, settings;
    if (data && data.stats) {
      stats = data.stats;
      settings = data.settings;
    } else {
      [stats, settings] = await Promise.all([GET('/api/stats'), GET('/api/settings')]);
    }

    state.practiceMode = settings.practice_mode || 'word_to_translation';
    const due = stats.due || 0;
    const newWords = stats.new || 0;
    const todayDone = stats.today_new || 0;
    const limit = settings.daily_limit || 20;
    const sessionTotal = due + Math.min(newWords, Math.max(0, limit - todayDone));

    if (document.getElementById('stat-due')) document.getElementById('stat-due').textContent = due;
    if (document.getElementById('stat-new')) document.getElementById('stat-new').textContent = Math.max(0, limit - todayDone);

    const user = tg.initDataUnsafe?.user;
    const greetingEl = document.getElementById('user-greeting');
    if (greetingEl) greetingEl.textContent = user?.first_name ? `Hello, ${user.first_name}!` : 'Hello!';

    const btn = document.getElementById('btn-practice');
    if (btn) {
      btn.textContent = sessionTotal === 0 ? 'Nothing to practice' : 'Practice';
      btn.disabled = sessionTotal === 0;
    }

    ['seeds', 'sprouts', 'trees', 'diamonds'].forEach(cat => {
      const val = stats[`g_${cat}`] || 0;
      const bar = document.getElementById(`bar-${cat}`);
      if (bar) bar.style.width = `${Math.round((val / (stats.total || 1)) * 100)}%`;
      const count = document.getElementById(`count-${cat}`);
      if (count) count.textContent = val;
    });
  } catch (e) { console.error("LoadHome failed", e); }
}
