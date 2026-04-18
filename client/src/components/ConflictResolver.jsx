import { useOfflineQueue } from '../hooks/useOfflineQueue.jsx';

function formatDate(iso) {
  if (!iso) return '—';
  return new Date(iso).toLocaleString();
}

function SessionCard({ label, session, labelClass }) {
  return (
    <div className="flex-1 bg-gray-50 border border-gray-200 rounded-xl p-4">
      <div className={`text-xs font-bold uppercase tracking-wide mb-3 ${labelClass}`}>{label}</div>
      <div className="space-y-1 text-sm">
        <div><span className="text-gray-500">Date:</span> <span className="font-medium">{session?.date || '—'}</span></div>
        <div><span className="text-gray-500">Location:</span> <span className="font-medium">{session?.location || '—'}</span></div>
        {session?.notes && <div><span className="text-gray-500">Notes:</span> <span className="font-medium">{session.notes}</span></div>}
        <div><span className="text-gray-500">Modified:</span> <span className="font-medium">{formatDate(session?.updated_at)}</span></div>
        <div><span className="text-gray-500">Boulders:</span> <span className="font-medium">{session?.completed_count ?? '—'} topped</span></div>
      </div>
    </div>
  );
}

export default function ConflictResolver() {
  const { conflicts, errors, resolveConflict, discardError } = useOfflineQueue();

  if (conflicts.length === 0 && errors.length === 0) return null;

  return (
    <div className="fixed inset-0 bg-black/40 z-50 flex items-center justify-center p-4">
      <div className="bg-white rounded-2xl shadow-2xl w-full max-w-lg max-h-[90vh] overflow-y-auto">
        <div className="p-6 border-b border-gray-100">
          <h2 className="text-lg font-bold text-gray-900">Sync Issues</h2>
          <p className="text-sm text-gray-500 mt-1">Resolve these before syncing continues</p>
        </div>

        <div className="p-6 space-y-8">
          {conflicts.map(entry => (
            <div key={entry.id}>
              <div className="text-sm font-semibold text-amber-700 bg-amber-50 border border-amber-200 rounded-lg px-3 py-2 mb-4">
                ⚠ Conflict — this session was changed on another device
              </div>
              <div className="flex gap-3 mb-4">
                <SessionCard
                  label="Your version"
                  labelClass="text-brand"
                  session={entry.payload?.data}
                />
                <SessionCard
                  label="Server version"
                  labelClass="text-gray-500"
                  session={entry.serverVersion}
                />
              </div>
              <div className="flex gap-3">
                <button
                  onClick={() => resolveConflict(entry.id, 'mine')}
                  className="flex-1 bg-brand hover:bg-brand-dark text-white font-semibold py-2.5 rounded-full transition text-sm"
                >
                  Keep mine
                </button>
                <button
                  onClick={() => resolveConflict(entry.id, 'server')}
                  className="flex-1 border border-gray-300 hover:border-gray-400 text-gray-700 font-semibold py-2.5 rounded-full transition text-sm"
                >
                  Keep server
                </button>
              </div>
            </div>
          ))}

          {errors.map(entry => (
            <div key={entry.id}>
              <div className="text-sm font-semibold text-red-700 bg-red-50 border border-red-200 rounded-lg px-3 py-2 mb-4">
                ✕ Sync failed — {entry.errorMsg || 'server rejected this change'}
              </div>
              <div className="text-sm text-gray-600 mb-4">
                <strong>Action:</strong> {entry.type.replace('_SESSION', ' session').toLowerCase()}
                {entry.payload?.data?.location && ` · ${entry.payload.data.location}`}
              </div>
              <button
                onClick={() => discardError(entry.id)}
                className="w-full border border-red-300 text-red-600 hover:bg-red-50 font-semibold py-2.5 rounded-full transition text-sm"
              >
                Discard this change
              </button>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}
