import { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import {
  apiAdminGetUsers, apiAdminGetStats,
  apiAdminToggleSub, apiAdminGetUserSessions, apiAdminDeleteUser
} from '../api/admin.js';
import { useToast } from '../hooks/useToast.jsx';

const STATUS_CYCLE = { active: 'inactive', inactive: 'trial', trial: 'active' };
const STATUS_COLORS = {
  active: 'bg-green-100 text-green-700 border border-green-200',
  trial: 'bg-blue-100 text-blue-700 border border-blue-200',
  inactive: 'bg-red-100 text-red-700 border border-red-200',
};

export default function Admin() {
  const [users, setUsers] = useState([]);
  const [stats, setStats] = useState(null);
  const [selectedUser, setSelectedUser] = useState(null);
  const [userSessions, setUserSessions] = useState([]);
  const [loading, setLoading] = useState(true);
  const { addToast } = useToast();
  const navigate = useNavigate();

  useEffect(() => {
    Promise.all([apiAdminGetUsers(), apiAdminGetStats()])
      .then(([u, s]) => { setUsers(u); setStats(s); })
      .catch(() => addToast('Failed to load admin data', 'error'))
      .finally(() => setLoading(false));
  }, [addToast]);

  async function toggleSub(user) {
    const next = STATUS_CYCLE[user.subscription_status];
    try {
      const updated = await apiAdminToggleSub(user.id, next);
      setUsers(u => u.map(x => x.id === user.id ? { ...x, subscription_status: updated.subscription_status } : x));
      addToast(`${user.name} set to ${next}`);
    } catch { addToast('Failed to update subscription', 'error'); }
  }

  async function deleteUser(user) {
    if (!window.confirm(`Delete ${user.name}? This cannot be undone.`)) return;
    try {
      await apiAdminDeleteUser(user.id);
      setUsers(u => u.filter(x => x.id !== user.id));
      if (selectedUser?.id === user.id) setSelectedUser(null);
      addToast(`${user.name} deleted`);
    } catch { addToast('Failed to delete user', 'error'); }
  }

  async function viewSessions(user) {
    setSelectedUser(user);
    setUserSessions([]);
    try {
      const s = await apiAdminGetUserSessions(user.id);
      setUserSessions(s);
    } catch { addToast('Failed to load sessions', 'error'); }
  }

  if (loading) return <div className="flex items-center justify-center min-h-screen text-gray-400">Loading...</div>;

  return (
    <div className="min-h-screen bg-gray-50 max-w-5xl mx-auto px-4 py-6">
      <div className="flex items-center gap-3 mb-6">
        <button onClick={() => navigate('/dashboard')} aria-label="Back to dashboard" className="text-gray-400 hover:text-brand transition text-xl">←</button>
        <h1 className="text-2xl font-bold">Admin Panel</h1>
      </div>

      {stats && (
        <div className="grid grid-cols-3 gap-4 mb-8">
          {[
            ['Total Users', stats.totalUsers],
            ['Active Subscribers', stats.activeSubscribers],
            ['Total Sessions', stats.totalSessions],
          ].map(([label, value]) => (
            <div key={label} className="bg-white rounded-2xl shadow-natural p-5 text-center">
              <div className="text-3xl font-bold text-brand">{value}</div>
              <div className="text-sm text-gray-500 mt-1">{label}</div>
            </div>
          ))}
        </div>
      )}

      <div className={`grid gap-6 ${selectedUser ? 'grid-cols-2' : 'grid-cols-1'}`}>
        <div>
          <h2 className="text-lg font-bold mb-3">Users</h2>
          <div className="bg-white rounded-2xl shadow-natural overflow-hidden">
            <table className="w-full text-sm">
              <thead>
                <tr className="text-left text-gray-500 border-b border-gray-100 bg-gray-50">
                  <th className="px-4 py-3 font-semibold">Name</th>
                  <th className="px-4 py-3 font-semibold">Role</th>
                  <th className="px-4 py-3 font-semibold">Status</th>
                  <th className="px-4 py-3 font-semibold text-right">Sessions</th>
                  <th className="px-4 py-3 font-semibold">Last Session</th>
                  <th className="px-4 py-3"></th>
                </tr>
              </thead>
              <tbody>
                {users.map(u => (
                  <tr key={u.id} className="border-b border-gray-100 hover:bg-gray-50 transition">
                    <td className="px-4 py-3">
                      <div className="font-medium text-gray-900">{u.name}</div>
                      <div className="text-xs text-gray-400">{u.email}</div>
                    </td>
                    <td className="px-4 py-3">
                      <span className={`text-xs px-2 py-1 rounded-full font-medium ${u.role === 'admin' ? 'bg-amber-100 text-amber-700 border border-amber-200' : 'bg-gray-100 text-gray-600 border border-gray-200'}`}>
                        {u.role}
                      </span>
                    </td>
                    <td className="px-4 py-3">
                      <button onClick={() => toggleSub(u)}
                        aria-label={`Change subscription status for ${u.name} (currently ${u.subscription_status})`}
                        className={`text-xs px-2 py-1 rounded-full font-medium transition hover:opacity-75 ${STATUS_COLORS[u.subscription_status]}`}>
                        {u.subscription_status}
                      </button>
                    </td>
                    <td className="px-4 py-3 text-right text-gray-700">{u.total_sessions}</td>
                    <td className="px-4 py-3 text-gray-600">{u.last_session_date ? new Date(u.last_session_date).toLocaleDateString() : '—'}</td>
                    <td className="px-4 py-3 text-right">
                      <button onClick={() => viewSessions(u)} aria-label={`View sessions for ${u.name}`} className="text-xs text-brand hover:underline font-medium mr-3">Sessions</button>
                      <button onClick={() => deleteUser(u)} aria-label={`Delete ${u.name}`} className="text-xs text-red-500 hover:underline font-medium">Delete</button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>

        {selectedUser && (
          <div>
            <div className="flex items-center justify-between mb-3">
              <h2 className="text-lg font-bold">{selectedUser.name}'s Sessions</h2>
              <button onClick={() => setSelectedUser(null)} aria-label="Close sessions panel" className="text-gray-400 hover:text-gray-600 text-sm">✕</button>
            </div>
            <div className="bg-white rounded-2xl shadow-natural overflow-hidden">
              {userSessions.length === 0 ? (
                <p className="text-gray-400 text-sm p-4">No sessions.</p>
              ) : (
                <table className="w-full text-sm">
                  <thead>
                    <tr className="text-left text-gray-500 border-b border-gray-100 bg-gray-50">
                      <th className="px-4 py-3 font-semibold">Date</th>
                      <th className="px-4 py-3 font-semibold">Location</th>
                      <th className="px-4 py-3 font-semibold text-right">Score</th>
                    </tr>
                  </thead>
                  <tbody>
                    {userSessions.map(s => (
                      <tr key={s.id} className="border-b border-gray-100">
                        <td className="px-4 py-2 text-gray-900">{s.date}</td>
                        <td className="px-4 py-2 text-gray-600">{s.location}</td>
                        <td className="px-4 py-2 text-right font-bold text-brand">{s.total_points}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              )}
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
