import { useState, useEffect } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { useOfflineQueue } from '../hooks/useOfflineQueue.jsx';
import { useAuth } from '../hooks/useAuth.jsx';
import { useToast } from '../hooks/useToast.jsx';
import SyncStatus from '../components/SyncStatus.jsx';

export default function Dashboard() {
  const [sessions, setSessions] = useState([]);
  const [loading, setLoading] = useState(true);
  const { user, logout } = useAuth();
  const { addToast } = useToast();
  const navigate = useNavigate();
  const { getSessions } = useOfflineQueue();
  const canLog = user?.subscription_status !== 'inactive';

  useEffect(() => {
    getSessions()
      .then(setSessions)
      .catch(() => addToast('Failed to load sessions', 'error'))
      .finally(() => setLoading(false));
  }, [getSessions]);

  return (
    <div className="min-h-screen bg-gray-50">
      {/* Top nav */}
      <header className="bg-white border-b border-gray-200 shadow-sm">
        <div className="max-w-4xl mx-auto px-4 py-4 flex items-center justify-between">
          <div>
            <span className="text-2xl font-bold text-brand tracking-tight">SPIDER</span>
            <span className="text-gray-400 text-sm ml-2">/ {user?.name}</span>
          </div>
          <div className="flex gap-2 items-center">
            <SyncStatus />
            {user?.role === 'admin' && (
              <Link to="/admin" className="text-sm px-4 py-2 border border-gray-300 rounded-full hover:border-brand hover:text-brand transition font-medium">Admin</Link>
            )}
            {canLog && (
              <Link to="/progress" className="text-sm px-4 py-2 border border-gray-300 rounded-full hover:border-brand hover:text-brand transition font-medium">Progress</Link>
            )}
            <button onClick={logout} className="text-sm px-4 py-2 border border-gray-300 rounded-full hover:border-gray-400 transition font-medium text-gray-600">Sign out</button>
          </div>
        </div>
      </header>

      <div className="max-w-4xl mx-auto px-4 py-6">
        {/* New session / upgrade prompt */}
        {canLog ? (
          <button
            onClick={() => navigate('/sessions/new')}
            className="w-full mb-6 bg-brand hover:bg-brand-dark text-white font-bold py-4 rounded-full transition text-lg shadow-natural">
            + Log New Session
          </button>
        ) : (
          <div className="mb-6 bg-amber-50 border border-amber-200 rounded-2xl p-4 flex flex-col sm:flex-row sm:items-center gap-3">
            <p className="text-amber-700 text-sm flex-1">Your subscription is inactive. Upgrade to log new sessions.</p>
            <Link to="/upgrade" className="text-sm font-bold px-5 py-2 bg-amber-500 hover:bg-amber-600 text-white rounded-full transition text-center">Upgrade</Link>
          </div>
        )}

        {/* Sessions table */}
        {loading ? (
          <p className="text-gray-400 text-center py-12">Loading...</p>
        ) : sessions.length === 0 ? (
          <div className="text-center py-16 text-gray-400">
            <p className="text-lg font-medium">No sessions yet</p>
            {canLog && <p className="text-sm mt-1">Log your first session to start tracking your progress</p>}
          </div>
        ) : (
          <div className="bg-white rounded-2xl shadow-natural overflow-hidden">
            <table className="w-full text-sm">
              <thead>
                <tr className="text-left text-gray-500 border-b border-gray-100 bg-gray-50">
                  <th className="px-4 py-3 font-semibold">Date</th>
                  <th className="px-4 py-3 font-semibold">Location</th>
                  <th className="px-4 py-3 font-semibold text-right">Points</th>
                  <th className="px-4 py-3 font-semibold text-right">Completed</th>
                  <th className="px-4 py-3 font-semibold text-right">Flashes</th>
                </tr>
              </thead>
              <tbody>
                {sessions.map(s => (
                  <tr key={s.id}
                    onClick={() => navigate(`/sessions/${s.id}`)}
                    className="border-b border-gray-100 hover:bg-gray-50 cursor-pointer transition">
                    <td className="px-4 py-3 font-medium">{s.date}</td>
                    <td className="px-4 py-3 text-gray-600">
                      {s.location}
                      {s.unsynced && (
                        <span className="ml-2 text-xs bg-amber-100 text-amber-700 border border-amber-200 px-1.5 py-0.5 rounded-full font-medium">unsynced</span>
                      )}
                    </td>
                    <td className="px-4 py-3 text-right font-bold text-brand">{s.total_points}</td>
                    <td className="px-4 py-3 text-right text-gray-700">{s.completed_count} / 35</td>
                    <td className="px-4 py-3 text-right text-gray-700">{s.flash_count}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </div>
  );
}
