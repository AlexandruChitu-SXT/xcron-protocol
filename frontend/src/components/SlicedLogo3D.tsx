import { useEffect, useRef } from 'react';

const LOGO_SIZE = 220;
const CONTAINER = 320;

export default function SlicedLogo3D() {
    const canvasRef = useRef<HTMLCanvasElement>(null);
    const logoImgRef = useRef<HTMLImageElement | null>(null);
    const logoReadyRef = useRef(false);
    const animRef = useRef<number>(0);

    // Pre-process logo onto an offscreen canvas
    useEffect(() => {
        const img = new Image();
        img.crossOrigin = 'anonymous';
        img.src = '/logo.png';
        img.onload = () => {
            const off = document.createElement('canvas');
            off.width = img.width;
            off.height = img.height;
            const ctx = off.getContext('2d', { willReadFrequently: true })!;
            ctx.drawImage(img, 0, 0);
            const d = ctx.getImageData(0, 0, off.width, off.height);
            for (let p = 0; p < d.data.length; p += 4) {
                const b = d.data[p] * 0.299 + d.data[p + 1] * 0.587 + d.data[p + 2] * 0.114;
                if (b < 40) d.data[p + 3] = 0;
                else if (b < 70) d.data[p + 3] = Math.round(((b - 40) / 30) * 255);
            }
            ctx.putImageData(d, 0, 0);
            const processed = new Image();
            processed.src = off.toDataURL();
            processed.onload = () => {
                logoImgRef.current = processed;
                logoReadyRef.current = true;
            };
        };
    }, []);

    useEffect(() => {
        const canvas = canvasRef.current;
        if (!canvas) return;
        const dpr = window.devicePixelRatio || 1;
        canvas.width = CONTAINER * dpr;
        canvas.height = CONTAINER * dpr;
        const ctx = canvas.getContext('2d')!;
        ctx.scale(dpr, dpr);

        const cx = CONTAINER / 2;
        const logoOffset = (CONTAINER - LOGO_SIZE) / 2;

        const start = performance.now();
        function draw(now: number) {
            const t = (now - start) / 1000;
            ctx.clearRect(0, 0, CONTAINER, CONTAINER);

            // Gentle floating animation
            const floatY = Math.sin(t * 0.8) * 6;

            if (logoReadyRef.current && logoImgRef.current) {
                // Subtle glow behind logo
                const glowAlpha = 0.08 + 0.04 * Math.sin(t * 1.2);
                const g = ctx.createRadialGradient(cx, cx + floatY, LOGO_SIZE * 0.2, cx, cx + floatY, LOGO_SIZE * 0.6);
                g.addColorStop(0, `rgba(35,247,221,${glowAlpha})`);
                g.addColorStop(1, 'rgba(35,247,221,0)');
                ctx.beginPath();
                ctx.arc(cx, cx + floatY, LOGO_SIZE * 0.6, 0, Math.PI * 2);
                ctx.fillStyle = g;
                ctx.fill();

                ctx.drawImage(logoImgRef.current, logoOffset, logoOffset + floatY, LOGO_SIZE, LOGO_SIZE);
            }

            animRef.current = requestAnimationFrame(draw);
        }

        animRef.current = requestAnimationFrame(draw);
        return () => cancelAnimationFrame(animRef.current);
    }, []);

    return (
        <div style={{
            width: CONTAINER,
            height: CONTAINER,
            margin: '0 auto 12px',
            position: 'relative',
            zIndex: 2,
        }}>
            <canvas
                ref={canvasRef}
                style={{ width: CONTAINER, height: CONTAINER }}
            />
        </div>
    );
}
