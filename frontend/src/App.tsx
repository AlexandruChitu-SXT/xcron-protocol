import { BrowserRouter, Routes, Route } from 'react-router-dom';
import { Analytics } from '@vercel/analytics/react';
import { WalletProvider } from './hooks/useWallet';
import { Header } from './components/Header';
import { ConnectModal } from './components/ConnectModal';
import { ToastContainer } from './components/ToastContainer';
import { Dashboard } from './pages/Dashboard';
import { ScheduleTask } from './pages/ScheduleTask';
import { MyTasks } from './pages/MyTasks';
import { KeeperPanel } from './pages/KeeperPanel';

function App() {
  return (
    <WalletProvider>
      <BrowserRouter future={{ v7_startTransition: true, v7_relativeSplatPath: true }}>
        <Header />
        <ConnectModal />
        <ToastContainer />
        <main style={{ flex: 1 }}>
          <Routes>
            <Route path="/" element={<Dashboard />} />
            <Route path="/schedule" element={<ScheduleTask />} />
            <Route path="/tasks" element={<MyTasks />} />
            <Route path="/keeper" element={<KeeperPanel />} />
          </Routes>
        </main>
      </BrowserRouter>
      <Analytics />
    </WalletProvider>
  );
}

export default App;
