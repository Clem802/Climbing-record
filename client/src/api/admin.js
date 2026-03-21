const BASE = '/api/admin';

async function request(url, options = {}) {
  const res = await fetch(url, { credentials: 'include', ...options });
  if (!res.ok) throw await res.json();
  if (res.status === 204) return null;
  return res.json();
}

export const apiAdminGetUsers = () => request(`${BASE}/users`);
export const apiAdminGetStats = () => request(`${BASE}/stats`);
export const apiAdminToggleSub = (id, status) => request(`${BASE}/users/${id}/subscription`, {
  method: 'PATCH', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ status }),
});
export const apiAdminGetUserSessions = (id) => request(`${BASE}/users/${id}/sessions`);
export const apiAdminDeleteUser = (id) => request(`${BASE}/users/${id}`, { method: 'DELETE' });
