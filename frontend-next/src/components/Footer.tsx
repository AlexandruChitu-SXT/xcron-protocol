import Link from 'next/link';
import { NETWORK } from '../config';

export function Footer() {
  return (
    <footer className="footer mt-auto border-t border-white/5 bg-[#0a0f19]/80 backdrop-blur-sm z-10 w-full shrink-0">
      <div className="footer-inner max-w-[1600px] w-full mx-auto px-6 py-8 lg:px-10 lg:py-10">
        <div className="footer-grid grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-8">
          {/* Brand */}
          <div className="footer-col flex flex-col gap-3">
            <div className="footer-brand flex items-center gap-2">
              <span className="text-xl font-bold tracking-tight text-white">XCron</span>
              <span className="px-2 py-0.5 rounded text-[10px] font-bold tracking-widest uppercase bg-cyan-500/10 text-cyan-400">Protocol</span>
            </div>
            <p className="text-sm text-white/50 leading-relaxed">
              Decentralized task automation for MultiversX. Schedule once, execute forever.
            </p>
            <div className="flex items-center gap-2 text-xs text-white/40 mt-2 px-3 py-2 rounded-full border border-white/5 w-max bg-white/5">
              <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="cyan" strokeWidth="2" strokeLinecap="round">
                <polygon points="12,2 22,8.5 22,15.5 12,22 2,15.5 2,8.5" />
              </svg>
              Built on <span className="font-bold text-cyan-400 hidden lg:inline">MultiversX</span><span className="font-bold text-cyan-400 lg:hidden">MVX</span> with <span className="text-red-500">️</span>
            </div>
          </div>

          {/* Navigation */}
          <div className="footer-col flex flex-col gap-3">
            <h4 className="font-bold text-xs uppercase tracking-widest text-white/70 mb-2">Navigate</h4>
            <div className="flex flex-col gap-2 text-sm text-white/50">
              <Link href="/" className="hover:text-cyan-400 transition-colors w-max">Dashboard</Link>
              <Link href="/schedule" className="hover:text-cyan-400 transition-colors w-max">Schedule Task</Link>
              <Link href="/tasks" className="hover:text-cyan-400 transition-colors w-max">My Tasks</Link>
              <Link href="/keeper" className="hover:text-cyan-400 transition-colors w-max">Keeper Panel</Link>
            </div>
          </div>

          {/* Resources */}
          <div className="footer-col flex flex-col gap-3">
            <h4 className="font-bold text-xs uppercase tracking-widest text-white/70 mb-2">Resources</h4>
            <div className="flex flex-col gap-2 text-sm text-white/50">
              <a href="https://github.com/AlexandruChitu-SXT/xcron-protocol" target="_blank" rel="noopener noreferrer" className="hover:text-cyan-400 transition-colors w-max">GitHub</a>
              <a href={NETWORK.explorerUrl} target="_blank" rel="noopener noreferrer" className="hover:text-cyan-400 transition-colors w-max">Explorer</a>
              <a href="https://docs.multiversx.com" target="_blank" rel="noopener noreferrer" className="hover:text-cyan-400 transition-colors w-max">MultiversX Docs</a>
            </div>
          </div>

          {/* Community */}
          <div className="footer-col flex flex-col gap-3">
            <h4 className="font-bold text-xs uppercase tracking-widest text-white/70 mb-2">Community</h4>
            <div className="flex flex-col gap-2 text-sm text-white/50">
              <a href="https://x.com/AlejandroChitu" target="_blank" rel="noopener noreferrer" className="hover:text-cyan-400 transition-colors w-max">X (Twitter)</a>
              <a href="https://t.me/alexandruchituxcron" target="_blank" rel="noopener noreferrer" className="hover:text-cyan-400 transition-colors w-max">Telegram</a>
            </div>
          </div>
        </div>

        <div className="mt-8 pt-6 border-t border-white/5 flex flex-col md:flex-row items-center justify-between gap-4 text-xs text-white/30">
          <span>© {new Date().getFullYear()} XCron Protocol. All rights reserved.</span>
          <div className="flex items-center gap-2">
            <span className="w-2 h-2 rounded-full bg-green-500 animate-pulse" />
            <span className="font-medium text-white/50">{NETWORK.name.charAt(0).toUpperCase() + NETWORK.name.slice(1)} Live</span>
          </div>
        </div>
      </div>
    </footer>
  );
}
