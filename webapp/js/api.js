import { state } from "./state.js";

const tg = window.Telegram.WebApp;

// --- HTTP Client ---

async function api(method, path, body) {
  const opts = {
    method,
    headers: {
      "Content-Type": "application/json",
      "X-Init-Data": tg.initData, // fetched fresh on every request
      "X-Language": state.currentLang,
      "X-Timezone": Intl.DateTimeFormat().resolvedOptions().timeZone,
    },
  };
  if (body) opts.body = JSON.stringify(body);

  try {
    const res = await fetch(path, opts);
    if (res.status === 401 || res.status === 403)
      throw new Error("Please open the app from Telegram");

    const contentType = res.headers.get("content-type");
    const isJson = contentType && contentType.includes("application/json");
    const data = isJson ? await res.json() : null;

    if (!res.ok) {
      if (isJson && data && data.error) throw new Error(data.error);
      throw new Error(`Error ${res.status}`);
    }

    if (isJson && data && data.ok === false) {
      if (res.status === 409) throw new Error("409");
      throw new Error(data.error || `Error ${res.status}`);
    }

    return data;
  } catch (e) {
    if (e.name === "TypeError") throw new Error("Network error");
    throw e;
  }
}

// --- Exports ---

export const GET = (path) => api("GET", path);
export const POST = (path, body) => api("POST", path, body);
export const DEL = (path) => api("DELETE", path);
export const PATCH = (path, body) => api("PATCH", path, body);
export { state, setLanguage } from "./state.js";
