export const playSound = (type: 'send' | 'receive' | 'success' | 'error') => {
  try {
    const ctx = new AudioContext();
    const osc = ctx.createOscillator();
    const gain = ctx.createGain();
    osc.connect(gain);
    gain.connect(ctx.destination);
    gain.gain.value = 0.08;

    switch (type) {
      case 'send':
        osc.frequency.value = 800;
        osc.type = 'sine';
        gain.gain.exponentialRampToValueAtTime(0.001, ctx.currentTime + 0.1);
        osc.start(); osc.stop(ctx.currentTime + 0.1);
        break;
      case 'receive':
        osc.frequency.value = 600;
        osc.type = 'sine';
        gain.gain.exponentialRampToValueAtTime(0.001, ctx.currentTime + 0.15);
        osc.start(); osc.stop(ctx.currentTime + 0.15);
        break;
      case 'success':
        osc.frequency.value = 523;
        osc.type = 'sine';
        gain.gain.exponentialRampToValueAtTime(0.001, ctx.currentTime + 0.3);
        osc.start();
        setTimeout(() => {
          const o2 = ctx.createOscillator();
          const g2 = ctx.createGain();
          o2.connect(g2); g2.connect(ctx.destination);
          g2.gain.value = 0.08;
          o2.frequency.value = 659;
          o2.type = 'sine';
          g2.gain.exponentialRampToValueAtTime(0.001, ctx.currentTime + 0.5);
          o2.start(); o2.stop(ctx.currentTime + 0.5);
        }, 150);
        osc.stop(ctx.currentTime + 0.3);
        break;
      case 'error':
        osc.frequency.value = 200;
        osc.type = 'square';
        gain.gain.exponentialRampToValueAtTime(0.001, ctx.currentTime + 0.2);
        osc.start(); osc.stop(ctx.currentTime + 0.2);
        break;
    }
  } catch { /* AudioContext not available */ }
};
