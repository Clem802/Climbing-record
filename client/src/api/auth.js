const BASE = '/api/auth';

export async function apiRegister(data) {
  const res = await fetch(`${BASE}/register`, {
    method: 'POST', credentials: 'include',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(data),
  });
  if (!res.ok) throw await res.json();
  return res.json();
}

export async function apiLogin(data) {
  const res = await fetch(`${BASE}/login`, {
    method: 'POST', credentials: 'include',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(data),
  });
  if (!res.ok) throw await res.json();
  return res.json();
}

export async function apiLogout() {
  await fetch(`${BASE}/logout`, { method: 'POST', credentials: 'include' });
}

export async function apiMe() {
  const res = await fetch(`${BASE}/me`, { credentials: 'include' });
  if (!res.ok) throw await res.json();
  return res.json();
}
