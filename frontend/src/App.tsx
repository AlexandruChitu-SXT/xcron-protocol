import { BrowserRouter, Routes, Route } from 'react-router-dom';
import { Analytics } from '@vercel/analytics/react';
import { WalletProvider } from './hooks/useWallet';
import { Header } from './components/Header';
import { Footer } from './components/Footer';
import { ConnectModal } from './components/ConnectModal';
import { ToastContainer } from './components/ToastContainer';
import { NetworkBadge } from './components/NetworkBadge';
import { Dashboard } from './pages/Dashboard';
import { ScheduleTask } from './pages/ScheduleTask';
import { MyTasks } from './pages/MyTasks';
import { KeeperPanel } from './pages/KeeperPanel';
import { NotFound } from './pages/NotFound';

function App() {
  return (
    <WalletProvider>
      <BrowserRouter future={{ v7_startTransition: true, v7_relativeSplatPath: true }}>
        <Header />
        <ConnectModal />
        <ToastContainer />
        <NetworkBadge />
        <main style={{ flex: 1 }}>
          <Routes>
            <Route path="/" element={<Dashboard />} />
            <Route path="/schedule" element={<ScheduleTask />} />
            <Route path="/tasks" element={<MyTasks />} />
            <Route path="/keeper" element={<KeeperPanel />} />
            <Route path="*" element={<NotFound />} />
          </Routes>
        </main>
        <Footer />
      </BrowserRouter>
      <Analytics />
    </WalletProvider>
  );
}

export default App;
