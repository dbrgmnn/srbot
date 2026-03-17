import { GET, POST, setLanguage, state } from './api.js';
import { loadHome } from './ui.js';
import { toast, T } from './toast.js';

const tg = window.Telegram.WebApp;

// ── Languages from API ───────────────────────────────────────────────────
async function getLanguages() {
  const resp = await GET('/api/settings/languages');
  return resp.result.languages;
}

// ── Universal Picker ──────────────────────────────────────────────────────

export function openPicker(type, context = null) {
  tg.HapticFeedback.impactOccurred('light');
  if (type === 'language') _openLanguagePicker();
  else if (type === 'practice_mode') _openPracticeModePicker();
  else if (type === 'level') _openLevelPicker(context);
  else if (type === 'daily_limit') _openLimitPicker();
  else if (type === 'notification_interval_minutes') _openIntervalPicker();
  else if (type === 'quiet_hours') _openQuietStartPicker();
}

async function _openLanguagePicker() {
  const languages = await getLanguages();
  const options = Object.entries(languages).map(([code, meta]) => ({
    value: code,
    label: meta.word_count > 0
      ? `${meta.flag} ${meta.name}  ${meta.word_count}`
      : `${meta.flag} ${meta.name}`,
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

function _openLimitPicker() {
  const options = [];
  for (let i = state.min_daily_limit; i <= state.max_daily_limit; i += 5) {
    options.push({ value: i.toString(), label: i.toString() });
  }
  
  const currentVal = document.getElementById('set-limit-val').textContent;
  
  _showPickerSheet('New words limit', options, currentVal, (val) => {
    document.getElementById('set-limit-val').textContent = val;
    saveSetting('daily_limit', parseInt(val));
  });
}

function _openIntervalPicker() {
  const options = [
    { value: '10', label: 'Every 10 min' },
    { value: '30', label: 'Every 30 min' },
    { value: '60', label: 'Every 1 hour' },
    { value: '120', label: 'Every 2 hours' },
    { value: '240', label: 'Every 4 hours' },
    { value: '480', label: 'Every 8 hours' }
  ];
  
  // Keep only options within limits
  const filteredOptions = options.filter(o => 
    parseInt(o.value) >= state.min_notify_interval && parseInt(o.value) <= state.max_notify_interval
  );

  const currentVal = document.getElementById('set-notify-interval').dataset.value || String(Math.floor(state.max_notify_interval / 2));
  
  _showPickerSheet('Notification frequency', filteredOptions, currentVal, (val) => {
    const opt = filteredOptions.find(o => o.value === val);
    const el = document.getElementById('set-notify-interval');
    el.textContent = opt ? opt.label : `Every ${val} min`;
    el.dataset.value = val;
    saveSetting('notification_interval_minutes', parseInt(val));
  });
}

function _openQuietStartPicker() {
  const options = Array.from({ length: 24 }, (_, i) => {
    const h = String(23 - i).padStart(2, '0');
    return { value: `${h}:00`, label: `${h}:00` };
  });
  const currentVal = document.getElementById('set-quiet-start').value;
  
  _showPickerSheet('Quiet hours (Start)', options, currentVal, (val) => {
    document.getElementById('set-quiet-start').value = val;
    // Slight delay before opening the second picker
    setTimeout(() => {
      _openQuietEndPicker(val);
    }, 100);
  });
}

function _openQuietEndPicker(startVal) {
  const options = Array.from({ length: 24 }, (_, i) => {
    const h = String(i).padStart(2, '0');
    return { value: `${h}:00`, label: `${h}:00` };
  });
  const currentVal = document.getElementById('set-quiet-end').value;
  
  _showPickerSheet('Quiet hours (End)', options, currentVal, (val) => {
    document.getElementById('set-quiet-end').value = val;
    document.getElementById('quiet-hours-display').textContent = `${startVal} — ${val}`;
    saveSetting('quiet_start', startVal, false);
    saveSetting('quiet_end', val);
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
}

// ── Settings actions ──────────────────────────────────────────────────────

export async function switchLanguage(lang) {
  if (state.currentLang === lang) return;
  tg.HapticFeedback.impactOccurred('light');
  try {
    setLanguage(lang);
    await POST('/api/settings', { language: lang });
    await Promise.all([loadHome(), loadSettings()]);
    toast(T.LANG_SWITCHED(lang.toUpperCase()), 'success');
  } catch (e) { toast(T.LANG_FAIL, 'error'); }
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
    if (langDisplay) langDisplay.textContent = langMeta ? `${langMeta.flag} ${langMeta.name}` : s.language.toUpperCase();

    const modeLabels = {
      'word_to_translation': 'Word → Translation',
      'translation_to_word': 'Translation → Word',
    };
    const modeDisplay = document.getElementById('practice-mode-display');
    if (modeDisplay) modeDisplay.textContent = modeLabels[s.practice_mode] || s.practice_mode;

    // Update practiceMode in state so picker highlights current value
    state.practiceMode = s.practice_mode;
    state.preloadAvailable = s.preload_available === true;
    const importRow = document.getElementById('import-row');
    if (importRow) importRow.style.display = state.preloadAvailable ? '' : 'none';

    if (document.getElementById('set-quiet-start')) document.getElementById('set-quiet-start').value = s.quiet_start;
    if (document.getElementById('set-quiet-end')) document.getElementById('set-quiet-end').value = s.quiet_end;
    if (document.getElementById('quiet-hours-display')) {
      document.getElementById('quiet-hours-display').textContent = `${s.quiet_start} — ${s.quiet_end}`;
    }

    if (document.getElementById('set-limit-val')) document.getElementById('set-limit-val').textContent = s.daily_limit;
    
    if (document.getElementById('set-notify-interval')) {
      const val = s.notification_interval_minutes;
      const el = document.getElementById('set-notify-interval');
      el.dataset.value = val;
      if (val < 60) el.textContent = `Every ${val} min`;
      else if (val === 60) el.textContent = `Every 1 hour`;
      else el.textContent = `Every ${val / 60} hours`;
    }

  } catch(e) { console.error(e); }
}

export async function saveSetting(key, val, showToast = true) {
  try {
    await POST('/api/settings', { [key]: val });
    if (showToast) toast(T.SAVED, 'success');
    if (key === 'practice_mode' || key === 'daily_limit' || key === 'timezone') loadHome();
  } catch(e) { if (showToast) toast(T.SAVE_FAIL, 'error'); }
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
      toast(T.IMPORT_ADDED(res.result.added), 'success');
      await loadSettings();
      await loadHome();
    } catch (e) {
      toast(T.IMPORT_FAIL, 'error');
      console.error(e);
    }
  });
}
