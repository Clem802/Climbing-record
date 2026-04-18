import { useOnlineStatus } from '../hooks/useOnlineStatus.js';

export default function OfflineBanner() {
  const isOnline = useOnlineStatus();
  if (isOnline) return null;
  return (
    <div className="fixed top-0 left-0 right-0 z-50 bg-amber-50 border-b border-amber-200 px-4 py-2 flex items-center gap-2">
      <span className="w-2 h-2 rounded-full bg-amber-400 flex-shrink-0" />
      <span className="text-sm font-medium text-amber-800">
        You're offline — changes will sync when you reconnect
      </span>
    </div>
  );
}
