import { useState, useEffect } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { apiGetSessions } from '../api/sessions.js';
import { useAuth } from '../hooks/useAuth.jsx';
import { useToast } from '../hooks/useToast.jsx';

export default function Dashboard() {
  const [sessions, setSessions] = useState([]);
  const [loading, setLoading] = useState(true);
  const { user, logout } = useAuth();
  const { addToast } = useToast();
  const navigate = useNavigate();
  const canLog = user?.subscription_status !== 'inactive';

  useEffect(() => {
    apiGetSessions()
      .then(setSessions)
      .catch(() => addToast('Failed to load sessions', 'error'))
      .finally(() => setLoading(false));
  }, []);

  return (
    <div className="min-h-screen max-w-4xl mx-auto px-4 py-6">
      {/* Header */}
      <div className="flex items-center justify-between mb-6">
        <div>
          <h1 className="text-2xl font-bold">Dashboard</h1>
          <p className="text-gray-400 text-sm">Welcome, {user?.name}</p>
        </div>
        <div className="flex gap-2">
          {user?.role === 'admin' && (
            <Link to="/admin" className="text-sm px-3 py-2 bg-gray-700 rounded hover:bg-gray-600 transition">Admin</Link>
          )}
          {canLog && (
            <Link to="/progress" className="text-sm px-3 py-2 bg-gray-700 rounded hover:bg-gray-600 transition">Progress</Link>
          )}
          <button onClick={logout} className="text-sm px-3 py-2 bg-gray-700 rounded hover:bg-gray-600 transition">Sign out</button>
        </div>
      </div>

      {/* Inactive banner */}
      {!canLog && (
        <div className="mb-6 bg-amber-900/40 border border-amber-700 rounded p-4">
          <p className="text-amber-300 text-sm">Your subscription is inactive. Contact your admin to reactivate.</p>
        </div>
      )}

      {/* New session button */}
      {canLog && (
        <button
          onClick={() => navigate('/sessions/new')}
          className="w-full mb-6 bg-brand hover:bg-brand-dark text-white font-bold py-3 rounded-lg transition text-lg">
          + Log New Session
        </button>
      )}

      {/* Sessions table */}
      {loading ? (
        <p className="text-gray-400 text-center py-12">Loading...</p>
      ) : sessions.length === 0 ? (
        <p className="text-gray-400 text-center py-12">No sessions yet.{canLog ? ' Log your first session!' : ''}</p>
      ) : (
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="text-left text-gray-400 border-b border-gray-700">
                <th className="pb-2 pr-4">Date</th>
                <th className="pb-2 pr-4">Location</th>
                <th className="pb-2 pr-4 text-right">Score</th>
                <th className="pb-2 pr-4 text-right">Completed</th>
                <th className="pb-2 text-right">Flashes</th>
              </tr>
            </thead>
            <tbody>
              {sessions.map(s => (
                <tr key={s.id}
                  onClick={() => navigate(`/sessions/${s.id}`)}
                  className="border-b border-gray-800 hover:bg-gray-800 cursor-pointer transition">
                  <td className="py-3 pr-4">{s.date}</td>
                  <td className="py-3 pr-4 text-gray-300">{s.location}</td>
                  <td className="py-3 pr-4 text-right font-bold text-brand">{s.total_points}</td>
                  <td className="py-3 pr-4 text-right">{s.completed_count} / 35</td>
                  <td className="py-3 text-right">{s.flash_count}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}
