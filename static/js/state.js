const initialData = {
  currentLang:
    localStorage.getItem("currentLang") ||
    (navigator.language || "en").split("-")[0],
  practiceMode: "word_to_translation",
  ttsCode: "en-US",
  languages: {},
  min_daily_limit: 5,
  max_daily_limit: 50,
  min_notify_interval: 10,
  max_notify_interval: 480,
  currentStats: null,
  currentSettings: null,
  sessionTotal: 0,
};

/**
 * Observable State with Proxy-based reactivity.
 */
class ObservableState {
  constructor(data) {
    this._data = data;
    this._subscribers = new Map();

    return new Proxy(this, {
      get(target, prop) {
        if (prop in target) return target[prop];
        return target._data[prop];
      },
      set(target, prop, value) {
        if (prop in target) {
          target[prop] = value;
          return true;
        }

        const oldValue = target._data[prop];
        if (oldValue === value) return true;

        target._data[prop] = value;

        // Auto-persist key settings to localStorage
        if (prop === "currentLang") {
          localStorage.setItem("currentLang", value);
        }

        // Notify subscribers for this specific key
        if (target._subscribers.has(prop)) {
          target._subscribers.get(prop).forEach((cb) => cb(value, oldValue));
        }

        // Notify global subscribers (if needed)
        if (target._subscribers.has("*")) {
          target._subscribers
            .get("*")
            .forEach((cb) => cb(prop, value, oldValue));
        }

        return true;
      },
    });
  }

  subscribe(key, callback) {
    if (!this._subscribers.has(key)) {
      this._subscribers.set(key, []);
    }
    this._subscribers.get(key).push(callback);

    // Immediately call with current value if it exists
    if (key !== "*" && this._data[key] !== undefined) {
      callback(this._data[key], null);
    }

    return () => {
      const subs = this._subscribers.get(key);
      const idx = subs.indexOf(callback);
      if (idx > -1) subs.splice(idx, 1);
    };
  }
}

export const state = new ObservableState(initialData);

export function setLanguage(lang) {
  state.currentLang = lang;
}
