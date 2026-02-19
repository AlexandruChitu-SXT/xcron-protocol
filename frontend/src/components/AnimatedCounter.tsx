import { useEffect, useState, useRef } from 'react';

interface Props {
    value: number;
    duration?: number;
    prefix?: string;
    suffix?: string;
    decimals?: number;
}

/**
 * Animated counter that smoothly counts from 0 to the target value.
 * Uses easeOutExpo for a satisfying deceleration effect.
 */
export function AnimatedCounter({ value, duration = 1200, prefix = '', suffix = '', decimals = 0 }: Props) {
    const [display, setDisplay] = useState(0);
    const prevValue = useRef(0);
    const frameRef = useRef<number>(0);

    useEffect(() => {
        const start = prevValue.current;
        const end = value;
        const startTime = performance.now();

        if (start === end) return;

        const animate = (now: number) => {
            const elapsed = now - startTime;
            const progress = Math.min(elapsed / duration, 1);
            // easeOutExpo
            const eased = progress === 1 ? 1 : 1 - Math.pow(2, -10 * progress);
            const current = start + (end - start) * eased;

            setDisplay(current);

            if (progress < 1) {
                frameRef.current = requestAnimationFrame(animate);
            } else {
                prevValue.current = end;
            }
        };

        frameRef.current = requestAnimationFrame(animate);

        return () => {
            if (frameRef.current) cancelAnimationFrame(frameRef.current);
        };
    }, [value, duration]);

    const formatted = decimals > 0
        ? display.toFixed(decimals)
        : Math.round(display).toString();

    return <>{prefix}{formatted}{suffix}</>;
}
