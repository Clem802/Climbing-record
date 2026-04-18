import { useState, useEffect } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import BoulderCard from '../components/BoulderCard.jsx';
import SessionSummaryBar from '../components/SessionSummaryBar.jsx';
import { useOfflineQueue } from '../hooks/useOfflineQueue.jsx';
import { useAuth } from '../hooks/useAuth.jsx';
import { useToast } from '../hooks/useToast.jsx';

function initBoulders(boulderRows) {
  const b = {};
  for (let i = 1; i <= 35; i++) b[i] = null;
  for (const row of boulderRows) b[row.boulder_number] = row.attempts;
  return b;
}

export default function SessionDetail() {
  const { id } = useParams();
  const { user } = useAuth();
  const { addToast } = useToast();
  const navigate = useNavigate();
  const { getSession, updateSession, deleteSession } = useOfflineQueue();
  const canEdit = user?.subscription_status !== 'inactive';

  const [form, setForm] = useState({ date: '', location: '', notes: '' });
  const [boulders, setBoulders] = useState({});
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    getSession(id)
      .then(data => {
        setForm({ date: data.date, location: data.location, notes: data.notes || '' });
        setBoulders(initBoulders(data.boulders));
      })
      .catch(() => {
        addToast('Failed to load session', 'error');
        navigate('/dashboard');
      })
      .finally(() => setLoading(false));
  }, [id, addToast, navigate]);

  async function handleSave(e) {
    e.preventDefault();
    setSaving(true);
    try {
      const boulderPayload = Object.entries(boulders)
        .filter(([, v]) => v !== null)
        .map(([k, v]) => ({ boulder_number: Number(k), attempts: v }));
      await updateSession(id, { ...form, boulders: boulderPayload });
      addToast('Session saved!');
      navigate('/dashboard');
    } catch (err) {
      addToast(err.error || 'Failed to save', 'error');
    } finally {
      setSaving(false);
    }
  }

  if (loading) return <div className="flex items-center justify-center min-h-screen text-gray-400">Loading...</div>;

  return (
    <div className="min-h-screen bg-gray-50 max-w-2xl mx-auto px-4 py-6 pb-28">
      <div className="flex items-center gap-3 mb-6">
        <button type="button" onClick={() => navigate('/dashboard')} className="text-gray-400 hover:text-brand transition text-xl">←</button>
        <h1 className="text-2xl font-bold">Session Detail</h1>
        {!canEdit && <span className="ml-auto text-xs bg-amber-100 text-amber-700 border border-amber-200 px-2 py-1 rounded-full font-medium">Read Only</span>}
      </div>

      <form onSubmit={handleSave}>
        <div className="grid grid-cols-2 gap-4 mb-4">
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">Date</label>
            <input type="date" value={form.date}
              onChange={e => setForm(f => ({ ...f, date: e.target.value }))}
              disabled={!canEdit} required
              className="w-full bg-white border border-gray-300 rounded-xl px-3 py-2 focus:outline-none focus:border-brand focus:ring-1 focus:ring-brand disabled:opacity-60 disabled:bg-gray-50" />
          </div>
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">Location</label>
            <input type="text" value={form.location}
              onChange={e => setForm(f => ({ ...f, location: e.target.value }))}
              disabled={!canEdit} required
              className="w-full bg-white border border-gray-300 rounded-xl px-3 py-2 focus:outline-none focus:border-brand focus:ring-1 focus:ring-brand disabled:opacity-60 disabled:bg-gray-50" />
          </div>
        </div>
        <div className="mb-6">
          <label className="block text-sm font-medium text-gray-700 mb-1">Notes</label>
          <textarea value={form.notes}
            onChange={e => setForm(f => ({ ...f, notes: e.target.value }))}
            disabled={!canEdit} rows={2}
            className="w-full bg-white border border-gray-300 rounded-xl px-3 py-2 focus:outline-none focus:border-brand focus:ring-1 focus:ring-brand resize-none disabled:opacity-60 disabled:bg-gray-50" />
        </div>

        <div className="grid grid-cols-5 gap-1.5 mb-6">
          {Array.from({ length: 35 }, (_, i) => i + 1).map(num => (
            <BoulderCard key={num} number={num} value={boulders[num]}
              onChange={canEdit ? v => setBoulders(b => ({ ...b, [num]: v })) : () => {}}
              disabled={!canEdit} />
          ))}
        </div>

        {canEdit && (
          <div className="flex gap-3 mt-3">
            <button type="submit" disabled={saving}
              className="flex-1 bg-brand hover:bg-brand-dark text-white font-bold py-3 rounded-full transition disabled:opacity-50">
              {saving ? 'Saving...' : 'Save Changes'}
            </button>
            <button
              type="button"
              onClick={async () => {
                if (!confirm('Delete this session?')) return;
                await deleteSession(id);
                navigate('/dashboard');
              }}
              className="px-5 py-3 border border-red-300 text-red-600 hover:bg-red-50 font-bold rounded-full transition">
              Delete
            </button>
          </div>
        )}
      </form>

      <SessionSummaryBar boulders={boulders} />
    </div>
  );
}
