import { useRef, useEffect, useState, useCallback } from 'react';
import { useContractQuery, bufferToNumber } from '../hooks/useContractQuery';
import { CONTRACTS, NETWORK } from '../config';
import { devWarn } from '../utils/devLog';

// ── Types ──

interface MetricData {
    label: string;
    value: number;     // 0-100 score
    rawValue: string;  // Display value
    color: string;
}

// ── Canvas Radar Chart ──

function drawRadar(
    canvas: HTMLCanvasElement,
    metrics: MetricData[],
    animProgress: number // 0 to 1
) {
    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    const dpr = window.devicePixelRatio || 1;
    const displayW = canvas.clientWidth;
    const displayH = canvas.clientHeight;
    canvas.width = displayW * dpr;
    canvas.height = displayH * dpr;
    ctx.scale(dpr, dpr);

    const cx = displayW / 2;
    const cy = displayH / 2;
    const radius = Math.min(cx, cy) - 42;
    const n = metrics.length;
    const angleStep = (Math.PI * 2) / n;
    const startAngle = -Math.PI / 2; // Start from top

    ctx.clearRect(0, 0, displayW, displayH);

    // ── Grid rings ──
    const rings = [0.2, 0.4, 0.6, 0.8, 1.0];
    for (const ring of rings) {
        ctx.beginPath();
        for (let i = 0; i <= n; i++) {
            const angle = startAngle + i * angleStep;
            const x = cx + Math.cos(angle) * radius * ring;
            const y = cy + Math.sin(angle) * radius * ring;
            if (i === 0) ctx.moveTo(x, y);
            else ctx.lineTo(x, y);
        }
        ctx.closePath();
        ctx.strokeStyle = `rgba(255,255,255,${ring === 1 ? 0.18 : 0.10})`;
        ctx.lineWidth = 1;
        ctx.stroke();
    }

    // ── Axis lines ──
    for (let i = 0; i < n; i++) {
        const angle = startAngle + i * angleStep;
        ctx.beginPath();
        ctx.moveTo(cx, cy);
        ctx.lineTo(cx + Math.cos(angle) * radius, cy + Math.sin(angle) * radius);
        ctx.strokeStyle = 'rgba(255,255,255,0.12)';
        ctx.lineWidth = 1;
        ctx.stroke();
    }

    // ── Data polygon (filled + stroke) ──
    const dataPoints: { x: number; y: number }[] = [];
    ctx.beginPath();
    for (let i = 0; i < n; i++) {
        const angle = startAngle + i * angleStep;
        const rawVal = (metrics[i].value / 100) * animProgress;
        const val = Math.max(0.3, rawVal); // floor at 30% so points spread out
        const x = cx + Math.cos(angle) * radius * val;
        const y = cy + Math.sin(angle) * radius * val;
        dataPoints.push({ x, y });
        if (i === 0) ctx.moveTo(x, y);
        else ctx.lineTo(x, y);
    }
    ctx.closePath();

    // Gradient fill
    const gradient = ctx.createRadialGradient(cx, cy, 0, cx, cy, radius);
    gradient.addColorStop(0, 'rgba(232,146,124,0.40)');
    gradient.addColorStop(1, 'rgba(232,146,124,0.12)');
    ctx.fillStyle = gradient;
    ctx.fill();

    // Stroke
    ctx.strokeStyle = 'rgba(232,146,124,0.8)';
    ctx.lineWidth = 2;
    ctx.stroke();

    // ── Data points (dots) ──
    for (let i = 0; i < n; i++) {
        const { x, y } = dataPoints[i];
        ctx.beginPath();
        ctx.arc(x, y, 4, 0, Math.PI * 2);
        ctx.fillStyle = metrics[i].color;
        ctx.fill();
        ctx.strokeStyle = 'rgba(0,0,0,0.3)';
        ctx.lineWidth = 1;
        ctx.stroke();
    }

    // ── Labels + values ──
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    for (let i = 0; i < n; i++) {
        const angle = startAngle + i * angleStep;
        const labelDist = radius + 28;
        const lx = cx + Math.cos(angle) * labelDist;
        const ly = cy + Math.sin(angle) * labelDist;

        ctx.font = '600 10px Inter, system-ui, sans-serif';
        ctx.fillStyle = 'rgba(255,255,255,0.7)';
        ctx.fillText(metrics[i].label, lx, ly - 9);

        // Score value
        const displayVal = Math.round(metrics[i].value * animProgress);
        ctx.font = '700 13px Inter, system-ui, sans-serif';
        ctx.fillStyle = metrics[i].color;

        // Format with decimal-like appearance
        const mainVal = Math.floor(displayVal);
        const decVal = Math.floor((metrics[i].value * animProgress * 100) % 100);
        ctx.fillText(`${mainVal}`, lx - 8, ly + 10);

        ctx.font = '600 9px Inter, system-ui, sans-serif';
        ctx.fillStyle = `${metrics[i].color}99`;
        ctx.fillText(`.${decVal.toString().padStart(2, '0')}`, lx + 14, ly + 10);
    }
}

// ── Component ──

export function ProtocolRadar() {
    const canvasRef = useRef<HTMLCanvasElement>(null);
    const { query } = useContractQuery();
    const [metrics, setMetrics] = useState<MetricData[]>([
        { label: 'Execution', value: 0, rawValue: '0', color: 'rgb(59,130,246)' },
        { label: 'Success', value: 0, rawValue: '0%', color: 'rgb(34,197,94)' },
        { label: 'Keeper Health', value: 0, rawValue: '0', color: 'rgb(232,146,124)' },
        { label: 'Gas Efficiency', value: 0, rawValue: '0%', color: 'rgb(168,85,247)' },
        { label: 'Revenue', value: 0, rawValue: '0', color: 'rgb(251,191,36)' },
        { label: 'Activity', value: 0, rawValue: '0/24h', color: 'rgb(6,182,212)' },
    ]);
    const [animProgress, setAnimProgress] = useState(0);
    const animRef = useRef<number>(0);

    const fetchMetrics = useCallback(async () => {
        try {
            const [nonceRes, keeperRes, metricsRes] = await Promise.all([
                query(CONTRACTS.scheduler, 'getTaskNonce'),
                query(CONTRACTS.keeperRegistry, 'getActiveKeeperCount'),
                query(CONTRACTS.scheduler, 'getSecurityMetrics'),
            ]);

            const totalTasks = nonceRes.length > 0 ? bufferToNumber(nonceRes[0]) : 0;
            const activeKeepers = keeperRes.length > 0 ? bufferToNumber(keeperRes[0]) : 0;
            // getSecurityMetrics returns MultiValue3<u64, u64, usize> = (totalExecuted, totalFailed, pendingCount)
            const totalSuccessful = metricsRes.length > 0 ? bufferToNumber(metricsRes[0]) : 0;
            const totalFailed = metricsRes.length > 1 ? bufferToNumber(metricsRes[1]) : 0;
            const totalExecs = totalSuccessful + totalFailed;

            // Fetch 24h activity
            let daily = 0;
            try {
                const oneDayAgo = Math.floor(Date.now() / 1000) - 86400;
                const res = await fetch(
                    `${NETWORK.apiUrl}/accounts/${CONTRACTS.scheduler}/transactions/count?after=${oneDayAgo}&status=success`
                );
                daily = Number(await res.text()) || 0;
            } catch { /* ignore */ }

            // Calculate scores (0-100)

            // 1. Execution Volume: log scale, 100 tasks = 50 score, 1000 = 85, 10000 = 100
            const execScore = totalExecs === 0 ? 5 : Math.min(100, Math.round(Math.log10(totalExecs + 1) * 25));

            // 2. Success Rate
            const successRate = totalExecs > 0 ? (totalSuccessful / totalExecs) * 100 : 0;
            const successScore = totalExecs === 0 ? 5 : Math.round(successRate);

            // 3. Keeper Health: 1 keeper = 20, 3 = 50, 5 = 70, 10+ = 100
            const keeperScore = activeKeepers === 0 ? 5 : Math.min(100, Math.round(activeKeepers * 15 + 5));

            // 4. Gas Efficiency: based on success rate (successful = gas well spent)
            const gasScore = totalExecs === 0 ? 5 : Math.min(100, Math.round(successRate * 0.9 + 10));

            // 5. Revenue: based on total tasks (more tasks = more revenue potential)
            const revenueScore = totalTasks === 0 ? 5 : Math.min(100, Math.round(Math.log10(totalTasks + 1) * 30));

            // 6. 24h Activity: 0 = 5, 1-5 = 30, 5-20 = 60, 20-100 = 80, 100+ = 100
            const activityScore = daily === 0 ? 5 : Math.min(100, Math.round(Math.log10(daily + 1) * 40 + 10));

            setMetrics([
                { label: 'Execution', value: execScore, rawValue: `${totalExecs}`, color: 'rgb(59,130,246)' },
                { label: 'Success', value: successScore, rawValue: `${successRate.toFixed(0)}%`, color: 'rgb(34,197,94)' },
                { label: 'Keeper Health', value: keeperScore, rawValue: `${activeKeepers}`, color: 'rgb(232,146,124)' },
                { label: 'Gas Efficiency', value: gasScore, rawValue: `${gasScore}%`, color: 'rgb(168,85,247)' },
                { label: 'Revenue', value: revenueScore, rawValue: `${totalTasks}`, color: 'rgb(251,191,36)' },
                { label: 'Activity', value: activityScore, rawValue: `${daily}/24h`, color: 'rgb(6,182,212)' },
            ]);
        } catch (err) {
            devWarn('Radar metrics fetch failed:', err);
        }
    }, [query]);

    // Fetch on mount + every 3 seconds
    useEffect(() => {
        fetchMetrics();
        const interval = setInterval(fetchMetrics, 30000);
        return () => clearInterval(interval);
    }, [fetchMetrics]);

    // Animate on mount
    useEffect(() => {
        const startTime = Date.now();
        const duration = 1200;
        const animate = () => {
            const elapsed = Date.now() - startTime;
            const progress = Math.min(1, elapsed / duration);
            // Ease out cubic
            const eased = 1 - Math.pow(1 - progress, 3);
            setAnimProgress(eased);
            if (progress < 1) {
                animRef.current = requestAnimationFrame(animate);
            }
        };
        animRef.current = requestAnimationFrame(animate);
        return () => cancelAnimationFrame(animRef.current);
    }, []);

    // Redraw on metrics or animation change
    useEffect(() => {
        if (canvasRef.current) {
            drawRadar(canvasRef.current, metrics, animProgress);
        }
    }, [metrics, animProgress]);

    // Overall protocol score
    const overallScore = metrics.reduce((acc, m) => acc + m.value, 0) / metrics.length;

    return (
        <div className="card" style={{
            padding: 16,
            background: 'rgba(232,146,124,0.04)',
            borderColor: 'rgba(232,146,124,0.15)',
            position: 'relative',
            overflow: 'hidden',
        }}>
            {/* Subtle glow */}
            <div style={{
                position: 'absolute', top: '50%', left: '50%',
                transform: 'translate(-50%, -50%)',
                width: 140, height: 140, borderRadius: '50%',
                background: 'rgba(232,146,124,0.06)',
                filter: 'blur(50px)', pointerEvents: 'none',
            }} />

            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 8 }}>
                <div>
                    <div className="section-title" style={{ marginBottom: 2, fontSize: '0.9rem' }}>
                        Protocol Performance
                    </div>
                    <div style={{ fontSize: '0.65rem', color: 'var(--text-muted)', display: 'flex', alignItems: 'center', gap: 5 }}>
                        <div style={{ width: 5, height: 5, borderRadius: '50%', background: 'var(--success)', boxShadow: '0 0 6px var(--success)', animation: 'pulseGlow 2s ease-in-out infinite' }} />
                        Real-time
                    </div>
                </div>
                <div style={{ textAlign: 'right' }}>
                    <div style={{ fontSize: '0.6rem', color: 'var(--text-muted)', textTransform: 'uppercase', letterSpacing: '0.5px' }}>
                        Score
                    </div>
                    <div style={{ fontSize: '1.4rem', fontWeight: 800, color: 'rgba(232,146,124,0.7)' }}>
                        {(overallScore * animProgress).toFixed(1)}
                    </div>
                </div>
            </div>

            <canvas
                ref={canvasRef}
                style={{ width: '100%', height: 200, display: 'block' }}
            />

            {/* Metric pills — 3-column grid */}
            <div style={{
                display: 'grid', gridTemplateColumns: 'repeat(3, auto)',
                gap: '3px 6px', marginTop: 6, justifyContent: 'center',
            }}>
                {metrics.map((m) => (
                    <div key={m.label} style={{
                        display: 'flex', alignItems: 'center', gap: 3,
                        padding: '2px 6px', borderRadius: 8,
                        background: 'var(--bg-glass)',
                        border: '1px solid var(--border-primary)',
                        fontSize: '0.58rem', whiteSpace: 'nowrap',
                    }}>
                        <div style={{ width: 4, height: 4, borderRadius: '50%', background: m.color, flexShrink: 0 }} />
                        <span style={{ color: 'var(--text-muted)' }}>{m.label}</span>
                        <span style={{ color: m.color, fontWeight: 700 }}>{m.rawValue}</span>
                    </div>
                ))}
            </div>
        </div>
    );
}
