import { useOfflineQueue } from '../hooks/useOfflineQueue.jsx';

export default function SyncStatus() {
  const { pendingCount, syncNow } = useOfflineQueue();
  if (pendingCount === 0) return null;
  return (
    <button
      onClick={syncNow}
      className="flex items-center gap-1.5 text-xs font-semibold px-3 py-1.5 rounded-full bg-amber-100 text-amber-800 border border-amber-200 hover:bg-amber-200 transition"
      title="Click to sync now"
    >
      <span className="w-1.5 h-1.5 rounded-full bg-amber-500 animate-pulse" />
      {pendingCount} unsynced
    </button>
  );
}
