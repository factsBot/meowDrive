import React, { useEffect, useState } from 'react';
import { createRoot } from 'react-dom/client';
import App from './App';
import { AuthGate } from './components/AuthGate';
import { initWindowMeowFromWeb, isElectronPreloadActive } from './lib/storage';
import './styles.css';

function ElectronApp() {
  return <App />;
}

function WebApp({ ownerId, signOut }: { ownerId: string; signOut: () => Promise<void> }) {
  const [ready, setReady] = useState(false);
  useEffect(() => {
    initWindowMeowFromWeb(ownerId);
    setReady(true);
  }, [ownerId]);
  if (!ready) return <div className="empty">Loading…</div>;
  return <App onSignOut={signOut} />;
}

function Bootstrap() {
  if (isElectronPreloadActive()) {
    return <ElectronApp />;
  }
  return (
    <AuthGate>
      {(ownerId, signOut) => <WebApp ownerId={ownerId} signOut={signOut} />}
    </AuthGate>
  );
}

const root = createRoot(document.getElementById('root')!);
root.render(
  <React.StrictMode>
    <Bootstrap />
  </React.StrictMode>,
);
