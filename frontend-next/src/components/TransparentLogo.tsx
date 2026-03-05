"use client";

import { useEffect, useRef } from 'react';

interface TransparentLogoProps {
    className?: string;
}

export function TransparentLogo({ className }: TransparentLogoProps) {
    const logoCanvasRef = useRef<HTMLCanvasElement>(null);

    // Process logo: remove black background
    useEffect(() => {
        const canvas = logoCanvasRef.current;
        if (!canvas) return;
        const img = new Image();
        img.crossOrigin = 'anonymous';
        img.src = '/logo.png';
        img.onload = () => {
            canvas.width = img.width;
            canvas.height = img.height;
            const ctx = canvas.getContext('2d', { willReadFrequently: true });
            if (!ctx) return;

            ctx.drawImage(img, 0, 0);
            const imageData = ctx.getImageData(0, 0, canvas.width, canvas.height);
            const data = imageData.data;

            for (let p = 0; p < data.length; p += 4) {
                const r = data[p], g = data[p + 1], b = data[p + 2];
                const brightness = r * 0.299 + g * 0.587 + b * 0.114;
                // Remove dark background and dim glow halo
                if (brightness < 80) {
                    data[p + 3] = 0; // completely transparent
                } else if (brightness < 120) {
                    // semi-transparent
                    data[p + 3] = Math.round(((brightness - 80) / 40) * 255);
                }
            }
            ctx.putImageData(imageData, 0, 0);
        };
    }, []);

    return <canvas ref={logoCanvasRef} className={className} />;
}
