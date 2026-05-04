"use client";

import React, { useEffect, useState } from "react";

export default function CloneKeysPromo() {
  const [stage, setStage] = useState(1);

  useEffect(() => {
    // Cinematic Timeline
    const t2 = setTimeout(() => setStage(2), 5000); // Glitch
    const t3 = setTimeout(() => setStage(3), 5300); // Cyberpunk

    return () => {
      clearTimeout(t2);
      clearTimeout(t3);
    };
  }, []);

  return (
    <div className="relative w-full h-[500px] bg-black overflow-hidden rounded-[32px] border border-white/10 shadow-[0_0_50px_rgba(0,0,0,0.8)]">
      <style dangerouslySetInnerHTML={{
        __html: `
        /* ACT 1: RETRO SCENE */
        .retro-scene {
          position: absolute; width: 100%; height: 100%; background: #2f251c; /* Sepia dark */
          color: #dfcdb6; text-align: center; display: flex; flex-direction: column; justify-content: center; align-items: center;
          filter: sepia(0.8) contrast(1.5) grayscale(0.2);
          transition: opacity 0.5s;
        }
        
        /* Film Grain */
        .retro-scene::before {
          content: ""; position: absolute; top: 0; left: 0; width: 100%; height: 100%;
          background-image: url('data:image/svg+xml,%3Csvg viewBox="0 0 200 200" xmlns="http://www.w3.org/2000/svg"%3E%3Cfilter id="noiseFilter"%3E%3CfeTurbulence type="fractalNoise" baseFrequency="0.65" numOctaves="3" stitchTiles="stitch"/%3E%3C/filter%3E%3Crect width="100%25" height="100%25" filter="url(%23noiseFilter)" opacity="0.15"/%3E%3C/svg%3E');
          pointer-events: none; opacity: 0.8; animation: flicker 0.15s infinite;
        }
        .retro-text { font-size: 2.5rem; text-shadow: 2px 2px 5px rgba(0,0,0,0.8); max-width: 80%; line-height: 1.4; animation: fadeIn 2s forwards; }
        
        @keyframes flicker { 0% { opacity: 0.8; top: -1%; } 50% { opacity: 0.9; top: 1%; } 100% { opacity: 0.8; top: 0; } }
        @keyframes fadeIn { from { opacity: 0; transform: translateY(20px); } to { opacity: 1; transform: translateY(0); } }
        
        /* ACT 2: GLITCH SCENE */
        .glitch-scene {
          position: absolute; width: 100%; height: 100%; z-index: 10;
          background: #000; mix-blend-mode: exclusion;
          display: flex; justify-content: center; align-items: center;
        }
        .glitch-layer { position: absolute; width: 100%; height: 50%; top: 0; background: red; opacity: 0.3; animation: shake 0.1s infinite; clip-path: polygon(0 40%, 100% 40%, 100% 60%, 0 60%); }
        .glitch-layer2 { position: absolute; width: 100%; height: 50%; bottom: 0; background: cyan; opacity: 0.3; animation: shake2 0.08s infinite; clip-path: polygon(0 10%, 100% 10%, 100% 30%, 0 30%); }
        
        @keyframes shake { 0% { transform: translate(5px, 5px); } 50% { transform: translate(-5px, -5px); } 100% { transform: translate(5px, -5px); } }
        @keyframes shake2 { 0% { transform: translate(-10px, 0); } 50% { transform: translate(10px, 0); } 100% { transform: translate(-10px, 0); } }

        /* ACT 3: CYBERPUNK / XCRON SCENE */
        .xcron-scene {
          position: absolute; width: 100%; height: 100%; background: #010306; 
          display: flex; flex-direction: column; justify-content: center; align-items: center; z-index: 20; color: #fff;
        }
        
        /* Grid Background */
        .xcron-scene::after {
          content: ''; position: absolute; top:0; left:0; width: 100%; height: 100%; pointer-events: none;
          background: linear-gradient(rgba(0, 240, 255, 0.05) 1px, transparent 1px),
                      linear-gradient(90deg, rgba(0, 240, 255, 0.05) 1px, transparent 1px);
          background-size: 50px 50px; z-index: -1;
          transform: perspective(500px) rotateX(60deg) translateY(-100px) scale(3);
          animation: gridMove 5s linear infinite;
        }
        @keyframes gridMove { 0% { transform: perspective(500px) rotateX(60deg) translateY(0) scale(3); } 100% { transform: perspective(500px) rotateX(60deg) translateY(50px) scale(3); } }

        .xcron-title { font-size: 2.5rem; color: #00f0ff; letter-spacing: 5px; font-weight: bold; text-shadow: 0 0 20px #00f0ff, 0 0 40px #00f0ff; opacity: 0; animation: fadeDown 1s 0.5s ease-out forwards; }
        .clone-keys { font-size: 5rem; color: #fff; font-weight: 900; letter-spacing: 2px; text-shadow: 2px 2px 0 #f00, -2px -2px 0 #0ff; margin-top: 20px; animation: cyberGlitch 3s infinite; opacity: 0; animation: fadeDown 1s 1.5s ease-out forwards, cyberGlitch 3s infinite 2.5s; }
        .subtitle { color: #88c0d0; font-size: 1.5rem; margin-top: 40px; text-transform: uppercase; letter-spacing: 3px; opacity: 0; animation: fadeUp 1.5s 2.5s ease-out forwards; }

        @keyframes cyberGlitch {
          0% { text-shadow: 2px 2px 0 #f00, -2px -2px 0 #0ff; }
          1% { text-shadow: -5px 0 0 #f00, 5px 0 0 #0ff; }
          2% { text-shadow: 2px 2px 0 #f00, -2px -2px 0 #0ff; }
          100% { text-shadow: 2px 2px 0 #f00, -2px -2px 0 #0ff; }
        }
        @keyframes fadeDown { from { opacity: 0; transform: translateY(-50px); } to { opacity: 1; transform: translateY(0); } }
        @keyframes fadeUp { from { opacity: 0; transform: translateY(50px); } to { opacity: 1; transform: translateY(0); } }
        `
      }} />

      {/* SCENE 1 */}
      {stage === 1 && (
        <div className="retro-scene font-mono">
          <div className="retro-text" style={{ animationDelay: '1s', opacity: 0 }}>The old era of Web3...</div>
          <br /><br />
          <div className="retro-text text-[#bca085]" style={{ fontSize: '2rem', animationDelay: '2.8s', opacity: 0 }}>Security was a manual bottleneck.</div>
        </div>
      )}

      {/* SCENE 2 */}
      {stage === 2 && (
        <div className="glitch-scene">
          <div className="glitch-layer shadow-xl"></div>
          <div className="glitch-layer2 shadow-xl"></div>
        </div>
      )}

      {/* SCENE 3 */}
      {stage === 3 && (
        <div className="xcron-scene font-sans">
          <div className="text-center md:whitespace-nowrap xcron-title">DELEGATED EXECUTION</div>
          <div className="text-center md:whitespace-nowrap clone-keys">CLONE KEYS</div>
          <div className="text-center subtitle">Zero-Risk Delegation. Infinite Execution.</div>
          
          <button 
            className="mt-16 px-10 py-4 bg-transparent border-2 border-[#00f0ff] text-[#00f0ff] font-bold tracking-widest text-lg hover:bg-[#00f0ff] hover:text-black hover:shadow-[0_0_30px_#00f0ff] transition-all duration-300 opacity-0"
            style={{ animation: 'fadeUp 1s 4s forwards' }}
          >
            INITIALIZE PURCHASE
          </button>
        </div>
      )}
    </div>
  );
}
