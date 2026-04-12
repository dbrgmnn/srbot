import { API, UI, tg } from "./utils.js";
import { UIHelpers } from "./ui.js";
import { state, setLanguage } from "./state.js";
import { T } from "./toast.js";

const { openOverlay, closeOverlay } = UIHelpers;

/** --- Languages from State --- */

function getLanguages() {
  return state.languages || {};
}

/** --- Shared Constants --- */

const MODE_LABELS = {
  word_to_translation: "Word → Translation",
  translation_to_word: "Translation → Word",
};

/** --- State Subscriptions --- */

function initSubscriptions() {
  if (window._settingsSubsInit) return;
  window._settingsSubsInit = true;

  state.subscribe("currentSettings", (s) => {
    if (s) _fillSettingsFromState();
  });

  state.subscribe("languages", () => {
    const s = state.currentSettings;
    if (s && s.language) {
      const langDisplay = document.getElementById("language-display");
      if (langDisplay) {
        const meta = getLanguages()[s.language];
        langDisplay.textContent = meta
          ? `${meta.flag} ${meta.name}`
          : s.language.toUpperCase();
      }
    }
  });
}

/** --- Shared Render Helpers --- */

function _renderIntervalEl(el, val) {
  el.dataset.value = val;
  if (val < 60) el.textContent = `Every ${val} min`;
  else if (val === 60) el.textContent = `Every 1 hour`;
  else el.textContent = `Every ${val / 60} hours`;
}

/** --- Universal Picker --- */

export function openPicker(type, context = null) {
  initSubscriptions();
  if (type === "language") _openLanguagePicker();
  else if (type === "practice_mode") _openPracticeModePicker();
  else if (type === "level") _openLevelPicker(context);
  else if (type === "daily_limit") _openLimitPicker();
  else if (type === "notification_interval_minutes") _openIntervalPicker();
  else if (type === "quiet_hours") openQuietHoursSheet();
}

async function _openLanguagePicker() {
  const resp = await API.get("/api/settings/languages");
  const languages = resp.result.languages;
  const options = Object.entries(languages).map(([code, meta]) => ({
    value: code,
    label:
      meta.word_count > 0
        ? `${meta.flag} ${meta.name} ${meta.word_count}`
        : `${meta.flag} ${meta.name}`,
  }));
  _showPickerSheet("", options, state.currentLang, switchLanguage);
}

function _openPracticeModePicker() {
  const options = Object.entries(MODE_LABELS).map(([value, label]) => ({
    value,
    label,
  }));
  _showPickerSheet("", options, state.practiceMode, setPracticeMode);
}

function _openLevelPicker(context) {
  const options = [
    { value: "", label: "None" },
    ...["A1", "A2", "B1", "B2", "C1", "C2"].map((l) => ({
      value: l,
      label: l,
    })),
  ];
  const currentVal = document.getElementById(`${context}-level`).value;
  _showPickerSheet("", options, currentVal, (val) => {
    document.getElementById(`${context}-level`).value = val;
    const displaySpan = document.getElementById(`${context}-level-display`);
    displaySpan.textContent = val || "Level";
    displaySpan.classList.toggle("picker-trigger-placeholder", !val);
  });
}

function _openLimitPicker() {
  const options = [];
  for (let i = state.min_daily_limit; i <= state.max_daily_limit; i += 5) {
    options.push({ value: i.toString(), label: i.toString() });
  }

  const currentVal = String(state.currentSettings?.daily_limit || "");

  _showPickerSheet("", options, currentVal, (val) => {
    if (val === currentVal) return;
    document.getElementById("set-limit-val").textContent = `${val} words`;
    saveSetting("daily_limit", parseInt(val));
  });
}

function _openIntervalPicker() {
  const options = [
    { value: "10", label: "Every 10 min" },
    { value: "30", label: "Every 30 min" },
    { value: "60", label: "Every 1 hour" },
    { value: "120", label: "Every 2 hours" },
    { value: "240", label: "Every 4 hours" },
    { value: "480", label: "Every 8 hours" },
  ].filter(
    (o) =>
      parseInt(o.value) >= state.min_notify_interval &&
      parseInt(o.value) <= state.max_notify_interval,
  );

  const intervalEl = document.getElementById("set-notify-interval");
  const currentVal = String(
    state.currentSettings?.notification_interval_minutes ||
      intervalEl.dataset.value ||
      "",
  );

  _showPickerSheet("", options, currentVal, (val) => {
    if (val === currentVal) return;
    _renderIntervalEl(intervalEl, parseInt(val));
    saveSetting("notification_interval_minutes", parseInt(val));
  });
}

function _showPickerSheet(title, options, currentValue, onSelect) {
  document.getElementById("picker-title").textContent = title;

  const list = document.getElementById("picker-list");
  list.innerHTML = options
    .map(
      (opt) => `
    <div class="picker-item ${
      opt.value === currentValue ? "selected" : ""
    }" data-value="${opt.value}">
      <span>${opt.label}</span>
      ${
        opt.value === currentValue
          ? '<span class="picker-item-check">✓</span>'
          : ""
      }
    </div>
  `,
    )
    .join("");

  list.querySelectorAll(".picker-item").forEach((item) => {
    item.onclick = () => {
      tg.HapticFeedback.selectionChanged();
      closePicker();
      onSelect(item.dataset.value);
    };
  });

  openOverlay("picker-overlay");
  openOverlay("picker-sheet");

  setTimeout(() => {
    const selected = list.querySelector(".picker-item.selected");
    if (selected) selected.scrollIntoView({ block: "center" });
  }, 300);
}

export function closePicker() {
  closeOverlay("picker-overlay");
  closeOverlay("picker-sheet");
}

/** --- Quiet Hours Sheet --- */

export function openQuietHoursSheet() {
  const startList = document.getElementById("quiet-start-list");
  const endList = document.getElementById("quiet-end-list");

  const currentStart = document.getElementById("set-quiet-start").value;
  const currentEnd = document.getElementById("set-quiet-end").value;

  const hours = Array.from({ length: 24 }, (_, i) => {
    const h = String(i).padStart(2, "0");
    return `${h}:00`;
  });

  const renderColumn = (el, currentVal, onSelect) => {
    el.innerHTML = hours
      .map(
        (h) => `
      <div class="picker-item ${
        h === currentVal ? "selected" : ""
      }" data-value="${h}">
        <span>${h}</span>
      </div>
    `,
      )
      .join("");

    el.querySelectorAll(".picker-item").forEach((item) => {
      item.onclick = () => {
        tg.HapticFeedback.selectionChanged();
        el.querySelectorAll(".picker-item").forEach((i) =>
          i.classList.remove("selected"),
        );
        item.classList.add("selected");
        onSelect(item.dataset.value);
      };
    });

    // Auto scroll to selected
    setTimeout(() => {
      const selected = el.querySelector(".picker-item.selected");
      if (selected) selected.scrollIntoView({ block: "center" });
    }, 300);
  };

  renderColumn(startList, currentStart, (val) => {
    document.getElementById("set-quiet-start").value = val;
  });
  renderColumn(endList, currentEnd, (val) => {
    document.getElementById("set-quiet-end").value = val;
  });

  openOverlay("quiet-hours-overlay");
  openOverlay("quiet-hours-sheet");
}

export function closeQuietHoursSheet() {
  closeOverlay("quiet-hours-overlay");
  closeOverlay("quiet-hours-sheet");
}

export async function saveQuietHours() {
  const start = document.getElementById("set-quiet-start").value;
  const end = document.getElementById("set-quiet-end").value;

  await saveSetting("quiet_hours", { quiet_start: start, quiet_end: end });
  closeQuietHoursSheet();
}

/** --- API Access Sheet --- */

export async function openApiAccessSheet() {
  if (!currentToken) {
    try {
      const resp = await API.get("/api/settings/token");
      currentToken = resp.result.token;
    } catch (e) {
      console.error("Failed to load token", e);
    }
  }
  const display = document.getElementById("api-token-display");
  display.textContent = currentToken || "—";

  openOverlay("api-overlay");
  openOverlay("api-sheet");
}

export function closeApiAccessSheet() {
  closeOverlay("api-overlay");
  closeOverlay("api-sheet");
}

/** --- Settings Load / Save --- */

function _fillSettingsFromState() {
  const s = state.currentSettings;
  if (!s) return;

  const modeDisplay = document.getElementById("practice-mode-display");
  if (modeDisplay && s.practice_mode)
    modeDisplay.textContent = MODE_LABELS[s.practice_mode] || s.practice_mode;

  const limitEl = document.getElementById("set-limit-val");
  if (limitEl && s.daily_limit) limitEl.textContent = `${s.daily_limit} words`;

  const quietStart = document.getElementById("set-quiet-start");
  const quietEnd = document.getElementById("set-quiet-end");
  const quietDisplay = document.getElementById("quiet-hours-display");
  if (quietStart && s.quiet_start) quietStart.value = s.quiet_start;
  if (quietEnd && s.quiet_end) quietEnd.value = s.quiet_end;
  if (quietDisplay && s.quiet_start && s.quiet_end)
    quietDisplay.textContent = `${s.quiet_start} — ${s.quiet_end}`;

  const notifyEl = document.getElementById("set-notify-interval");
  if (notifyEl && s.notification_interval_minutes)
    _renderIntervalEl(notifyEl, s.notification_interval_minutes);

  const langDisplay = document.getElementById("language-display");
  if (langDisplay && s.language) {
    const meta = getLanguages()[s.language];
    langDisplay.textContent = meta
      ? `${meta.flag} ${meta.name}`
      : s.language.toUpperCase();
  }
}

/** --- API Token --- */

let currentToken = "";

export async function copyToken() {
  if (!currentToken) return;
  tg.HapticFeedback.selectionChanged();
  try {
    await navigator.clipboard.writeText(currentToken);
    tg.HapticFeedback.notificationOccurred("success");
    UI.toast(T.COPIED, "success");
  } catch (err) {
    console.error("Copy failed:", err);
    UI.toast(T.COPY_FAIL, "error");
  }
}

export function revokeToken() {
  tg.showConfirm(
    "Are you sure you want to revoke the current API token? All apps using it will lose access.",
    async (ok) => {
      if (ok) {
        try {
          const resp = await API.post("/api/settings/token/revoke");
          const newToken = resp.result.token;
          currentToken = newToken;

          const display = document.getElementById("api-token-display");
          if (display) display.textContent = newToken;

          tg.HapticFeedback.notificationOccurred("success");
          UI.toast(T.TOKEN_REVOKED, "success");
        } catch (e) {
          console.error("Revoke error:", e);
          UI.toast(T.REVOKE_FAIL, "error");
        }
      }
    },
  );
}

export async function loadSettings() {
  initSubscriptions();
  _fillSettingsFromState();
  try {
    const tokenResp = await API.get("/api/settings/token");
    currentToken = tokenResp.result.token;

    // Auto-sync timezone from device
    const deviceTz = Intl.DateTimeFormat().resolvedOptions().timeZone;
    if (deviceTz && state.currentSettings?.timezone !== deviceTz) {
      await saveSetting("timezone", deviceTz, false);
    }
  } catch (e) {
    console.error(e);
  }
}

export async function saveSetting(key, val, showToast = true) {
  const body = typeof val === "object" && val !== null ? val : { [key]: val };
  try {
    await API.post("/api/settings", body);
    if (showToast) UI.toast(T.SAVED, "success");

    // Update state locally to trigger subscriptions immediately
    state.currentSettings = { ...state.currentSettings, ...body };
  } catch (e) {
    if (showToast) UI.toast(T.SAVE_FAIL, "error");
  }
}

// --- Settings Actions ---

export async function switchLanguage(lang) {
  if (state.currentLang === lang) return;
  try {
    setLanguage(lang); // triggers currentLang subscription → loadHome()
    await API.post("/api/settings", { language: lang });
    UI.toast(T.LANG_SWITCHED(lang.toUpperCase()), "success");
  } catch (e) {
    UI.toast(T.LANG_FAIL, "error");
  }
}

export function setPracticeMode(mode) {
  if (state.practiceMode === mode) return;
  state.practiceMode = mode; // this will trigger any subscription on practiceMode
  saveSetting("practice_mode", mode);
}
