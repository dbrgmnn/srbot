import { GET, POST, setLanguage, state } from './api.js';
import { toast, loadHome } from './ui.js';

const tg = window.Telegram.WebApp;

export async function switchLanguage(lang) {
  if (state.currentLang === lang) return;
  tg.HapticFeedback.impactOccurred('light');
  try {
    setLanguage(lang);
    await POST('/api/settings', { language: lang });
    const select = document.getElementById('language-select');
    if (select) select.value = lang;
    if (document.getElementById('mode-word')) document.getElementById('mode-word').textContent = lang.toUpperCase();
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

    // Load available languages from API
    const langSelect = document.getElementById('language-select');
    if (langSelect && langSelect.options.length === 0) {
      const { languages } = await GET('/api/settings/languages');
      Object.entries(languages).forEach(([code, meta]) => {
        const opt = document.createElement('option');
        opt.value = code;
        opt.textContent = `${meta.flag} ${meta.name}`;
        langSelect.appendChild(opt);
      });
    }
    if (langSelect) langSelect.value = s.language || 'de';
    
    // Fill timezone select if it's empty
    const tzSelect = document.getElementById('set-timezone');
    if (tzSelect && tzSelect.options.length === 0) {
      const allTz = Intl.supportedValuesOf('timeZone');
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
    if (document.getElementById('mode-word')) document.getElementById('mode-word').textContent = state.currentLang.toUpperCase();
    if (document.getElementById('info-words')) document.getElementById('info-words').textContent = `Dictionary: ${s.total_words || 0} words`;
  } catch(e) { console.error(e); }
}

export async function saveSetting(key, val) {
  try { 
    await POST('/api/settings', { [key]: val }); 
    toast('Settings saved');
    if (key === 'practice_mode' || key === 'daily_limit' || key === 'timezone') loadHome();
  } catch(e) { toast('Save failed'); }
}

export function setPracticeMode(mode) {
  document.querySelectorAll('.practice-opt').forEach(btn => btn.classList.toggle('active', btn.dataset.mode === mode));
  saveSetting('practice_mode', mode);
}

export async function preloadDefaultWords() {
  tg.HapticFeedback.impactOccurred('medium');
  const langName = state.currentLang.toUpperCase();
  
  tg.showConfirm(`Import default ${langName} pack? Duplicates will be skipped.`, async (ok) => {
    if (!ok) return;
    try {
      const res = await POST('/api/words/preload');
      toast(`Added ${res.added} new words`);
      await loadSettings();
      await loadHome();
    } catch (e) {
      toast('Preload failed');
      console.error(e);
    }
  });
}
