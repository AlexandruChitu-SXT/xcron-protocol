import type { Metadata } from "next";
import { Inter } from "next/font/google";
import "./globals.css";
import { Sidebar } from "@/components/Sidebar";
import { TubesBackground } from "@/components/TubesBackground";
import { ToastContainer } from "@/components/ToastContainer";
import { ConnectModal } from "@/components/ConnectModal";
import { Footer } from "@/components/Footer";
import Providers from "@/components/Providers";

const inter = Inter({ subsets: ["latin"], variable: "--font-inter" });

export const metadata: Metadata = {
  title: "XCron Protocol - Decentralized Web3 Automation",
  description: "Next-gen automation network built on MultiversX.",
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  // Adding Providers and Base structure from old Vite App.tsx
  return (
    <html lang="en">
      <body className={`${inter.variable} antialiased font-sans bg-[#000B12] text-white`}>
        {/* Animated background positioned fixed behind everything */}
        <TubesBackground />

        <Providers>
          <div className="flex h-screen overflow-hidden app-container">
            <Sidebar />

            {/* Main scrollable content area */}
            <main className="flex-1 overflow-y-auto w-full pt-16 md:pt-0">
              {/* 
                      Applying the UX principles for optimal proportional layout:
                      - Center aligned
                      - Max Width 7xl (1280px) to prevent overstretching
                    */}
              <div className="max-w-[1600px] mx-auto w-full px-6 py-8 lg:px-10 lg:py-10">
                <div className="page break-words min-h-[calc(100vh-160px)]">
                  {children}
                </div>
              </div>
              <Footer />
            </main>
          </div>

          {/* Global Modals & Toasts */}
          <ToastContainer />
          <ConnectModal />
        </Providers>
      </body>
    </html>
  );
}
