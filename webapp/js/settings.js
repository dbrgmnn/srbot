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

// ── State Subscriptions ───────────────────────────────────────────────────

function initSubscriptions() {
  if (window._settingsSubsInit) return;
  window._settingsSubsInit = true;

  state.subscribe('currentSettings', (s) => {
    if (s) _fillSettingsFromState();
  });

  state.subscribe('languages', () => {
    const s = state.currentSettings;
    if (s && s.language) {
      const langDisplay = document.getElementById('language-display');
      if (langDisplay) {
        const meta = getLanguages()[s.language];
        langDisplay.textContent = meta ? `${meta.flag} ${meta.name}` : s.language.toUpperCase();
      }
    }
  });
}

// ── Shared render helpers ─────────────────────────────────────────────────

function _renderIntervalEl(el, val) {
  el.dataset.value = val;
  if (val < 60) el.textContent = `Every ${val} min`;
  else if (val === 60) el.textContent = `Every 1 hour`;
  else el.textContent = `Every ${val / 60} hours`;
}

// ── Universal Picker ──────────────────────────────────────────────────────

export function openPicker(type, context = null) {
  initSubscriptions();
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
    label: meta.word_count > 0 ? `${meta.flag} ${meta.name} ${meta.word_count}` : `${meta.flag} ${meta.name}`,
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
    if (val === currentVal) return;
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

  const intervalEl = document.getElementById('set-notify-interval');
  const currentVal = intervalEl.dataset.value || String(Math.floor(state.max_notify_interval / 2));

  _showPickerSheet('Notification frequency', options, currentVal, (val) => {
    if (val === currentVal) return;
    _renderIntervalEl(intervalEl, parseInt(val));
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
  const currentEndVal = document.getElementById('set-quiet-end').value;
  const currentStartVal = document.getElementById('set-quiet-start').value;

  _showPickerSheet('Quiet hours (End)', options, currentEndVal, (val) => {
    if (val === currentEndVal && startVal === currentStartVal) return;
    document.getElementById('set-quiet-end').value = val;
    document.getElementById('quiet-hours-display').textContent = `${startVal} — ${val}`;
    saveSetting('quiet_hours', { quiet_start: startVal, quiet_end: val });
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
    item.onclick = () => { 
      tg.HapticFeedback.selectionChanged();
      closePicker(); 
      onSelect(item.dataset.value); 
    };
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

// ── API Token ────────────────────────────────────────────────────────────

let currentToken = '';

window.copyToken = async () => {
  if (!currentToken) return;
  tg.HapticFeedback.selectionChanged();
  try {
    await navigator.clipboard.writeText(currentToken);
    tg.HapticFeedback.notificationOccurred('success');
    toast('Token copied to clipboard', 'success');
  } catch (err) {
    toast('Failed to copy', 'error');
  }
};

window.revokeToken = () => {
  tg.showConfirm('Are you sure you want to revoke the current API token? All apps using it will lose access.', async (ok) => {
    if (ok) {
      try {
        const resp = await POST('/api/settings/token/revoke');
        currentToken = resp.result.token;
        tg.HapticFeedback.notificationOccurred('success');
        toast('New token generated and copied', 'success');
        await navigator.clipboard.writeText(currentToken);
      } catch (e) {
        toast('Failed to revoke', 'error');
      }
    }
  });
};

export async function loadSettings() {
  initSubscriptions();
  _fillSettingsFromState();
  try {
    const [settingsResp, tokenResp] = await Promise.all([
      GET('/api/settings'),
      GET('/api/settings/token')
    ]);
    
    const s = settingsResp.result;
    currentToken = tokenResp.result.token;
    
    // Automatic sync timezone
    const deviceTz = Intl.DateTimeFormat().resolvedOptions().timeZone;
    if (deviceTz && s.timezone !== deviceTz) {
      await saveSetting('timezone', deviceTz, false);
    }

    state.currentSettings = s; // triggers _fillSettingsFromState through subscription
  } catch (e) { console.error(e); }
}

export async function saveSetting(key, val, showToast = true) {
  const body = (typeof val === 'object' && val !== null) ? val : { [key]: val };
  try {
    const res = await POST('/api/settings', body);
    if (showToast) toast(T.SAVED, 'success');
    
    // Optimization: Update state locally to trigger subscriptions immediately
    const updatedSettings = { ...state.currentSettings, ...body };
    state.currentSettings = updatedSettings;
    
    // If these settings change, we need new stats
    if (key === 'practice_mode' || key === 'daily_limit' || key === 'timezone') {
       // stats will be reloaded via loadHome if needed, 
       // but we can just wait for the next loadHome call from subscription
    }
  } catch (e) { if (showToast) toast(T.SAVE_FAIL, 'error'); }
}

// ── Settings actions ──────────────────────────────────────────────────────

export async function switchLanguage(lang) {
  if (state.currentLang === lang) return;
  try {
    setLanguage(lang);
    await POST('/api/settings', { language: lang });
    // Update settings object to trigger subscriptions
    state.currentSettings = { ...state.currentSettings, language: lang };
    toast(T.LANG_SWITCHED(lang.toUpperCase()), 'success');
  } catch (e) { toast(T.LANG_FAIL, 'error'); }
}

export function setPracticeMode(mode) {
  if (state.practiceMode === mode) return;
  state.practiceMode = mode; // this will trigger any subscription on practiceMode
  saveSetting('practice_mode', mode);
}
