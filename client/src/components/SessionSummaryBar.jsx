function computePoints(attempts) {
  if (attempts === 1) return 10;
  if (attempts === 2) return 7;
  if (attempts === 3) return 4;
  return 1;
}

export default function SessionSummaryBar({ boulders }) {
  const entries = Object.values(boulders).filter(v => v !== null);
  const total_points = entries.reduce((sum, a) => sum + computePoints(a), 0);
  const completed_count = entries.length;
  const flash_count = entries.filter(a => a === 1).length;
  const avg = completed_count > 0
    ? (entries.reduce((s, a) => s + a, 0) / completed_count).toFixed(1)
    : '—';

  return (
    <div className="fixed bottom-0 left-0 right-0 bg-white border-t border-gray-200 shadow-lg px-4 py-3 z-40">
      <div className="max-w-2xl mx-auto flex justify-around">
        <Stat label="Points" value={total_points} accent />
        <Stat label="Completed" value={`${completed_count} / 35`} />
        <Stat label="Flashes" value={flash_count} />
        <Stat label="Avg Attempts" value={avg} />
      </div>
    </div>
  );
}

function Stat({ label, value, accent }) {
  return (
    <div className="text-center">
      <div className={`text-xl font-bold ${accent ? 'text-brand' : 'text-gray-900'}`}>{value}</div>
      <div className="text-xs text-gray-500">{label}</div>
    </div>
  );
}
