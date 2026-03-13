const tg = window.Telegram.WebApp;
const INIT_DATA = tg.initData;

export let state = {
  currentLang: 'de',
  practiceMode: 'word_to_translation'
};

async function api(method, path, body) {
  const opts = {
    method,
    headers: { 
      'Content-Type': 'application/json', 
      'X-Init-Data': INIT_DATA,
      'X-Language': state.currentLang
    },
  };
  if (body) opts.body = JSON.stringify(body);
  
  try {
    const res = await fetch(path, opts);
    if (res.status === 401 || res.status === 403) throw new Error('Please open the app from Telegram');
    const contentType = res.headers.get("content-type");
    const isJson = contentType && contentType.includes("application/json");
    const data = isJson ? await res.json() : null;
    if (!res.ok) {
      if (res.status === 409) throw new Error('409');
      const msg = (data && data.msg) || (data && data.error) || `Error ${res.status}`;
      throw new Error(msg);
    }
    return data;
  } catch (e) {
    if (e.name === 'TypeError') throw new Error('Network error');
    throw e;
  }
}

export const GET   = (path)       => api('GET',    path);
export const POST  = (path, body) => api('POST',   path, body);
export const DEL   = (path)       => api('DELETE', path);
export const PATCH = (path, body) => api('PATCH',  path, body);
