import { useEffect, useRef, useState, useCallback } from 'react';
import type { CSSProperties, ElementType } from 'react';

interface TypewriterTitleProps {
    text: string;
    as?: ElementType;       // render as h1, p, div, span, etc.
    className?: string;
    speed?: number;
    style?: CSSProperties;
    repeatInterval?: number; // ms between repeats (default 30000 = 30s)
}

export function TypewriterTitle({ text, as: Tag = 'div', className = '', speed = 65, style, repeatInterval = 30000 }: TypewriterTitleProps) {
    const ref = useRef<HTMLElement>(null);
    const [displayed, setDisplayed] = useState('');
    const [started, setStarted] = useState(false);
    const [done, setDone] = useState(false);
    const [visible, setVisible] = useState(false);

    // Track visibility
    useEffect(() => {
        const el = ref.current;
        if (!el) return;
        const observer = new IntersectionObserver(
            ([entry]) => { setVisible(entry.isIntersecting); },
            { threshold: 0.3 }
        );
        observer.observe(el);
        return () => observer.disconnect();
    }, []);

    // Start on first visibility
    useEffect(() => {
        if (visible && !started) setStarted(true);
    }, [visible, started]);

    // Type characters one by one
    const runTyping = useCallback(() => {
        setDisplayed('');
        setDone(false);
        let i = 0;
        const interval = setInterval(() => {
            i++;
            setDisplayed(text.slice(0, i));
            if (i >= text.length) { clearInterval(interval); setDone(true); }
        }, speed);
        return () => clearInterval(interval);
    }, [text, speed]);

    // Initial typing
    useEffect(() => {
        if (!started) return;
        return runTyping();
    }, [started, runTyping]);

    // Repeat every N seconds while visible
    useEffect(() => {
        if (!done || !visible) return;
        const timer = setTimeout(() => {
            runTyping();
        }, repeatInterval);
        return () => clearTimeout(timer);
    }, [done, visible, repeatInterval, runTyping]);

    return (
        <Tag ref={ref} className={className} style={{ display: 'grid', ...style }}>
            {/* Invisible full text to reserve exact space */}
            <span style={{ visibility: 'hidden', gridArea: '1/1' }}>{text}</span>
            {/* Visible typewriter text — same grid cell, overlaps exactly */}
            <span style={{ gridArea: '1/1' }}>
                {displayed}
                {started && !done && <span className="typewriter-cursor">|</span>}
            </span>
        </Tag>
    );
}
