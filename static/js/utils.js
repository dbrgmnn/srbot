import { state } from "./state.js";

export const tg = window.Telegram.WebApp;

/** ── Scroll Management ── */
export function lockScroll() {
  const count = parseInt(document.body.dataset.sheetCount || "0") + 1;
  document.body.dataset.sheetCount = count.toString();
  document.body.style.overflow = "hidden";
  document.body.style.touchAction = "none";
}

export function unlockScroll() {
  const count = Math.max(
    0,
    parseInt(document.body.dataset.sheetCount || "0") - 1,
  );
  document.body.dataset.sheetCount = count.toString();
  if (count === 0) {
    document.body.style.overflow = "";
    document.body.style.touchAction = "";
  }
}

const ICONS = {
  success: '<svg class="u-svg-md"><use href="#icon-learned"></use></svg>',
  error: '<svg class="u-svg-md"><use href="#icon-close"></use></svg>',
  info: '<svg class="u-svg-md"><use href="#icon-review"></use></svg>',
  stats: '<svg class="u-svg-md"><use href="#icon-settings"></use></svg>',
};

/** ── UI Management ── */
export const UI = {
  _toastTimeout: null,

  /** Unified toast notification with icons and haptics */
  toast(msg, type = "info") {
    const el = document.getElementById("toast");
    if (!el) return;

    if (this._toastTimeout) clearTimeout(this._toastTimeout);

    const iconHtml =
      type === "stats"
        ? ""
        : `<div class="toast-icon">${ICONS[type] || ICONS.info}</div>`;
    el.innerHTML = `${iconHtml}<div class="toast-text">${msg}</div>`;
    el.className = `toast toast-${type} show`;

    // Haptics integration
    if (type === "success" || (type === "stats" && msg.includes("stat-good"))) {
      tg.HapticFeedback.notificationOccurred("success");
    } else if (type === "error" || type === "danger") {
      tg.HapticFeedback.notificationOccurred("error");
    } else {
      tg.HapticFeedback.impactOccurred("light");
    }

    const duration = type === "stats" ? 4500 : 2500;
    this._toastTimeout = setTimeout(() => {
      el.classList.remove("show");
      this._toastTimeout = null;
    }, duration);
  },

  loading(screenId, isLoading) {
    const el = document.getElementById(`screen-${screenId}`);
    if (el) el.classList.toggle("loading", isLoading);
  },

  text(id, val) {
    const el = document.getElementById(id);
    if (el) el.textContent = val;
  },
};

/** ── API Management ── */
export const API = {
  /** Base request wrapper with Telegram auth and clean error handling */
  async request(method, path, body = null) {
    const options = {
      method,
      headers: {
        "Content-Type": "application/json",
        "X-Init-Data": tg.initData,
        "X-Language": state.currentLang || "en",
        "X-Timezone": Intl.DateTimeFormat().resolvedOptions().timeZone,
      },
    };

    if (body) options.body = JSON.stringify(body);

    try {
      const response = await fetch(path, options);

      // Handle authentication errors
      if (response.status === 401 || response.status === 403) {
        throw new Error("Authentication failed. Please re-open the app.");
      }

      const isJson = response.headers
        .get("content-type")
        ?.includes("application/json");
      const data = isJson ? await response.json() : await response.text();

      if (!response.ok) {
        if (data && typeof data === "object" && data.error)
          throw new Error(data.error);
        if (response.status === 409) return { ok: false, conflict: true };
        throw new Error(`HTTP ${response.status}`);
      }

      // Handle custom SRBot error format (ok: false)
      if (data && typeof data === "object" && data.ok === false) {
        throw new Error(data.error || "Operation failed");
      }

      return data;
    } catch (err) {
      console.error(`[API] Error on ${path}:`, err);
      // We don't toast automatically here to allow callers to handle/hide errors
      throw err;
    }
  },

  get(path) {
    return this.request("GET", path);
  },
  post(path, body) {
    return this.request("POST", path, body);
  },
  patch(path, body) {
    return this.request("PATCH", path, body);
  },
  delete(path, body) {
    return this.request("DELETE", path, body);
  },
};
