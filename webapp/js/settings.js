import { GET, POST, state } from './api.js';
import { toast, loadHome } from './ui.js';

const tg = window.Telegram.WebApp;

export async function switchLanguage(lang) {
  if (state.currentLang === lang) return;
  tg.HapticFeedback.impactOccurred('light');
  try {
    state.currentLang = lang;
    await POST('/api/settings', { language: lang });
    document.querySelectorAll('.lang-opt').forEach(btn => btn.classList.toggle('active', btn.dataset.lang === state.currentLang));
    if (document.getElementById('mode-word')) document.getElementById('mode-word').textContent = state.currentLang.toUpperCase();
    await Promise.all([loadHome(), loadSettings()]);
    toast(`Switched to ${lang.toUpperCase()}`);
  } catch (e) { toast('Error switching language'); }
}

export async function changeLimit(delta) {
  const el = document.getElementById('set-limit-val');
  let val = parseInt(el.textContent) + delta;
  if (val < 5) val = 5; if (val > 50) val = 50;
  el.textContent = val;
  tg.HapticFeedback.impactOccurred('light');
  await saveSetting('daily_limit', val);
}

export async function changeInterval(delta) {
  const el = document.getElementById('set-notify-interval');
  let val = parseInt(el.textContent) + delta;
  if (val < 10) val = 10; if (val > 480) val = 480;
  el.textContent = val;
  tg.HapticFeedback.impactOccurred('light');
  await saveSetting('notification_interval_minutes', val);
}

export async function loadSettings() {
  try {
    const s = await GET('/api/settings');
    
    // Fill timezone select if it's empty
    const tzSelect = document.getElementById('set-timezone');
    if (tzSelect && tzSelect.options.length <= 3) {
      const allTz = Intl.supportedValuesOf('timeZone');
      tzSelect.innerHTML = '';
      allTz.forEach(tz => {
        const opt = document.createElement('option');
        opt.value = tz;
        opt.textContent = tz;
        tzSelect.appendChild(opt);
      });
    }
    if (tzSelect) tzSelect.value = s.timezone || 'Europe/Berlin';

    if (document.getElementById('set-quiet-start')) document.getElementById('set-quiet-start').value = s.quiet_start || '23:00';
    if (document.getElementById('set-quiet-end')) document.getElementById('set-quiet-end').value = s.quiet_end || '08:00';
    if (document.getElementById('set-limit-val')) document.getElementById('set-limit-val').textContent = s.daily_limit || 20;
    if (document.getElementById('set-notify-interval')) document.getElementById('set-notify-interval').textContent = s.notification_interval_minutes || 240;
    document.querySelectorAll('.practice-opt').forEach(b => b.classList.toggle('active', b.dataset.mode === s.practice_mode));
    document.querySelectorAll('.lang-opt').forEach(b => b.classList.toggle('active', b.dataset.lang === state.currentLang));
    if (document.getElementById('mode-word')) document.getElementById('mode-word').textContent = state.currentLang.toUpperCase();
    if (document.getElementById('info-tz')) document.getElementById('info-tz').textContent = `Timezone: ${s.timezone || 'UTC'}`;
    if (document.getElementById('info-words')) document.getElementById('info-words').textContent = `Dictionary: ${s.total_words || 0} words`;
  } catch(e) { console.error(e); }
}

export async function saveSetting(key, val) {
  try { 
    await POST('/api/settings', { [key]: val }); 
    if (key === 'practice_mode' || key === 'daily_limit') loadHome();
  } catch(e) { toast('Save failed'); }
}

export function setPracticeMode(mode) {
  document.querySelectorAll('.practice-opt').forEach(btn => btn.classList.toggle('active', btn.dataset.mode === mode));
  saveSetting('practice_mode', mode);
}

export async function preloadDefaultWords() {
  tg.HapticFeedback.impactOccurred('medium');
  if (!confirm(`Import default ${state.currentLang.toUpperCase()} pack? Duplicates will be skipped.`)) return;
  
  try {
    const res = await POST('/api/words/preload');
    toast(`Added ${res.added} new words`);
    await loadSettings();
    await loadHome();
  } catch (e) {
    toast('Preload failed');
    console.error(e);
  }
}
