import { useRef, useEffect, useCallback } from 'react';

/**
 * TubesBackground — Minimal animated background.
 * Very faint tube paths with a single smooth electric pulse that
 * fades linearly with no visible segmentation.
 */

interface Tube {
    points: [number, number][];
    width: number;
}

const TUBES: Tube[] = [
    { points: [[-0.05, 0.18], [0.2, 0.14], [0.45, 0.32], [0.7, 0.22], [1.05, 0.35]], width: 1 },
    { points: [[-0.05, 0.55], [0.25, 0.62], [0.5, 0.45], [0.75, 0.58], [1.05, 0.5]], width: 0.8 },
    { points: [[-0.05, 0.82], [0.2, 0.76], [0.5, 0.88], [0.8, 0.74], [1.05, 0.8]], width: 0.9 },
    { points: [[0.15, -0.05], [0.18, 0.3], [0.25, 0.6], [0.2, 0.85], [0.15, 1.05]], width: 0.7 },
    { points: [[0.78, -0.05], [0.82, 0.25], [0.72, 0.55], [0.8, 0.8], [0.75, 1.05]], width: 0.7 },
];

function catmullRom(
    p0: [number, number], p1: [number, number],
    p2: [number, number], p3: [number, number],
    t: number
): [number, number] {
    const t2 = t * t, t3 = t2 * t;
    return [
        0.5 * ((2 * p1[0]) + (-p0[0] + p2[0]) * t + (2 * p0[0] - 5 * p1[0] + 4 * p2[0] - p3[0]) * t2 + (-p0[0] + 3 * p1[0] - 3 * p2[0] + p3[0]) * t3),
        0.5 * ((2 * p1[1]) + (-p0[1] + p2[1]) * t + (2 * p0[1] - 5 * p1[1] + 4 * p2[1] - p3[1]) * t2 + (-p0[1] + 3 * p1[1] - 3 * p2[1] + p3[1]) * t3),
    ];
}

function getSplinePoint(points: [number, number][], t: number): [number, number] {
    const n = points.length - 1;
    const segment = Math.min(Math.floor(t * n), n - 1);
    const localT = (t * n) - segment;
    const p0 = points[Math.max(0, segment - 1)];
    const p1 = points[segment];
    const p2 = points[Math.min(n, segment + 1)];
    const p3 = points[Math.min(n, segment + 2)];
    return catmullRom(p0, p1, p2, p3, localT);
}

// Precompute a path of screen-space points for a tube
function computePath(points: [number, number][], W: number, H: number, dpr: number, steps: number): [number, number][] {
    const path: [number, number][] = [];
    for (let i = 0; i <= steps; i++) {
        const t = i / steps;
        const [x, y] = getSplinePoint(points, t);
        path.push([x * W / dpr, y * H / dpr]);
    }
    return path;
}

export function TubesBackground() {
    const canvasRef = useRef<HTMLCanvasElement>(null);
    const animRef = useRef<number>(0);
    const startRef = useRef(performance.now() / 1000);

    const render = useCallback(() => {
        const canvas = canvasRef.current;
        if (!canvas) return;
        const ctx = canvas.getContext('2d');
        if (!ctx) return;

        const W = canvas.width;
        const H = canvas.height;
        const dpr = window.devicePixelRatio || 1;
        const now = performance.now() / 1000;
        const elapsed = now - startRef.current;

        ctx.clearRect(0, 0, W, H);

        const pathSteps = 400; // very high for smooth trail

        // ── Draw all tubes as barely-visible structural lines ──
        ctx.lineCap = 'round';
        ctx.lineJoin = 'round';
        for (const tube of TUBES) {
            const path = computePath(tube.points, W, H, dpr, 80);
            ctx.beginPath();
            ctx.moveTo(path[0][0], path[0][1]);
            for (let i = 1; i < path.length; i++) {
                ctx.lineTo(path[i][0], path[i][1]);
            }
            ctx.strokeStyle = 'rgba(0, 155, 119, 0.04)';
            ctx.lineWidth = tube.width;
            ctx.stroke();
        }

        // ── Single pulse traveling one tube at a time ──
        const pulseDuration = 6;
        const pauseBetween = 2;
        const cycleDuration = pulseDuration + pauseBetween;
        const cycleTime = elapsed % cycleDuration;
        const tubeIndex = Math.floor(elapsed / cycleDuration) % TUBES.length;

        if (cycleTime < pulseDuration) {
            const tube = TUBES[tubeIndex];
            const progress = cycleTime / pulseDuration;
            const trailLength = 0.14;
            const path = computePath(tube.points, W, H, dpr, pathSteps);

            // Draw the trail as a single continuous gradient stroke
            // by drawing many tiny overlapping sub-segments with smooth alpha
            const headIdx = Math.floor(progress * pathSteps);
            const tailIdx = Math.max(0, Math.floor((progress - trailLength) * pathSteps));

            if (headIdx > tailIdx && headIdx < pathSteps) {
                // Draw from tail to head, increasing alpha smoothly
                const totalSegments = headIdx - tailIdx;

                for (let i = tailIdx; i < headIdx; i++) {
                    const fade = (i - tailIdx) / totalSegments; // 0 at tail → 1 at head
                    // Smooth cubic easing for natural falloff
                    const alpha = fade * fade * 0.3;

                    ctx.beginPath();
                    ctx.moveTo(path[i][0], path[i][1]);
                    // Draw to next point (and one more if possible for continuity)
                    const end = Math.min(i + 2, headIdx);
                    for (let j = i + 1; j <= end; j++) {
                        ctx.lineTo(path[j][0], path[j][1]);
                    }

                    ctx.strokeStyle = `rgba(0, 255, 204, ${alpha})`;
                    ctx.lineWidth = tube.width + 0.5;
                    ctx.lineCap = 'round';
                    ctx.stroke();
                }

                // Tiny bright dot at the head — just a small soft circle
                if (headIdx < path.length) {
                    const [hx, hy] = path[headIdx];
                    const grad = ctx.createRadialGradient(hx, hy, 0, hx, hy, 4);
                    grad.addColorStop(0, 'rgba(200, 255, 240, 0.6)');
                    grad.addColorStop(1, 'rgba(0, 255, 204, 0)');
                    ctx.beginPath();
                    ctx.arc(hx, hy, 4, 0, Math.PI * 2);
                    ctx.fillStyle = grad;
                    ctx.fill();
                }
            }
        }

        animRef.current = requestAnimationFrame(render);
    }, []);

    useEffect(() => {
        const canvas = canvasRef.current;
        if (!canvas) return;

        const resize = () => {
            const dpr = window.devicePixelRatio || 1;
            canvas.width = window.innerWidth * dpr;
            canvas.height = window.innerHeight * dpr;
            canvas.style.width = `${window.innerWidth}px`;
            canvas.style.height = `${window.innerHeight}px`;
            const ctx = canvas.getContext('2d');
            if (ctx) ctx.scale(dpr, dpr);
        };

        resize();
        window.addEventListener('resize', resize);
        animRef.current = requestAnimationFrame(render);

        return () => {
            window.removeEventListener('resize', resize);
            cancelAnimationFrame(animRef.current);
        };
    }, [render]);

    return (
        <canvas
            ref={canvasRef}
            style={{
                position: 'fixed',
                inset: 0,
                zIndex: 0,
                pointerEvents: 'none',
            }}
        />
    );
}
