import { useEffect, useRef } from 'react';

const CANVAS_SIZE = 200;

export default function SlicedLogo3D() {
    const canvasRef = useRef<HTMLCanvasElement>(null);

    useEffect(() => {
        const canvas = canvasRef.current;
        if (!canvas) return;

        const img = new Image();
        img.crossOrigin = 'anonymous';
        img.src = '/logo.png';
        img.onload = () => {
            canvas.width = img.width;
            canvas.height = img.height;
            const ctx = canvas.getContext('2d', { willReadFrequently: true })!;
            ctx.drawImage(img, 0, 0);

            // Remove black background pixels
            const imageData = ctx.getImageData(0, 0, canvas.width, canvas.height);
            const data = imageData.data;
            for (let p = 0; p < data.length; p += 4) {
                const brightness = data[p] * 0.299 + data[p + 1] * 0.587 + data[p + 2] * 0.114;
                if (brightness < 40) {
                    data[p + 3] = 0;
                } else if (brightness < 70) {
                    data[p + 3] = Math.round(((brightness - 40) / 30) * 255);
                }
            }
            ctx.putImageData(imageData, 0, 0);
        };
    }, []);

    return (
        <div
            style={{
                width: CANVAS_SIZE,
                height: CANVAS_SIZE,
                margin: '0 auto 12px',
                position: 'relative',
                zIndex: 2,
                animation: 'logoFloat 4s ease-in-out infinite',
            }}
        >
            <canvas
                ref={canvasRef}
                style={{
                    width: '100%',
                    height: '100%',
                    objectFit: 'contain',
                }}
            />
        </div>
    );
}
