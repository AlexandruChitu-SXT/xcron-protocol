import { useEffect, useRef } from 'react';

const LOGO_SIZE = 220;
const CONTAINER = 320;
const TEAL = '#23f7dd';

interface Orbit {
    rx: number;
    ry: number;
    tiltX: number;
    tiltZ: number;
    speed: number;
    ringSpeed: number;
    nodeSize: number;
    ringOpacity: number;
}

const ORBITS: Orbit[] = [
    { rx: 140, ry: 48, tiltX: 65, tiltZ: 0, speed: 2.0, ringSpeed: 1.7, nodeSize: 6, ringOpacity: 0.45 },
    { rx: 135, ry: 44, tiltX: 72, tiltZ: 90, speed: -2.0, ringSpeed: -1.7, nodeSize: 5, ringOpacity: 0.35 },
    { rx: 130, ry: 42, tiltX: 55, tiltZ: 45, speed: 2.0, ringSpeed: -1.5, nodeSize: 4.5, ringOpacity: 0.30 },
];

function toRad(d: number) { return d * Math.PI / 180; }

function project(angle: number, orbit: Orbit, ringAngle: number) {
    let x = orbit.rx * Math.cos(angle);
    let y = orbit.ry * Math.sin(angle);
    let z = 0;
    const tx = toRad(orbit.tiltX);
    const y1 = y * Math.cos(tx) - z * Math.sin(tx);
    const z1 = y * Math.sin(tx) + z * Math.cos(tx);
    y = y1; z = z1;
    const tz = toRad(orbit.tiltZ) + ringAngle;
    const x2 = x * Math.cos(tz) - y * Math.sin(tz);
    const y2 = x * Math.sin(tz) + y * Math.cos(tz);
    return { x: x2, y: y2, z };
}

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
            // Convert to image for fast drawing
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
        const cy = CONTAINER / 2;
        const logoOffset = (CONTAINER - LOGO_SIZE) / 2;

        function drawRingSegment(orbit: Orbit, ringAngle: number, behind: boolean) {
            const steps = 180;
            ctx.beginPath();
            let started = false;
            for (let s = 0; s <= steps; s++) {
                const a = (s / steps) * Math.PI * 2;
                const p = project(a, orbit, ringAngle);
                const isBehind = p.z < 0;
                if (isBehind !== behind) { started = false; continue; }
                const sx = cx + p.x;
                const sy = cy + p.y;
                if (!started) { ctx.moveTo(sx, sy); started = true; }
                else ctx.lineTo(sx, sy);
            }
            ctx.strokeStyle = TEAL;
            ctx.lineWidth = 1.5;
            ctx.globalAlpha = behind ? orbit.ringOpacity * 0.5 : orbit.ringOpacity;
            ctx.stroke();
            ctx.globalAlpha = 1;
        }

        function drawNode(orbit: Orbit, t: number, ringAngle: number) {
            const a = orbit.speed * t;
            const p = project(a, orbit, ringAngle);
            const nx = cx + p.x;
            const ny = cy + p.y;
            const depth = Math.max(0, Math.min(1, (p.z / orbit.rx) + 0.5));
            const alpha = 0.3 + 0.7 * depth;
            const size = orbit.nodeSize * (0.6 + 0.4 * depth);

            // Outer glow
            const g1 = ctx.createRadialGradient(nx, ny, 0, nx, ny, size * 6);
            g1.addColorStop(0, `rgba(35,247,221,${0.35 * alpha})`);
            g1.addColorStop(1, 'rgba(35,247,221,0)');
            ctx.beginPath(); ctx.arc(nx, ny, size * 6, 0, Math.PI * 2);
            ctx.fillStyle = g1; ctx.fill();

            // Core
            const g2 = ctx.createRadialGradient(nx, ny, 0, nx, ny, size);
            g2.addColorStop(0, `rgba(255,255,255,${alpha})`);
            g2.addColorStop(0.5, `rgba(35,247,221,${alpha * 0.9})`);
            g2.addColorStop(1, 'rgba(35,247,221,0)');
            ctx.beginPath(); ctx.arc(nx, ny, size, 0, Math.PI * 2);
            ctx.fillStyle = g2; ctx.fill();

            return p.z; // return depth for ordering
        }

        const start = performance.now();
        function draw(now: number) {
            const t = (now - start) / 1000;
            ctx.clearRect(0, 0, CONTAINER, CONTAINER);

            // Compute ring angles
            const ringAngles = ORBITS.map(o => o.ringSpeed * t);

            // 1. Draw the logo — static, centered at (cx, cy) = (200, 200)
            // Logo top-left = (CONTAINER - LOGO_SIZE) / 2 = 60
            // Logo center = 60 + 280/2 = 200 = cx ✓
            if (logoReadyRef.current && logoImgRef.current) {
                ctx.drawImage(logoImgRef.current, logoOffset, logoOffset, LOGO_SIZE, LOGO_SIZE);
            }

            // 2. Draw ALL orbit rings on top of logo
            ORBITS.forEach((o, i) => {
                drawRingSegment(o, ringAngles[i], true);
                drawRingSegment(o, ringAngles[i], false);
            });

            // 3. Draw ALL nodes on top
            ORBITS.forEach((o, i) => drawNode(o, t, ringAngles[i]));

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
