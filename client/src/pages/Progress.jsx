import { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import {
  LineChart, Line, BarChart, Bar, XAxis, YAxis, CartesianGrid,
  Tooltip, Legend, ResponsiveContainer
} from 'recharts';
import { apiGetSessionsFull } from '../api/sessions.js';
import { useToast } from '../hooks/useToast.jsx';

const RANGES = [
  { label: 'Last 30 days', days: 30 },
  { label: 'Last 90 days', days: 90 },
  { label: 'All time', days: null },
];

function filterByRange(sessions, days) {
  if (!days) return sessions;
  const cutoff = new Date();
  cutoff.setDate(cutoff.getDate() - days);
  return sessions.filter(s => new Date(s.date) >= cutoff);
}

export default function Progress() {
  const [sessions, setSessions] = useState([]);
  const [loading, setLoading] = useState(true);
  const [range, setRange] = useState(90);
  const { addToast } = useToast();
  const navigate = useNavigate();

  useEffect(() => {
    apiGetSessionsFull()
      .then(setSessions)
      .catch(() => addToast('Failed to load sessions', 'error'))
      .finally(() => setLoading(false));
  }, [addToast]);

  const filtered = filterByRange(sessions, range);

  const chartData = filtered.map(s => {
    const avgAttempts = s.completed_count > 0
      ? (s.boulders.reduce((sum, b) => sum + b.attempts, 0) / s.completed_count).toFixed(2)
      : 0;
    const pts10 = s.boulders.filter(b => b.attempts === 1).length;
    const pts7 = s.boulders.filter(b => b.attempts === 2).length;
    const pts4 = s.boulders.filter(b => b.attempts === 3).length;
    const pts1 = s.boulders.filter(b => b.attempts >= 4).length;
    return {
      date: s.date.slice(5),
      score: s.total_points,
      completion: Math.round((s.completed_count / 35) * 100),
      flashes: s.flash_count,
      avgAttempts: Number(avgAttempts),
      pts10, pts7, pts4, pts1,
    };
  });

  const chartProps = {
    data: chartData,
    margin: { top: 5, right: 10, left: -10, bottom: 5 },
  };

  const axisProps = { stroke: '#6b7280', tick: { fill: '#9ca3af', fontSize: 11 } };
  const gridProps = { strokeDasharray: '3 3', stroke: '#374151' };
  const tooltipProps = { contentStyle: { backgroundColor: '#1f2937', border: '1px solid #374151', borderRadius: '6px' } };

  if (loading) return <div className="flex items-center justify-center min-h-screen text-gray-400">Loading...</div>;

  return (
    <div className="min-h-screen max-w-4xl mx-auto px-4 py-6">
      <div className="flex items-center justify-between mb-6">
        <div className="flex items-center gap-3">
          <button onClick={() => navigate('/dashboard')} className="text-gray-400 hover:text-white">←</button>
          <h1 className="text-2xl font-bold">Progress</h1>
        </div>
        <div className="flex gap-1">
          {RANGES.map(r => (
            <button key={r.label} onClick={() => setRange(r.days)}
              className={`text-sm px-3 py-1.5 rounded transition ${range === r.days ? 'bg-orange-500 text-white' : 'bg-gray-700 hover:bg-gray-600 text-gray-300'}`}>
              {r.label}
            </button>
          ))}
        </div>
      </div>

      {chartData.length === 0 ? (
        <p className="text-gray-400 text-center py-12">No sessions in this range.</p>
      ) : (
        <div className="space-y-8">
          <ChartCard title="Score Over Time">
            <ResponsiveContainer width="100%" height={220}>
              <LineChart {...chartProps}>
                <CartesianGrid {...gridProps} />
                <XAxis dataKey="date" {...axisProps} />
                <YAxis {...axisProps} domain={[0, 350]} />
                <Tooltip {...tooltipProps} />
                <Line type="monotone" dataKey="score" stroke="#f97316" strokeWidth={2} dot={{ r: 3 }} name="Points" />
              </LineChart>
            </ResponsiveContainer>
          </ChartCard>

          <ChartCard title="Completion Rate (%)">
            <ResponsiveContainer width="100%" height={220}>
              <LineChart {...chartProps}>
                <CartesianGrid {...gridProps} />
                <XAxis dataKey="date" {...axisProps} />
                <YAxis {...axisProps} domain={[0, 100]} unit="%" />
                <Tooltip {...tooltipProps} formatter={v => `${v}%`} />
                <Line type="monotone" dataKey="completion" stroke="#60a5fa" strokeWidth={2} dot={{ r: 3 }} name="Completion" />
              </LineChart>
            </ResponsiveContainer>
          </ChartCard>

          <ChartCard title="Flash Rate">
            <ResponsiveContainer width="100%" height={220}>
              <BarChart {...chartProps}>
                <CartesianGrid {...gridProps} />
                <XAxis dataKey="date" {...axisProps} />
                <YAxis {...axisProps} />
                <Tooltip {...tooltipProps} />
                <Bar dataKey="flashes" fill="#4ade80" name="Flashes" />
              </BarChart>
            </ResponsiveContainer>
          </ChartCard>

          <ChartCard title="Average Attempts per Completed Boulder">
            <ResponsiveContainer width="100%" height={220}>
              <LineChart {...chartProps}>
                <CartesianGrid {...gridProps} />
                <XAxis dataKey="date" {...axisProps} />
                <YAxis {...axisProps} domain={[1, 4]} />
                <Tooltip {...tooltipProps} />
                <Line type="monotone" dataKey="avgAttempts" stroke="#a78bfa" strokeWidth={2} dot={{ r: 3 }} name="Avg Attempts" />
              </LineChart>
            </ResponsiveContainer>
          </ChartCard>

          <ChartCard title="Points Breakdown per Session">
            <ResponsiveContainer width="100%" height={220}>
              <BarChart {...chartProps}>
                <CartesianGrid {...gridProps} />
                <XAxis dataKey="date" {...axisProps} />
                <YAxis {...axisProps} />
                <Tooltip {...tooltipProps} />
                <Legend wrapperStyle={{ fontSize: '12px', color: '#9ca3af' }} />
                <Bar dataKey="pts10" stackId="a" fill="#4ade80" name="10pts (flash)" />
                <Bar dataKey="pts7" stackId="a" fill="#facc15" name="7pts" />
                <Bar dataKey="pts4" stackId="a" fill="#f97316" name="4pts" />
                <Bar dataKey="pts1" stackId="a" fill="#ef4444" name="1pt" />
              </BarChart>
            </ResponsiveContainer>
          </ChartCard>
        </div>
      )}
    </div>
  );
}

function ChartCard({ title, children }) {
  return (
    <div className="bg-gray-800 rounded-xl p-4">
      <h3 className="text-sm font-semibold text-gray-400 mb-4 uppercase tracking-wide">{title}</h3>
      {children}
    </div>
  );
}
