"use client";

import { useRef, useEffect, useCallback } from 'react';

/**
 * StarlightBackground — Rolls Royce starfield + shooting stars.
 * Twinkling fiber-optic stars with occasional shooting stars
 * that streak across the screen from random positions.
 */

// ── Starlight (Rolls Royce style) ──

interface Star {
    x: number;       // 0-1 normalized
    y: number;       // 0-1 normalized
    size: number;    // pixel radius
    speed: number;   // twinkle cycle duration in seconds
    offset: number;  // phase offset 0-1
    brightness: number; // max brightness 0-1
}

function generateStars(count: number): Star[] {
    const stars: Star[] = [];
    for (let i = 0; i < count; i++) {
        stars.push({
            x: Math.random(),
            y: Math.random(),
            size: 0.5 + Math.random() * 1.2,
            speed: 3 + Math.random() * 5,
            offset: Math.random(),
            brightness: 0.3 + Math.random() * 0.7,
        });
    }
    return stars;
}

const STARS = generateStars(120);

// ── Shooting star state ──

interface ShootingStar {
    startX: number;
    startY: number;
    angle: number;      // radians — direction of travel
    length: number;     // trail length in pixels
    speed: number;      // pixels per second
    startTime: number;  // elapsed seconds when it spawned
    duration: number;   // how long this shooting star lives
    brightness: number;
}

function spawnShootingStar(elapsed: number, screenW: number, screenH: number): ShootingStar {
    // Random edge: top or right side, traveling down-left (like a real meteor)
    const side = Math.random();
    let startX: number, startY: number, angle: number;

    if (side < 0.5) {
        // Spawn from top edge
        startX = 0.1 * screenW + Math.random() * 0.8 * screenW;
        startY = -10;
        angle = Math.PI * 0.55 + Math.random() * 0.35; // ~100°–160° (down-left to down-right)
    } else {
        // Spawn from right edge
        startX = screenW + 10;
        startY = Math.random() * 0.6 * screenH;
        angle = Math.PI * 0.65 + Math.random() * 0.25; // ~120°–160° (down-left)
    }

    return {
        startX,
        startY,
        angle,
        length: 60 + Math.random() * 100,
        speed: 300 + Math.random() * 400,
        startTime: elapsed,
        duration: 1.0 + Math.random() * 0.8,
        brightness: 0.5 + Math.random() * 0.5,
    };
}

export function TubesBackground() {
    const canvasRef = useRef<HTMLCanvasElement>(null);
    const animRef = useRef<number>(0);
    const startRef = useRef(performance.now() / 1000);
    const shootingStarRef = useRef<ShootingStar | null>(null);
    const nextSpawnRef = useRef(3 + Math.random() * 4); // first spawn after 3-7 seconds

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
        const screenW = W / dpr;
        const screenH = H / dpr;

        ctx.clearRect(0, 0, W, H);

        // ── Starfield — Rolls Royce Starlight ceiling ──
        for (const star of STARS) {
            const phase = ((elapsed / star.speed) + star.offset) % 1;
            const alpha = star.brightness * Math.sin(phase * Math.PI);
            if (alpha < 0.02) continue;

            const sx = star.x * screenW;
            const sy = star.y * screenH;

            // Soft glow for larger stars
            if (star.size > 0.9 && alpha > 0.3) {
                const glow = ctx.createRadialGradient(sx, sy, 0, sx, sy, star.size * 4);
                glow.addColorStop(0, `rgba(220, 235, 255, ${alpha * 0.15})`);
                glow.addColorStop(1, 'rgba(220, 235, 255, 0)');
                ctx.beginPath();
                ctx.arc(sx, sy, star.size * 4, 0, Math.PI * 2);
                ctx.fillStyle = glow;
                ctx.fill();
            }

            // Star dot
            ctx.beginPath();
            ctx.arc(sx, sy, star.size, 0, Math.PI * 2);
            ctx.fillStyle = `rgba(230, 240, 255, ${alpha})`;
            ctx.fill();
        }

        // ── Shooting star ──
        // Spawn a new one if it's time
        if (elapsed >= nextSpawnRef.current && !shootingStarRef.current) {
            shootingStarRef.current = spawnShootingStar(elapsed, screenW, screenH);
            nextSpawnRef.current = elapsed + 5 + Math.random() * 6; // next one in 5-11 seconds
        }

        const ss = shootingStarRef.current;
        if (ss) {
            const age = elapsed - ss.startTime;
            const progress = age / ss.duration;

            if (progress > 1) {
                // Shooting star done
                shootingStarRef.current = null;
            } else {
                // Current head position
                const dist = age * ss.speed;
                const headX = ss.startX + Math.cos(ss.angle) * dist;
                const headY = ss.startY + Math.sin(ss.angle) * dist;

                // Trail tail position
                const tailDist = Math.max(0, dist - ss.length);
                const tailX = ss.startX + Math.cos(ss.angle) * tailDist;
                const tailY = ss.startY + Math.sin(ss.angle) * tailDist;

                // Fade in at start, fade out at end
                const fadeIn = Math.min(1, progress * 4);
                const fadeOut = Math.min(1, (1 - progress) * 3);
                const alpha = ss.brightness * fadeIn * fadeOut;

                // Draw trail as a gradient line
                const trail = ctx.createLinearGradient(tailX, tailY, headX, headY);
                trail.addColorStop(0, `rgba(230, 240, 255, 0)`);
                trail.addColorStop(0.7, `rgba(230, 240, 255, ${alpha * 0.4})`);
                trail.addColorStop(1, `rgba(255, 255, 255, ${alpha})`);

                ctx.beginPath();
                ctx.moveTo(tailX, tailY);
                ctx.lineTo(headX, headY);
                ctx.strokeStyle = trail;
                ctx.lineWidth = 1.5;
                ctx.lineCap = 'round';
                ctx.stroke();

                // Bright head glow
                const glow = ctx.createRadialGradient(headX, headY, 0, headX, headY, 6);
                glow.addColorStop(0, `rgba(255, 255, 255, ${alpha * 0.8})`);
                glow.addColorStop(1, 'rgba(230, 240, 255, 0)');
                ctx.beginPath();
                ctx.arc(headX, headY, 6, 0, Math.PI * 2);
                ctx.fillStyle = glow;
                ctx.fill();
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
        <div
            style={{
                position: 'fixed',
                inset: 0,
                zIndex: 0,
                pointerEvents: 'none',
                overflow: 'hidden',
            }}
        >
            <canvas ref={canvasRef} />
        </div>
    );
}
