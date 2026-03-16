import { GET, POST, setLanguage, state } from './api.js';
import { toast, loadHome } from './ui.js';

const tg = window.Telegram.WebApp;

// ── Cached languages from API ─────────────────────────────────────────────
let cachedLanguages = null;

async function getLanguages() {
  if (!cachedLanguages) {
    const resp = await GET('/api/settings/languages');
    cachedLanguages = resp.result.languages;
  }
  return cachedLanguages;
}

// ── Universal Picker ──────────────────────────────────────────────────────

let pickerCallback = null;

export function openPicker(type, context = null) {
  tg.HapticFeedback.impactOccurred('light');
  if (type === 'language') _openLanguagePicker();
  else if (type === 'practice_mode') _openPracticeModePicker();
  else if (type === 'level') _openLevelPicker(context);
}

async function _openLanguagePicker() {
  const languages = await getLanguages();
  const options = Object.entries(languages).map(([code, meta]) => ({
    value: code,
    label: `${meta.flag} ${meta.name}`,
  }));
  _showPickerSheet('Active Dictionary', options, state.currentLang, (val) => {
    switchLanguage(val);
  });
}

function _openPracticeModePicker() {
  const options = [
    { value: 'word_to_translation', label: 'Word → Translation' },
    { value: 'translation_to_word', label: 'Translation → Word' },
  ];
  _showPickerSheet('Practice Mode', options, state.practiceMode, (val) => {
    setPracticeMode(val);
  });
}

function _openLevelPicker(context) {
  const levels = ['A1', 'A2', 'B1', 'B2', 'C1', 'C2'];
  const options = levels.map(l => ({ value: l, label: l }));
  // Add 'Clear' option
  options.unshift({ value: '', label: 'None' });

  const currentVal = document.getElementById(`${context}-level`).value;
  
  _showPickerSheet('Select Level', options, currentVal, (val) => {
    const hiddenInput = document.getElementById(`${context}-level`);
    const displaySpan = document.getElementById(`${context}-level-display`);
    hiddenInput.value = val;
    displaySpan.textContent = val || 'Level';
    displaySpan.style.color = val ? 'var(--text)' : 'var(--hint)';
  });
}

function _showPickerSheet(title, options, currentValue, onSelect) {
  document.getElementById('picker-title').textContent = title;

  const list = document.getElementById('picker-list');
  list.innerHTML = options.map(opt => `
    <div class="picker-item ${opt.value === currentValue ? 'selected' : ''}"
         data-value="${opt.value}">
      <span>${opt.label}</span>
      ${opt.value === currentValue ? '<span class="picker-item-check">✓</span>' : ''}
    </div>
  `).join('');

  list.querySelectorAll('.picker-item').forEach(item => {
    item.onclick = () => {
      const val = item.dataset.value;
      closePicker();
      onSelect(val);
    };
  });

  pickerCallback = onSelect;
  document.getElementById('picker-overlay').classList.add('open');
  document.getElementById('picker-sheet').classList.add('open');

  // Scroll selected item into view after animation
  setTimeout(() => {
    const selected = list.querySelector('.picker-item.selected');
    if (selected) selected.scrollIntoView({ block: 'center' });
  }, 300);
}

export function closePicker() {
  document.getElementById('picker-overlay').classList.remove('open');
  document.getElementById('picker-sheet').classList.remove('open');
  pickerCallback = null;
}

// ── Settings actions ──────────────────────────────────────────────────────

export async function switchLanguage(lang) {
  if (state.currentLang === lang) return;
  tg.HapticFeedback.impactOccurred('light');
  try {
    setLanguage(lang);
    await POST('/api/settings', { language: lang });
    await Promise.all([loadHome(), loadSettings()]);
    toast(`Switched to ${lang.toUpperCase()}`);
  } catch (e) { toast('Error switching language'); }
}

export async function changeLimit(delta) {
  const el = document.getElementById('set-limit-val');
  let val = parseInt(el.textContent) + delta;
  if (val < state.min_daily_limit) val = state.min_daily_limit; 
  if (val > state.max_daily_limit) val = state.max_daily_limit;
  el.textContent = val;
  tg.HapticFeedback.impactOccurred('light');
  await saveSetting('daily_limit', val);
}

export async function changeInterval(delta) {
  const el = document.getElementById('set-notify-interval');
  let val = parseInt(el.textContent) + delta;
  if (val < state.min_notify_interval) val = state.min_notify_interval; 
  if (val > state.max_notify_interval) val = state.max_notify_interval;
  el.textContent = val;
  tg.HapticFeedback.impactOccurred('light');
  await saveSetting('notification_interval_minutes', val);
}

export async function loadSettings() {
  try {
    const resp = await GET('/api/settings');
    const s = resp.result;

    // Update global state limits from API (source of truth)
    if (s.limits) {
      state.min_daily_limit = s.limits.min_daily_limit;
      state.max_daily_limit = s.limits.max_daily_limit;
      state.min_notify_interval = s.limits.min_notify_interval;
      state.max_notify_interval = s.limits.max_notify_interval;
    }

    // Automatic timezone detection
    const deviceTz = Intl.DateTimeFormat().resolvedOptions().timeZone;
    if (deviceTz && s.timezone !== deviceTz) {
      console.log(`[settings] detected timezone change: ${s.timezone} -> ${deviceTz}`);
      await saveSetting('timezone', deviceTz, false);
    }

    // Update picker display values
    const languages = await getLanguages();
    const langMeta = languages[s.language];
    const langDisplay = document.getElementById('language-display');
    if (langDisplay) langDisplay.textContent = langMeta ? `${langMeta.flag} ${langMeta.name}` : (s.language || 'de').toUpperCase();

    const modeLabels = {
      'word_to_translation': 'Word → Translation',
      'translation_to_word': 'Translation → Word',
    };
    const modeDisplay = document.getElementById('practice-mode-display');
    if (modeDisplay) modeDisplay.textContent = modeLabels[s.practice_mode] || s.practice_mode;

    // Update practiceMode in state so picker highlights current value
    state.practiceMode = s.practice_mode || 'word_to_translation';

    if (document.getElementById('set-quiet-start')) document.getElementById('set-quiet-start').value = s.quiet_start || '23:00';
    if (document.getElementById('set-quiet-end')) document.getElementById('set-quiet-end').value = s.quiet_end || '08:00';
    if (document.getElementById('set-limit-val')) document.getElementById('set-limit-val').textContent = s.daily_limit || 20;
    if (document.getElementById('set-notify-interval')) document.getElementById('set-notify-interval').textContent = s.notification_interval_minutes || 240;

    if (document.getElementById('info-words')) document.getElementById('info-words').textContent = `Dictionary: ${s.total_words || 0} words`;
  } catch(e) { console.error(e); }
}

export async function saveSetting(key, val, showToast = true) {
  try {
    await POST('/api/settings', { [key]: val });
    if (showToast) toast('Settings saved');
    if (key === 'practice_mode' || key === 'daily_limit' || key === 'timezone') loadHome();
  } catch(e) { if (showToast) toast('Save failed'); }
}

export function setPracticeMode(mode) {
  state.practiceMode = mode;
  saveSetting('practice_mode', mode);
  // Update display label immediately
  const modeLabels = {
    'word_to_translation': 'Word → Translation',
    'translation_to_word': 'Translation → Word',
  };
  const modeDisplay = document.getElementById('practice-mode-display');
  if (modeDisplay) modeDisplay.textContent = modeLabels[mode] || mode;
}

export async function preloadDefaultWords() {
  tg.HapticFeedback.impactOccurred('medium');
  const langName = state.currentLang.toUpperCase();

  tg.showConfirm(`Import default ${langName} pack? Duplicates will be skipped.`, async (ok) => {
    if (!ok) return;
    try {
      const res = await POST('/api/words/preload');
      toast(`Added ${res.result.added} new words`);
      await loadSettings();
      await loadHome();
    } catch (e) {
      toast('Preload failed');
      console.error(e);
    }
  });
}
