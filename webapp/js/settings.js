import { GET, POST, setLanguage, state } from './api.js';
import { loadHome } from './ui.js';
import { toast, T } from './toast.js';

const tg = window.Telegram.WebApp;

// ── Languages from state (loaded at init) ────────────────────────────────

function getLanguages() {
  return state.languages || {};
}

// ── Shared constants ──────────────────────────────────────────────────────

const MODE_LABELS = {
  'word_to_translation': 'Word → Translation',
  'translation_to_word': 'Translation → Word',
};

// ── Shared render helpers ─────────────────────────────────────────────────

function _renderIntervalEl(el, val) {
  el.dataset.value = val;
  if (val < 60) el.textContent = `Every ${val} min`;
  else if (val === 60) el.textContent = `Every 1 hour`;
  else el.textContent = `Every ${val / 60} hours`;
}

// ── Universal Picker ──────────────────────────────────────────────────────

export function openPicker(type, context = null) {
  tg.HapticFeedback.impactOccurred('light');
  if (type === 'language')                      _openLanguagePicker();
  else if (type === 'practice_mode')            _openPracticeModePicker();
  else if (type === 'level')                    _openLevelPicker(context);
  else if (type === 'daily_limit')              _openLimitPicker();
  else if (type === 'notification_interval_minutes') _openIntervalPicker();
  else if (type === 'quiet_hours')              _openQuietStartPicker();
}

async function _openLanguagePicker() {
  const resp = await GET('/api/settings/languages');
  const languages = resp.result.languages;
  const options = Object.entries(languages).map(([code, meta]) => ({
    value: code,
    label: meta.word_count > 0 ? `${meta.flag} ${meta.name}  ${meta.word_count}` : `${meta.flag} ${meta.name}`,
  }));
  _showPickerSheet('Active Dictionary', options, state.currentLang, switchLanguage);
}

function _openPracticeModePicker() {
  const options = Object.entries(MODE_LABELS).map(([value, label]) => ({ value, label }));
  _showPickerSheet('Practice Mode', options, state.practiceMode, setPracticeMode);
}

function _openLevelPicker(context) {
  const options = [
    { value: '', label: 'None' },
    ...['A1', 'A2', 'B1', 'B2', 'C1', 'C2'].map(l => ({ value: l, label: l })),
  ];
  const currentVal = document.getElementById(`${context}-level`).value;
  _showPickerSheet('Select Level', options, currentVal, (val) => {
    document.getElementById(`${context}-level`).value = val;
    const displaySpan = document.getElementById(`${context}-level-display`);
    displaySpan.textContent = val || 'Level';
    displaySpan.classList.toggle('picker-trigger-placeholder', !val);
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
    { value: '10',  label: 'Every 10 min' },
    { value: '30',  label: 'Every 30 min' },
    { value: '60',  label: 'Every 1 hour' },
    { value: '120', label: 'Every 2 hours' },
    { value: '240', label: 'Every 4 hours' },
    { value: '480', label: 'Every 8 hours' },
  ].filter(o => parseInt(o.value) >= state.min_notify_interval && parseInt(o.value) <= state.max_notify_interval);

  const currentVal = document.getElementById('set-notify-interval').dataset.value
    || String(Math.floor(state.max_notify_interval / 2));

  _showPickerSheet('Notification frequency', options, currentVal, (val) => {
    _renderIntervalEl(document.getElementById('set-notify-interval'), parseInt(val));
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
    setTimeout(() => _openQuietEndPicker(val), 100);
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
    <div class="picker-item ${opt.value === currentValue ? 'selected' : ''}" data-value="${opt.value}">
      <span>${opt.label}</span>
      ${opt.value === currentValue ? '<span class="picker-item-check">✓</span>' : ''}
    </div>
  `).join('');

  list.querySelectorAll('.picker-item').forEach(item => {
    item.onclick = () => { closePicker(); onSelect(item.dataset.value); };
  });

  document.getElementById('picker-overlay').classList.add('open');
  document.getElementById('picker-sheet').classList.add('open');
  _lockScroll();

  setTimeout(() => {
    const selected = list.querySelector('.picker-item.selected');
    if (selected) selected.scrollIntoView({ block: 'center' });
  }, 300);
}

export function closePicker() {
  document.getElementById('picker-overlay').classList.remove('open');
  document.getElementById('picker-sheet').classList.remove('open');
  _unlockScroll();
}

// ── Scroll lock (exposed via window for use in dictionary.js) ─────────────

function _lockScroll() {
  document.body.dataset.sheetCount = (parseInt(document.body.dataset.sheetCount || '0') + 1).toString();
  document.body.style.overflow = 'hidden';
  document.body.style.touchAction = 'none';
}

function _unlockScroll() {
  const count = Math.max(0, parseInt(document.body.dataset.sheetCount || '0') - 1);
  document.body.dataset.sheetCount = count.toString();
  if (count === 0) {
    document.body.style.overflow = '';
    document.body.style.touchAction = '';
  }
}

window._lockScroll = _lockScroll;
window._unlockScroll = _unlockScroll;

// ── Settings load / save ──────────────────────────────────────────────────

function _fillSettingsFromState() {
  const s = state.currentSettings;
  if (!s) return;

  const modeDisplay = document.getElementById('practice-mode-display');
  if (modeDisplay && s.practice_mode) modeDisplay.textContent = MODE_LABELS[s.practice_mode] || s.practice_mode;

  const limitEl = document.getElementById('set-limit-val');
  if (limitEl && s.daily_limit) limitEl.textContent = s.daily_limit;

  const quietStart = document.getElementById('set-quiet-start');
  const quietEnd = document.getElementById('set-quiet-end');
  const quietDisplay = document.getElementById('quiet-hours-display');
  if (quietStart && s.quiet_start) quietStart.value = s.quiet_start;
  if (quietEnd && s.quiet_end) quietEnd.value = s.quiet_end;
  if (quietDisplay && s.quiet_start && s.quiet_end)
    quietDisplay.textContent = `${s.quiet_start} — ${s.quiet_end}`;

  const notifyEl = document.getElementById('set-notify-interval');
  if (notifyEl && s.notification_interval_minutes)
    _renderIntervalEl(notifyEl, s.notification_interval_minutes);

  const langDisplay = document.getElementById('language-display');
  if (langDisplay && s.language) {
    const meta = getLanguages()[s.language];
    langDisplay.textContent = meta ? `${meta.flag} ${meta.name}` : s.language.toUpperCase();
  }
}

export async function loadSettings() {
  _fillSettingsFromState();
  try {
    const resp = await GET('/api/settings');
    const s = resp.result;

    if (s.limits) {
      state.min_daily_limit = s.limits.min_daily_limit;
      state.max_daily_limit = s.limits.max_daily_limit;
      state.min_notify_interval = s.limits.min_notify_interval;
      state.max_notify_interval = s.limits.max_notify_interval;
    }

    // Automatic timezone sync
    const deviceTz = Intl.DateTimeFormat().resolvedOptions().timeZone;
    if (deviceTz && s.timezone !== deviceTz) {
      console.log(`[settings] timezone changed: ${s.timezone} → ${deviceTz}`);
      await saveSetting('timezone', deviceTz, false);
    }

    const langMeta = getLanguages()[s.language];
    const langDisplay = document.getElementById('language-display');
    if (langDisplay) langDisplay.textContent = langMeta ? `${langMeta.flag} ${langMeta.name}` : s.language.toUpperCase();

    const modeDisplay = document.getElementById('practice-mode-display');
    if (modeDisplay) modeDisplay.textContent = MODE_LABELS[s.practice_mode] || s.practice_mode;

    state.practiceMode = s.practice_mode;
    state.preloadAvailable = s.preload_available === true;

    const importRow = document.getElementById('import-row');
    if (importRow) importRow.style.display = state.preloadAvailable ? '' : 'none';

    const quietStart = document.getElementById('set-quiet-start');
    const quietEnd = document.getElementById('set-quiet-end');
    const quietDisplay = document.getElementById('quiet-hours-display');
    if (quietStart) quietStart.value = s.quiet_start;
    if (quietEnd) quietEnd.value = s.quiet_end;
    if (quietDisplay) quietDisplay.textContent = `${s.quiet_start} — ${s.quiet_end}`;

    const limitEl = document.getElementById('set-limit-val');
    if (limitEl) limitEl.textContent = s.daily_limit;

    const notifyEl = document.getElementById('set-notify-interval');
    if (notifyEl) _renderIntervalEl(notifyEl, s.notification_interval_minutes);

  } catch (e) { console.error(e); }
}

export async function saveSetting(key, val, showToast = true) {
  try {
    await POST('/api/settings', { [key]: val });
    if (showToast) toast(T.SAVED, 'success');
    if (key === 'practice_mode' || key === 'daily_limit' || key === 'timezone') loadHome();
  } catch (e) { if (showToast) toast(T.SAVE_FAIL, 'error'); }
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

export function setPracticeMode(mode) {
  state.practiceMode = mode;
  saveSetting('practice_mode', mode);
  const modeDisplay = document.getElementById('practice-mode-display');
  if (modeDisplay) modeDisplay.textContent = MODE_LABELS[mode] || mode;
}

export async function preloadDefaultWords() {
  tg.HapticFeedback.impactOccurred('medium');
  tg.showConfirm(`Import default ${state.currentLang.toUpperCase()} pack? Duplicates will be skipped.`, async (ok) => {
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
