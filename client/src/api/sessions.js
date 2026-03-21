const BASE = '/api/sessions';

async function request(url, options = {}) {
  const res = await fetch(url, { credentials: 'include', ...options });
  if (!res.ok) throw await res.json();
  if (res.status === 204) return null;
  return res.json();
}

export const apiGetSessions = () => request(BASE);
export const apiGetSessionsFull = () => request(`${BASE}/full`);
export const apiGetSession = (id) => request(`${BASE}/${id}`);
export const apiCreateSession = (data) => request(BASE, {
  method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(data),
});
export const apiUpdateSession = (id, data) => request(`${BASE}/${id}`, {
  method: 'PUT', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(data),
});
export const apiDeleteSession = (id) => request(`${BASE}/${id}`, { method: 'DELETE' });
