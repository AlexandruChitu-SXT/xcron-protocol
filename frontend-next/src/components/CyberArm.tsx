import { useRef, useEffect, useCallback } from 'react';

/**
 * CyberArm — Canvas 2D robotic arm with real articulated joints.
 * Uses requestAnimationFrame for buttery smooth animation.
 * Emerges from right wall, taps holographic buttons, retreats.
 * Then repeats from the left wall. 40s total cycle.
 */

// ─── Easing ───
function ease(t: number): number {
    return t < 0.5 ? 2 * t * t : -1 + (4 - 2 * t) * t;
}

function lerp(a: number, b: number, t: number): number {
    return a + (b - a) * Math.max(0, Math.min(1, t));
}

// Maps a time within [start, end] to [0, 1] with easing
function phase(time: number, start: number, end: number): number {
    if (time <= start) return 0;
    if (time >= end) return 1;
    return ease((time - start) / (end - start));
}

// ─── Drawing helpers ───
function drawSegment(
    ctx: CanvasRenderingContext2D,
    x: number, y: number,
    angle: number,
    length: number,
    width: number,
    isJoint: boolean = false
): [number, number] {
    ctx.save();
    ctx.translate(x, y);
    ctx.rotate(angle);

    if (isJoint) {
        // Draw glowing joint circle
        const r = width * 0.7;
        ctx.beginPath();
        ctx.arc(0, 0, r, 0, Math.PI * 2);
        ctx.fillStyle = '#1a202c';
        ctx.fill();
        ctx.strokeStyle = '#4a5568';
        ctx.lineWidth = 1.5;
        ctx.stroke();

        // Neon ring
        ctx.beginPath();
        ctx.arc(0, 0, r * 0.5, 0, Math.PI * 2);
        ctx.strokeStyle = '#00ffcc';
        ctx.lineWidth = 2;
        ctx.shadowColor = '#00ffcc';
        ctx.shadowBlur = 8;
        ctx.stroke();
        ctx.shadowBlur = 0;

        // Center dot
        ctx.beginPath();
        ctx.arc(0, 0, 3, 0, Math.PI * 2);
        ctx.fillStyle = '#00ffcc';
        ctx.fill();
    }

    // Draw arm segment (rounded rect-like shape)
    const hw = width / 2;
    ctx.beginPath();
    ctx.moveTo(0, -hw);
    ctx.lineTo(length, -hw * 0.85);
    ctx.quadraticCurveTo(length + 3, 0, length, hw * 0.85);
    ctx.lineTo(0, hw);
    ctx.quadraticCurveTo(-3, 0, 0, -hw);
    ctx.closePath();

    // Metallic gradient
    const grad = ctx.createLinearGradient(0, -hw, 0, hw);
    grad.addColorStop(0, '#ffffff');
    grad.addColorStop(0.3, '#d4dae2');
    grad.addColorStop(0.6, '#9aa5b4');
    grad.addColorStop(1, '#4a5568');
    ctx.fillStyle = grad;
    ctx.fill();
    ctx.strokeStyle = '#718096';
    ctx.lineWidth = 0.8;
    ctx.stroke();

    // Panel line (top highlight)
    ctx.beginPath();
    ctx.moveTo(4, -hw + 2);
    ctx.lineTo(length - 4, -hw * 0.85 + 2);
    ctx.strokeStyle = 'rgba(255,255,255,0.25)';
    ctx.lineWidth = 2;
    ctx.stroke();

    // Panel line (center groove)
    ctx.beginPath();
    ctx.moveTo(8, -hw * 0.3);
    ctx.lineTo(length - 8, -hw * 0.25);
    ctx.strokeStyle = '#3d4f63';
    ctx.lineWidth = 1.5;
    ctx.stroke();
    ctx.beginPath();
    ctx.moveTo(8, hw * 0.3);
    ctx.lineTo(length - 8, hw * 0.25);
    ctx.stroke();

    // Calculate end point in world space
    const endX = Math.cos(angle) * length + x;
    const endY = Math.sin(angle) * length + y;

    ctx.restore();
    return [endX, endY];
}

function drawFinger(
    ctx: CanvasRenderingContext2D,
    x: number, y: number,
    baseAngle: number,
    curl: number,     // 0 = extended, 1 = fully curled
    length1: number,
    length2: number,
    length3: number,
    width: number
) {
    ctx.save();
    ctx.translate(x, y);

    const a1 = baseAngle + curl * 0.8;
    const a2 = curl * 1.0;
    const a3 = curl * 0.6;

    // Segment 1 (proximal)
    ctx.save();
    ctx.rotate(a1);
    drawFingerSeg(ctx, 0, 0, length1, width);

    // Joint 1
    drawKnuckle(ctx, length1, 0, width * 0.45);

    // Segment 2 (medial)
    ctx.translate(length1, 0);
    ctx.rotate(a2);
    drawFingerSeg(ctx, 0, 0, length2, width * 0.9);

    // Joint 2
    drawKnuckle(ctx, length2, 0, width * 0.35);

    // Segment 3 (distal / fingertip)
    ctx.translate(length2, 0);
    ctx.rotate(a3);
    drawFingerSeg(ctx, 0, 0, length3, width * 0.8);

    ctx.restore();
    ctx.restore();
}

function drawFingerSeg(
    ctx: CanvasRenderingContext2D,
    x: number, y: number,
    len: number, w: number
) {
    const hw = w / 2;
    ctx.beginPath();
    ctx.moveTo(x, y - hw);
    ctx.lineTo(x + len, y - hw * 0.8);
    ctx.quadraticCurveTo(x + len + 1.5, y, x + len, y + hw * 0.8);
    ctx.lineTo(x, y + hw);
    ctx.closePath();

    const grad = ctx.createLinearGradient(x, y - hw, x, y + hw);
    grad.addColorStop(0, '#f0f4f8');
    grad.addColorStop(0.4, '#c4cdd8');
    grad.addColorStop(1, '#5a6577');
    ctx.fillStyle = grad;
    ctx.fill();
    ctx.strokeStyle = '#8899aa';
    ctx.lineWidth = 0.5;
    ctx.stroke();
}

function drawKnuckle(ctx: CanvasRenderingContext2D, x: number, y: number, r: number) {
    ctx.beginPath();
    ctx.arc(x, y, r, 0, Math.PI * 2);
    ctx.fillStyle = '#1a202c';
    ctx.fill();
    ctx.strokeStyle = '#4a5568';
    ctx.lineWidth = 0.6;
    ctx.stroke();
}

function drawPortal(ctx: CanvasRenderingContext2D, x: number, y: number, opacity: number) {
    if (opacity <= 0) return;
    ctx.save();
    ctx.globalAlpha = opacity;

    // Outer glow
    ctx.beginPath();
    ctx.ellipse(x, y, 8, 90, 0, 0, Math.PI * 2);
    ctx.strokeStyle = '#00ffcc';
    ctx.lineWidth = 4;
    ctx.shadowColor = '#00ffcc';
    ctx.shadowBlur = 20;
    ctx.stroke();
    ctx.shadowBlur = 0;

    // Inner bright ring
    ctx.beginPath();
    ctx.ellipse(x, y, 4, 86, 0, 0, Math.PI * 2);
    ctx.strokeStyle = '#ffffff';
    ctx.lineWidth = 1;
    ctx.stroke();

    ctx.restore();
}

function drawHoloScreen(
    ctx: CanvasRenderingContext2D,
    x: number, y: number,
    opacity: number,
    btn1Active: boolean,
    btn2Active: boolean,
    progress: number
) {
    if (opacity <= 0) return;
    ctx.save();
    ctx.globalAlpha = opacity;

    const w = 110, h = 75;

    // Screen background
    ctx.fillStyle = 'rgba(0, 255, 204, 0.04)';
    ctx.strokeStyle = `rgba(0, 255, 204, 0.5)`;
    ctx.lineWidth = 1;
    ctx.beginPath();
    ctx.roundRect(x, y, w, h, 5);
    ctx.fill();
    ctx.stroke();

    // Grid lines
    ctx.strokeStyle = 'rgba(0, 255, 204, 0.2)';
    ctx.lineWidth = 0.5;
    ctx.beginPath();
    ctx.moveTo(x, y + 18); ctx.lineTo(x + w, y + 18);
    ctx.moveTo(x, y + 42); ctx.lineTo(x + w, y + 42);
    ctx.stroke();

    // Header text
    ctx.fillStyle = '#00ffcc';
    ctx.font = '8px monospace';
    ctx.globalAlpha = opacity * 0.7;
    ctx.fillText('XCRON.EXEC', x + 10, y + 13);
    ctx.globalAlpha = opacity;

    // Button 1
    ctx.fillStyle = btn1Active ? 'rgba(0, 255, 204, 0.5)' : 'rgba(0, 255, 204, 0.12)';
    ctx.strokeStyle = btn1Active ? '#ffffff' : '#00ffcc';
    ctx.lineWidth = 1;
    ctx.beginPath();
    ctx.roundRect(x + 10, y + 25, 35, 13, 3);
    ctx.fill(); ctx.stroke();
    ctx.fillStyle = '#00ffcc';
    ctx.font = '7px monospace';
    ctx.fillText('RUN', x + 17, y + 34);

    // Button 2
    ctx.fillStyle = btn2Active ? 'rgba(0, 255, 204, 0.5)' : 'rgba(0, 255, 204, 0.12)';
    ctx.strokeStyle = btn2Active ? '#ffffff' : '#00ffcc';
    ctx.beginPath();
    ctx.roundRect(x + 58, y + 25, 42, 13, 3);
    ctx.fill(); ctx.stroke();
    ctx.fillStyle = '#00ffcc';
    ctx.fillText('CONFIRM', x + 62, y + 34);

    // Progress bar
    ctx.fillStyle = 'rgba(0, 255, 204, 0.08)';
    ctx.beginPath();
    ctx.roundRect(x + 10, y + 52, 90, 5, 2);
    ctx.fill();
    if (progress > 0) {
        ctx.fillStyle = '#00ffcc';
        ctx.beginPath();
        ctx.roundRect(x + 10, y + 52, 90 * progress, 5, 2);
        ctx.fill();
    }

    ctx.restore();
}

// ─── Palm shape ───
function drawPalm(ctx: CanvasRenderingContext2D, w: number, h: number) {
    const hw = h / 2;
    ctx.beginPath();
    ctx.moveTo(0, -hw);
    ctx.lineTo(-w, -hw * 1.1);
    ctx.quadraticCurveTo(-w - 4, -hw * 0.5, -w - 2, 0);
    ctx.quadraticCurveTo(-w - 4, hw * 0.5, -w, hw * 1.1);
    ctx.lineTo(0, hw);
    ctx.quadraticCurveTo(4, 0, 0, -hw);
    ctx.closePath();

    const grad = ctx.createLinearGradient(0, -hw, 0, hw);
    grad.addColorStop(0, '#f0f4f8');
    grad.addColorStop(0.3, '#d0d8e2');
    grad.addColorStop(0.7, '#9aabbb');
    grad.addColorStop(1, '#4a5f70');
    ctx.fillStyle = grad;
    ctx.fill();
    ctx.strokeStyle = '#718096';
    ctx.lineWidth = 0.8;
    ctx.stroke();

    // Palm glow
    ctx.beginPath();
    ctx.arc(-w * 0.5, 0, 5, 0, Math.PI * 2);
    ctx.fillStyle = 'rgba(0, 255, 204, 0.15)';
    ctx.shadowColor = '#00ffcc';
    ctx.shadowBlur = 8;
    ctx.fill();
    ctx.shadowBlur = 0;
}


export function CyberArm() {
    const canvasRef = useRef<HTMLCanvasElement>(null);
    const animRef = useRef<number>(0);

    const render = useCallback(() => {
        const canvas = canvasRef.current;
        if (!canvas) return;
        const ctx = canvas.getContext('2d');
        if (!ctx) return;

        const W = canvas.width;
        const H = canvas.height;
        ctx.clearRect(0, 0, W, H);

        // Time in seconds, cycling 0–40
        const now = (performance.now() / 1000) % 40;

        // Determine which side is active
        const rightActive = now < 20;
        const t = rightActive ? now : now - 20; // local time 0–20

        // ─── Animation timeline (local time 0–20) ───
        const slideIn = phase(t, 1, 4);         // emerge
        const slideOut = phase(t, 15, 18);       // retreat
        const slide = slideIn - slideOut;

        const fingerOpen = phase(t, 2.5, 5);    // fingers uncurl
        const fingerClose = phase(t, 15, 17);   // fingers curl back

        const tap1Start = phase(t, 7, 7.3);
        const tap1End = phase(t, 7.3, 7.8);
        const tap2Start = phase(t, 10, 10.3);
        const tap2End = phase(t, 10.3, 10.8);

        const portalOpacity = Math.min(phase(t, 0.5, 2), 1 - phase(t, 16, 19));
        const screenOpacity = Math.min(phase(t, 3, 5), 1 - phase(t, 15, 17));

        // Derived values
        const armExtend = slide;
        const baseCurl = 1 - fingerOpen + fingerClose;
        const idxTap = (tap1Start - tap1End) * 0.5 + (tap2Start - tap2End) * 0.5;

        const btn1Active = t > 7.3 && t < 15;
        const btn2Active = t > 10.3 && t < 15;
        const progress = t > 10.3 && t < 15 ? Math.min((t - 10.3) / 4, 1) : 0;

        // ─── Shoulder / elbow angles ───
        const shoulderAngle = lerp(0.08, -0.06, armExtend)
            + (tap1Start - tap1End) * 0.04
            + (tap2Start - tap2End) * 0.04;
        const elbowAngle = lerp(0.5, -0.08, armExtend)
            + (tap1Start - tap1End) * 0.06
            + (tap2Start - tap2End) * 0.06;
        const wristAngle = lerp(-0.15, 0.03, armExtend)
            + (tap1Start - tap1End) * 0.05
            + (tap2Start - tap2End) * 0.05;

        // ─── Position calculations ───
        const flip = rightActive ? 1 : -1;
        const wallX = rightActive ? W - 10 : 10;
        const centerY = H / 2;

        const shoulderX = wallX - flip * (armExtend * 60 - 80);
        const shoulderY = centerY;

        ctx.save();

        // Portal
        drawPortal(ctx, wallX, centerY, portalOpacity);

        // Clip to wall side
        ctx.save();
        ctx.beginPath();
        if (rightActive) {
            ctx.rect(0, 0, W - 10, H);
        } else {
            ctx.rect(10, 0, W, H);
        }
        ctx.clip();

        // ─── DRAW ARM ───
        if (armExtend > 0.01) {
            // Shoulder joint + upper arm
            const segDir = rightActive ? Math.PI + shoulderAngle : -shoulderAngle;
            const upperLen = 100;
            const [ex, ey] = drawSegment(ctx, shoulderX, shoulderY, segDir, upperLen, 28, true);

            // Elbow joint + forearm
            const elbDir = segDir + (rightActive ? -elbowAngle : elbowAngle);
            const foreLen = 80;
            const [fx, fy] = drawSegment(ctx, ex, ey, elbDir, foreLen, 22, true);

            // Wrist joint
            const wristDir = elbDir + (rightActive ? -wristAngle : wristAngle);
            drawKnuckle(ctx, fx, fy, 9);
            ctx.beginPath();
            ctx.arc(fx, fy, 4, 0, Math.PI * 2);
            ctx.strokeStyle = '#00ffcc';
            ctx.lineWidth = 1.5;
            ctx.shadowColor = '#00ffcc';
            ctx.shadowBlur = 6;
            ctx.stroke();
            ctx.shadowBlur = 0;

            // ─── HAND (palm + 5 fingers) ───
            ctx.save();
            ctx.translate(fx, fy);
            ctx.rotate(wristDir);
            if (!rightActive) ctx.scale(-1, 1); // mirror for left

            const palmW = 30;
            const palmH = 36;
            drawPalm(ctx, palmW, palmH);

            // Finger parameters: [yOffset, baseAngle, len1, len2, len3, width, curlMult]
            const fingers: [number, number, number, number, number, number, number][] = [
                [-palmH * 0.45, -0.15, 18, 14, 10, 5.5, 1.0],   // INDEX
                [-palmH * 0.15, -0.05, 20, 16, 11, 5.5, 1.1],   // MIDDLE (longest)
                [palmH * 0.12, 0.05, 17, 13, 10, 5.0, 1.15],    // RING
                [palmH * 0.38, 0.15, 14, 10, 8, 4.2, 1.2],     // PINKY
            ];

            fingers.forEach(([yOff, bAngle, l1, l2, l3, fw, curlMul], i) => {
                let curl = baseCurl * curlMul;
                // Index and middle tap
                if (i === 0) curl = Math.max(0, curl + idxTap * 0.6);
                if (i === 1) curl = Math.max(0, curl + idxTap * 0.4);
                drawFinger(ctx, -palmW, yOff, Math.PI + bAngle, curl, l1, l2, l3, fw);
            });

            // THUMB (opposing, goes downward)
            const thumbCurl = baseCurl * 0.7 - (1 - baseCurl) * 0.1;
            ctx.save();
            ctx.translate(-palmW * 0.6, palmH * 0.5);
            ctx.rotate(Math.PI * 0.65);
            drawFingerSeg(ctx, 0, 0, 16, 6);
            drawKnuckle(ctx, 16, 0, 3);
            ctx.translate(16, 0);
            ctx.rotate(thumbCurl * 0.8);
            drawFingerSeg(ctx, 0, 0, 13, 5.5);
            drawKnuckle(ctx, 13, 0, 2.5);
            ctx.translate(13, 0);
            ctx.rotate(thumbCurl * 0.5);
            drawFingerSeg(ctx, 0, 0, 10, 5);
            ctx.restore();

            ctx.restore();
        }

        ctx.restore(); // remove clip

        // Holo screen
        if (screenOpacity > 0) {
            const screenX = rightActive ? 30 : W - 150;
            drawHoloScreen(ctx, screenX, centerY - 40, screenOpacity,
                btn1Active, btn2Active, progress);
        }

        ctx.restore();

        animRef.current = requestAnimationFrame(render);
    }, []);

    useEffect(() => {
        const canvas = canvasRef.current;
        if (!canvas) return;

        const resize = () => {
            const parent = canvas.parentElement;
            if (!parent) return;
            const dpr = window.devicePixelRatio || 1;
            const rect = parent.getBoundingClientRect();
            canvas.width = rect.width * dpr;
            canvas.height = rect.height * dpr;
            canvas.style.width = `${rect.width}px`;
            canvas.style.height = `${rect.height}px`;
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
        <div style={{
            position: 'absolute',
            inset: 0,
            pointerEvents: 'none',
            zIndex: 0,
            opacity: 0.75,
        }}>
            <canvas ref={canvasRef} style={{ width: '100%', height: '100%' }} />
        </div>
    );
}
