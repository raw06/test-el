const FN_BASE = window.SUPABASE_URL + '/functions/v1';
let token = sessionStorage.getItem('admin_token') || '';

export const getToken = () => token;
export function setToken(t) { token = t; sessionStorage.setItem('admin_token', t); }
export function clearToken() { token = ''; sessionStorage.removeItem('admin_token'); }

export const esc = (s) => String(s ?? '').replace(/[&<>"']/g,
  (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));

export function toast(msg, kind = 'ok') {
  const t = document.getElementById('toast');
  t.textContent = msg;
  t.className = 'toast ' + kind;
  clearTimeout(toast._t);
  toast._t = setTimeout(() => t.classList.add('hidden'), 2800);
}

// Gọi Edge Function admin. Trả về body JSON; ném lỗi kèm message tiếng Việt.
export async function api(action, extra = {}) {
  const res = await fetch(FN_BASE + '/admin', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      // anon key chỉ để qua gateway JWT của Supabase; quyền admin thật do x-admin-token quyết định.
      'Authorization': 'Bearer ' + window.SUPABASE_ANON_KEY,
      'apikey': window.SUPABASE_ANON_KEY,
      'x-admin-token': token,
    },
    body: JSON.stringify({ action, ...extra }),
  });
  let body = {};
  try { body = await res.json(); } catch { /* body rỗng hoặc không phải JSON */ }
  if (!res.ok) throw new Error(body.error || `Lỗi ${res.status}`);
  return body;
}
