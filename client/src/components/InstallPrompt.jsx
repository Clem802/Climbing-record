import { useState, useEffect } from 'react';

const DISMISSED_KEY = 'pwa-install-dismissed';

export default function InstallPrompt() {
  const [deferredPrompt, setDeferredPrompt] = useState(null);
  const [show, setShow] = useState(false);
  const [isSafari, setIsSafari] = useState(false);

  useEffect(() => {
    // Don't show if already installed or previously dismissed
    const isInstalled = window.matchMedia('(display-mode: standalone)').matches;
    const dismissed = localStorage.getItem(DISMISSED_KEY);
    if (isInstalled || dismissed) return;

    // Chrome/Edge/Android: capture beforeinstallprompt
    function handleBeforeInstall(e) {
      e.preventDefault();
      setDeferredPrompt(e);
      setShow(true);
    }
    window.addEventListener('beforeinstallprompt', handleBeforeInstall);

    // Safari: show manual instructions if iOS Safari
    const isIosSafari = /iphone|ipad|ipod/i.test(navigator.userAgent) && !window.MSStream;
    if (isIosSafari && !dismissed) {
      setIsSafari(true);
      setShow(true);
    }

    return () => window.removeEventListener('beforeinstallprompt', handleBeforeInstall);
  }, []);

  function dismiss() {
    localStorage.setItem(DISMISSED_KEY, '1');
    setShow(false);
  }

  async function install() {
    if (!deferredPrompt) return;
    deferredPrompt.prompt();
    const { outcome } = await deferredPrompt.userChoice;
    if (outcome === 'accepted') {
      setShow(false);
    }
    setDeferredPrompt(null);
  }

  if (!show) return null;

  return (
    <>
      {/* Backdrop */}
      <div className="fixed inset-0 bg-black/20 z-40" onClick={dismiss} />
      {/* Bottom sheet */}
      <div className="fixed bottom-0 left-0 right-0 z-50 bg-white rounded-t-2xl shadow-2xl p-6 max-w-lg mx-auto">
        <div className="w-9 h-1 bg-gray-200 rounded-full mx-auto mb-4" />
        <h2 className="text-lg font-bold text-gray-900 mb-1">Install Boulder Tracker</h2>
        <p className="text-sm text-gray-500 mb-5">Add to your home screen for the best experience</p>
        <ul className="space-y-2 mb-6">
          {['Launch like a native app', "Works with your phone's back button", 'No browser chrome — full screen'].map(f => (
            <li key={f} className="flex items-center gap-2 text-sm text-gray-700">
              <span className="text-brand font-bold">✓</span> {f}
            </li>
          ))}
        </ul>
        {isSafari ? (
          <div className="bg-gray-50 border border-gray-200 rounded-xl p-4 text-sm text-gray-600 mb-4">
            Tap <strong>Share</strong> (↑) in Safari, then <strong>"Add to Home Screen"</strong>
          </div>
        ) : (
          <button
            onClick={install}
            className="w-full bg-brand hover:bg-brand-dark text-white font-bold py-3 rounded-full transition text-base"
          >
            Install App
          </button>
        )}
        <button
          onClick={dismiss}
          className="w-full mt-3 text-sm text-gray-400 hover:text-gray-600 py-2 transition"
        >
          Not now
        </button>
      </div>
    </>
  );
}
