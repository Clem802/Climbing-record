import { useState, useEffect } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import BoulderCard from '../components/BoulderCard.jsx';
import SessionSummaryBar from '../components/SessionSummaryBar.jsx';
import { apiGetSession, apiUpdateSession } from '../api/sessions.js';
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
  const canEdit = user?.subscription_status !== 'inactive';

  const [form, setForm] = useState({ date: '', location: '', notes: '' });
  const [boulders, setBoulders] = useState({});
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    apiGetSession(id)
      .then(data => {
        setForm({ date: data.date, location: data.location, notes: data.notes || '' });
        setBoulders(initBoulders(data.boulders));
      })
      .catch(() => {
        addToast('Failed to load session', 'error');
        navigate('/dashboard');
      })
      .finally(() => setLoading(false));
  }, [id]);

  async function handleSave(e) {
    e.preventDefault();
    setSaving(true);
    try {
      const boulderPayload = Object.entries(boulders)
        .filter(([, v]) => v !== null)
        .map(([k, v]) => ({ boulder_number: Number(k), attempts: v }));
      await apiUpdateSession(id, { ...form, boulders: boulderPayload });
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
    <div className="min-h-screen max-w-2xl mx-auto px-4 py-6 pb-28">
      <div className="flex items-center gap-3 mb-6">
        <button type="button" onClick={() => navigate('/dashboard')} className="text-gray-400 hover:text-white">←</button>
        <h1 className="text-2xl font-bold">Session Detail</h1>
        {!canEdit && <span className="ml-auto text-xs bg-amber-900/50 text-amber-300 px-2 py-1 rounded">Read Only</span>}
      </div>

      <form onSubmit={handleSave}>
        <div className="grid grid-cols-2 gap-4 mb-4">
          <div>
            <label className="block text-sm text-gray-400 mb-1">Date</label>
            <input type="date" value={form.date}
              onChange={e => setForm(f => ({ ...f, date: e.target.value }))}
              disabled={!canEdit} required
              className="w-full bg-gray-800 border border-gray-700 rounded px-3 py-2 focus:outline-none focus:border-brand disabled:opacity-60" />
          </div>
          <div>
            <label className="block text-sm text-gray-400 mb-1">Location</label>
            <input type="text" value={form.location}
              onChange={e => setForm(f => ({ ...f, location: e.target.value }))}
              disabled={!canEdit} required
              className="w-full bg-gray-800 border border-gray-700 rounded px-3 py-2 focus:outline-none focus:border-brand disabled:opacity-60" />
          </div>
        </div>
        <div className="mb-6">
          <label className="block text-sm text-gray-400 mb-1">Notes</label>
          <textarea value={form.notes}
            onChange={e => setForm(f => ({ ...f, notes: e.target.value }))}
            disabled={!canEdit} rows={2}
            className="w-full bg-gray-800 border border-gray-700 rounded px-3 py-2 focus:outline-none focus:border-brand resize-none disabled:opacity-60" />
        </div>

        <div className="grid grid-cols-5 gap-1.5 mb-6">
          {Array.from({ length: 35 }, (_, i) => i + 1).map(num => (
            <BoulderCard key={num} number={num} value={boulders[num]}
              onChange={canEdit ? v => setBoulders(b => ({ ...b, [num]: v })) : () => {}}
              disabled={!canEdit} />
          ))}
        </div>

        {canEdit && (
          <button type="submit" disabled={saving}
            className="w-full bg-brand hover:bg-brand-dark text-white font-bold py-3 rounded-lg transition disabled:opacity-50">
            {saving ? 'Saving...' : 'Save Changes'}
          </button>
        )}
      </form>

      <SessionSummaryBar boulders={boulders} />
    </div>
  );
}
