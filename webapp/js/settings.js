import { DEL, GET, POST, setLanguage, state } from "./api.js";
import { T, toast } from "./toast.js";
import { lockScroll, unlockScroll } from "./utils.js";

const tg = window.Telegram.WebApp;

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
  const resp = await GET("/api/settings/languages");
  const languages = resp.result.languages;
  const options = Object.entries(languages).map(([code, meta]) => ({
    value: code,
    label:
      meta.word_count > 0
        ? `${meta.flag} ${meta.name} ${meta.word_count}`
        : `${meta.flag} ${meta.name}`,
  }));
  _showPickerSheet(
    "Active Dictionary",
    options,
    state.currentLang,
    switchLanguage,
  );
}

function _openPracticeModePicker() {
  const options = Object.entries(MODE_LABELS).map(([value, label]) => ({
    value,
    label,
  }));
  _showPickerSheet(
    "Practice Mode",
    options,
    state.practiceMode,
    setPracticeMode,
  );
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
  _showPickerSheet("Select Level", options, currentVal, (val) => {
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

  _showPickerSheet("New words limit", options, currentVal, (val) => {
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

  _showPickerSheet("Notification frequency", options, currentVal, (val) => {
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

  document.getElementById("picker-overlay").classList.add("open");
  document.getElementById("picker-sheet").classList.add("open");
  lockScroll();

  setTimeout(() => {
    const selected = list.querySelector(".picker-item.selected");
    if (selected) selected.scrollIntoView({ block: "center" });
  }, 300);
}

export function closePicker() {
  document.getElementById("picker-overlay").classList.remove("open");
  document.getElementById("picker-sheet").classList.remove("open");
  unlockScroll();
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

  document.getElementById("quiet-hours-overlay").classList.add("open");
  document.getElementById("quiet-hours-sheet").classList.add("open");
  lockScroll();
}

export function closeQuietHoursSheet() {
  document.getElementById("quiet-hours-overlay").classList.remove("open");
  document.getElementById("quiet-hours-sheet").classList.remove("open");
  unlockScroll();
}

export async function saveQuietHours() {
  const start = document.getElementById("set-quiet-start").value;
  const end = document.getElementById("set-quiet-end").value;

  await saveSetting("quiet_hours", { quiet_start: start, quiet_end: end });
  closeQuietHoursSheet();
}

/** --- API Access Sheet --- */

export function openApiAccessSheet() {
  const display = document.getElementById("api-token-display");
  display.textContent = currentToken || "—";

  document.getElementById("api-overlay").classList.add("open");
  document.getElementById("api-sheet").classList.add("open");
  lockScroll();
}

export function closeApiAccessSheet() {
  document.getElementById("api-overlay").classList.remove("open");
  document.getElementById("api-sheet").classList.remove("open");
  unlockScroll();
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

window.copyToken = async () => {
  if (!currentToken) return;
  tg.HapticFeedback.selectionChanged();
  try {
    await navigator.clipboard.writeText(currentToken);
    tg.HapticFeedback.notificationOccurred("success");
    toast(T.COPIED, "success");
  } catch (err) {
    console.error("Copy failed:", err);
    toast(T.COPY_FAIL, "error");
  }
};

window.revokeToken = () => {
  tg.showConfirm(
    "Are you sure you want to revoke the current API token? All apps using it will lose access.",
    async (ok) => {
      if (ok) {
        try {
          const resp = await POST("/api/settings/token/revoke");
          const newToken = resp.result.token;
          currentToken = newToken;

          const display = document.getElementById("api-token-display");
          if (display) display.textContent = newToken;

          tg.HapticFeedback.notificationOccurred("success");
          toast(T.TOKEN_REVOKED, "success");
        } catch (e) {
          console.error("Revoke error:", e);
          toast(T.REVOKE_FAIL, "error");
        }
      }
    },
  );
};

export async function loadSettings() {
  initSubscriptions();
  _fillSettingsFromState();
  try {
    const tokenResp = await GET("/api/settings/token");
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
    const res = await POST("/api/settings", body);
    if (showToast) toast(T.SAVED, "success");

    // Update state locally to trigger subscriptions immediately
    state.currentSettings = { ...state.currentSettings, ...body };
  } catch (e) {
    if (showToast) toast(T.SAVE_FAIL, "error");
  }
}

// --- Settings Actions ---

export async function switchLanguage(lang) {
  if (state.currentLang === lang) return;
  try {
    setLanguage(lang); // triggers currentLang subscription → loadHome()
    await POST("/api/settings", { language: lang });
    toast(T.LANG_SWITCHED(lang.toUpperCase()), "success");
  } catch (e) {
    toast(T.LANG_FAIL, "error");
  }
}

export function setPracticeMode(mode) {
  if (state.practiceMode === mode) return;
  state.practiceMode = mode; // this will trigger any subscription on practiceMode
  saveSetting("practice_mode", mode);
}

/** --- Delete All Words (Safe Confirmation) --- */

let _deleteConfirmStr = "";

export function openDeleteAllSheet() {
  const input = document.getElementById("delete-confirm-input");
  const btn = document.getElementById("btn-delete-all-confirm");
  const info = document.getElementById("delete-all-info");
  const titleEl = document.querySelector("#delete-all-sheet .edit-sheet-title");

  const langCode = state.currentLang;
  const langMeta = (state.languages || {})[langCode];
  const count = state.currentStats ? state.currentStats.total || 0 : 0;
  const flag = langMeta ? langMeta.flag : "";
  const langName = langMeta ? langMeta.name : langCode.toUpperCase();

  _deleteConfirmStr = `delete ${count}`;

  if (titleEl) {
    titleEl.textContent =
      `Clear ${flag} ${langName} ${count} Dictionary`.trim();
  }

  if (info) {
    info.innerHTML = `
      This will permanently delete ALL words in your <b>active dictionary</b>.
      This action cannot be undone.<br /><br />
      To confirm, type <b>${_deleteConfirmStr}</b> below:
    `;
  }

  input.value = "";
  btn.classList.add("is-disabled");

  document.getElementById("delete-all-overlay").classList.add("open");
  document.getElementById("delete-all-sheet").classList.add("open");
  lockScroll();
  setTimeout(() => input.focus(), 300);
}

export function closeDeleteAllSheet() {
  document.getElementById("delete-all-overlay").classList.remove("open");
  document.getElementById("delete-all-sheet").classList.remove("open");
  document.getElementById("delete-confirm-input").value = "";
  document
    .getElementById("btn-delete-all-confirm")
    .classList.add("is-disabled");
  unlockScroll();
}

window.onDeleteAllInput = (val) => {
  const btn = document.getElementById("btn-delete-all-confirm");
  const isMatch = val.trim().toLowerCase() === _deleteConfirmStr.toLowerCase();

  if (isMatch && btn.classList.contains("is-disabled")) {
    tg.HapticFeedback.selectionChanged();
  }
  btn.classList.toggle("is-disabled", !isMatch);
};

window.executeDeleteAll = async () => {
  const input = document.getElementById("delete-confirm-input");
  if (input.value.trim().toLowerCase() !== _deleteConfirmStr.toLowerCase())
    return;

  try {
    await DEL("/api/words/all");

    closeDeleteAllSheet();
    tg.HapticFeedback.notificationOccurred("success");
    toast(T.CLEARED, "success");

    // Refresh settings data from server (updates word counts in state)
    const { loadHome } = await import("./ui.js");
    await loadHome();
  } catch (e) {
    console.error("Delete all error:", e);
    toast(T.CLEAR_FAIL, "error");
  }
};
