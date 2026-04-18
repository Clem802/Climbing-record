import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import BoulderCard from '../components/BoulderCard.jsx';
import SessionSummaryBar from '../components/SessionSummaryBar.jsx';
import { useOfflineQueue } from '../hooks/useOfflineQueue.jsx';
import { useToast } from '../hooks/useToast.jsx';

function initBoulders() {
  const b = {};
  for (let i = 1; i <= 35; i++) b[i] = null;
  return b;
}

export default function SessionNew() {
  const [form, setForm] = useState({ date: new Date().toISOString().slice(0, 10), location: '', notes: '' });
  const [boulders, setBoulders] = useState(initBoulders);
  const [saving, setSaving] = useState(false);
  const [summary, setSummary] = useState(null);
  const { addToast } = useToast();
  const navigate = useNavigate();
  const { createSession } = useOfflineQueue();

  function setBoulder(num, value) {
    setBoulders(b => ({ ...b, [num]: value }));
  }

  async function handleSubmit(e) {
    e.preventDefault();
    if (!form.location.trim()) { addToast('Location is required', 'error'); return; }
    setSaving(true);
    try {
      const boulderPayload = Object.entries(boulders)
        .filter(([, v]) => v !== null)
        .map(([k, v]) => ({ boulder_number: Number(k), attempts: v }));
      const data = await createSession({ ...form, boulders: boulderPayload });
      setSummary(data);
    } catch (err) {
      addToast(err.error || 'Failed to save session', 'error');
    } finally {
      setSaving(false);
    }
  }

  if (summary) {
    const avgAttempts = summary.completed_count > 0
      ? (summary.boulders.reduce((s, b) => s + b.attempts, 0) / summary.completed_count).toFixed(1)
      : '—';
    return (
      <div className="min-h-screen flex items-center justify-center px-4 bg-gray-50">
        <div className="bg-white rounded-2xl shadow-natural p-8 max-w-sm w-full text-center">
          <h2 className="text-3xl font-bold text-brand mb-1">Session Complete!</h2>
          <p className="text-gray-500 text-sm mb-6">Here's how you climbed</p>
          <div className="grid grid-cols-2 gap-4 mb-8">
            <div className="bg-gray-50 border border-gray-100 rounded-xl p-4">
              <div className="text-3xl font-bold text-brand">{summary.total_points}</div>
              <div className="text-sm text-gray-500 mt-1">Total Points</div>
            </div>
            <div className="bg-gray-50 border border-gray-100 rounded-xl p-4">
              <div className="text-3xl font-bold text-gray-900">{summary.completed_count} / 35</div>
              <div className="text-sm text-gray-500 mt-1">Completed</div>
            </div>
            <div className="bg-gray-50 border border-gray-100 rounded-xl p-4">
              <div className="text-3xl font-bold text-green-600">{summary.flash_count}</div>
              <div className="text-sm text-gray-500 mt-1">Flashes</div>
            </div>
            <div className="bg-gray-50 border border-gray-100 rounded-xl p-4">
              <div className="text-3xl font-bold text-gray-900">{avgAttempts}</div>
              <div className="text-sm text-gray-500 mt-1">Avg Attempts</div>
            </div>
          </div>
          <button onClick={() => navigate('/dashboard')}
            className="w-full bg-brand hover:bg-brand-dark text-white font-bold py-3 rounded-full transition">
            Done
          </button>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-gray-50 max-w-2xl mx-auto px-4 py-6 pb-28">
      <div className="flex items-center gap-3 mb-6">
        <button type="button" onClick={() => navigate('/dashboard')} className="text-gray-400 hover:text-brand transition text-xl">←</button>
        <h1 className="text-2xl font-bold">New Session</h1>
      </div>

      <form onSubmit={handleSubmit}>
        <div className="grid grid-cols-2 gap-4 mb-4">
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">Date</label>
            <input type="date" value={form.date}
              onChange={e => setForm(f => ({ ...f, date: e.target.value }))}
              required className="w-full bg-white border border-gray-300 rounded-xl px-3 py-2 focus:outline-none focus:border-brand focus:ring-1 focus:ring-brand" />
          </div>
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">Location</label>
            <input type="text" value={form.location}
              onChange={e => setForm(f => ({ ...f, location: e.target.value }))}
              placeholder="e.g. The Reach" required
              className="w-full bg-white border border-gray-300 rounded-xl px-3 py-2 focus:outline-none focus:border-brand focus:ring-1 focus:ring-brand" />
          </div>
        </div>
        <div className="mb-6">
          <label className="block text-sm font-medium text-gray-700 mb-1">Notes (optional)</label>
          <textarea value={form.notes}
            onChange={e => setForm(f => ({ ...f, notes: e.target.value }))}
            rows={2}
            className="w-full bg-white border border-gray-300 rounded-xl px-3 py-2 focus:outline-none focus:border-brand focus:ring-1 focus:ring-brand resize-none" />
        </div>

        <div className="grid grid-cols-5 gap-1.5 mb-6">
          {Array.from({ length: 35 }, (_, i) => i + 1).map(num => (
            <BoulderCard key={num} number={num} value={boulders[num]} onChange={v => setBoulder(num, v)} />
          ))}
        </div>

        <button type="submit" disabled={saving}
          className="w-full bg-brand hover:bg-brand-dark text-white font-bold py-3 rounded-full transition disabled:opacity-50">
          {saving ? 'Saving...' : 'Save Session'}
        </button>
      </form>

      <SessionSummaryBar boulders={boulders} />
    </div>
  );
}
