import { Routes, Route, Navigate } from 'react-router-dom';
import { useEffect, useState } from 'react';
import { api } from './api';
import Layout from './components/Layout';
import Setup from './pages/Setup';
import Courses from './pages/Courses';
import Vault from './pages/Vault';
import Assistant from './pages/Assistant';
import Settings from './pages/Settings';

export default function App() {
  const [setupComplete, setSetupComplete] = useState<boolean | null>(null);

  useEffect(() => {
    api.getConfig()
      .then((cfg) => setSetupComplete(cfg.setup_complete))
      .catch(() => setSetupComplete(false));
  }, []);

  if (setupComplete === null) {
    return <div className="loading">Loading...</div>;
  }

  if (!setupComplete) {
    return <Setup onComplete={() => setSetupComplete(true)} />;
  }

  return (
    <Routes>
      <Route element={<Layout />}>
        <Route path="/" element={<Navigate to="/courses" replace />} />
        <Route path="/courses/*" element={<Courses />} />
        <Route path="/vault" element={<Vault />} />
        <Route path="/assistant" element={<Assistant />} />
        <Route path="/settings" element={<Settings />} />
      </Route>
    </Routes>
  );
}
