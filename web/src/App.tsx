import { useState, useEffect } from 'react';
import { isVaultInitialized } from './lib/vault';
import SetupWizard from './components/SetupWizard';
import Dashboard from './components/Dashboard';

export default function App() {
  const [ready, setReady] = useState<boolean | null>(null);

  useEffect(() => {
    setReady(isVaultInitialized());
  }, []);

  if (ready === null) return null; // loading

  if (!ready) {
    return <SetupWizard onComplete={() => setReady(true)} />;
  }

  return <Dashboard />;
}
