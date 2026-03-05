"use client";

import { useEffect, useRef } from 'react';

interface TransparentLogoProps {
    className?: string;
    src?: string;
}

export function TransparentLogo({ className, src = '/logo.png' }: TransparentLogoProps) {
    const logoCanvasRef = useRef<HTMLCanvasElement>(null);

    // Process logo: remove black background
    useEffect(() => {
        const canvas = logoCanvasRef.current;
        if (!canvas) return;
        const img = new Image();
        img.crossOrigin = 'anonymous';
        img.src = src;
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
                // Luma calculation
                const luma = (r * 0.299 + g * 0.587 + b * 0.114) / 255;

                // If the pixel is pure black (or very close), make it transparent
                if (luma < 0.02) {
                    data[p + 3] = 0;
                } else {
                    // Maximum channel value dictates the opacity needed to reproduce this color
                    // against a dark background
                    const maxColor = Math.max(r, g, b) / 255;
                    // We map the alpha directly to the max color intensity (with a slight boost for glow)
                    // and un-premultiply the RGB so that when it is drawn with this alpha, it matches original
                    const alpha = Math.min(1.0, maxColor * 1.5);

                    data[p] = Math.min(255, r / alpha);
                    data[p + 1] = Math.min(255, g / alpha);
                    data[p + 2] = Math.min(255, b / alpha);
                    data[p + 3] = Math.round(alpha * 255);
                }
            }
            ctx.putImageData(imageData, 0, 0);
        };
    }, [src]);

    return <canvas ref={logoCanvasRef} className={className} />;
}
