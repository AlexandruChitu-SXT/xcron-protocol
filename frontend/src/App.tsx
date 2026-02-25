import { lazy, Suspense } from 'react';
import { BrowserRouter, Routes, Route } from 'react-router-dom';
import { Analytics } from '@vercel/analytics/react';
import { WalletProvider } from './hooks/useWallet';
import { Header } from './components/Header';
import { Footer } from './components/Footer';
import { ConnectModal } from './components/ConnectModal';
import { ToastContainer } from './components/ToastContainer';
import { TubesBackground } from './components/TubesBackground';
import { NetworkBadge } from './components/NetworkBadge';

// ── Code splitting: lazy-load pages for smaller initial bundle ──
const Dashboard = lazy(() => import('./pages/Dashboard').then(m => ({ default: m.Dashboard })));
const ScheduleTask = lazy(() => import('./pages/ScheduleTask').then(m => ({ default: m.ScheduleTask })));
const MyTasks = lazy(() => import('./pages/MyTasks').then(m => ({ default: m.MyTasks })));
const KeeperPanel = lazy(() => import('./pages/KeeperPanel').then(m => ({ default: m.KeeperPanel })));
const ExploreTasks = lazy(() => import('./pages/ExploreTasks').then(m => ({ default: m.ExploreTasks })));
const NotFound = lazy(() => import('./pages/NotFound').then(m => ({ default: m.NotFound })));

// Loading spinner shown while a page chunk loads
function PageLoader() {
  return (
    <div style={{
      display: 'flex',
      justifyContent: 'center',
      alignItems: 'center',
      minHeight: '60vh',
      color: 'rgba(255,255,255,0.4)',
      fontSize: '0.9rem',
      fontFamily: 'Inter, system-ui, sans-serif',
    }}>
      <div style={{ textAlign: 'center' }}>
        <div style={{
          width: 32,
          height: 32,
          border: '2px solid rgba(255,255,255,0.1)',
          borderTop: '2px solid #00e5ff',
          borderRadius: '50%',
          animation: 'spin 0.8s linear infinite',
          margin: '0 auto 12px',
        }} />
        Loading...
      </div>
      <style>{`@keyframes spin { to { transform: rotate(360deg); } }`}</style>
    </div>
  );
}

function App() {
  return (
    <WalletProvider>
      <TubesBackground />
      <BrowserRouter future={{ v7_startTransition: true, v7_relativeSplatPath: true }}>
        <Header />
        <ConnectModal />
        <ToastContainer />
        <NetworkBadge />
        <main style={{ flex: 1, position: 'relative', zIndex: 2 }}>
          <Suspense fallback={<PageLoader />}>
            <Routes>
              <Route path="/" element={<Dashboard />} />
              <Route path="/schedule" element={<ScheduleTask />} />
              <Route path="/tasks" element={<MyTasks />} />
              <Route path="/keeper" element={<KeeperPanel />} />
              <Route path="/explore" element={<ExploreTasks />} />
              <Route path="*" element={<NotFound />} />
            </Routes>
          </Suspense>
        </main>
        <Footer />
      </BrowserRouter>
      <Analytics />
    </WalletProvider>
  );
}

export default App;
