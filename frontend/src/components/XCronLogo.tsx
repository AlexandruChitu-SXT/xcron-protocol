import './XCronLogo.css';

interface XCronLogoProps {
    size?: number;
}

export default function XCronLogo({ size = 200 }: XCronLogoProps) {
    return (
        <div className="xcron-logo-wrapper" style={{ width: size, height: size }}>
            <svg
                viewBox="0 0 200 200"
                xmlns="http://www.w3.org/2000/svg"
                className="xcron-logo-svg"
            >
                <defs>
                    {/* Neon glow filter — layered blur for deep glow */}
                    <filter id="neonGlow" x="-50%" y="-50%" width="200%" height="200%">
                        <feGaussianBlur in="SourceGraphic" stdDeviation="2" result="blur1" />
                        <feGaussianBlur in="SourceGraphic" stdDeviation="6" result="blur2" />
                        <feGaussianBlur in="SourceGraphic" stdDeviation="12" result="blur3" />
                        <feMerge>
                            <feMergeNode in="blur3" />
                            <feMergeNode in="blur2" />
                            <feMergeNode in="blur1" />
                            <feMergeNode in="SourceGraphic" />
                        </feMerge>
                    </filter>

                    {/* Subtle pulsing glow */}
                    <filter id="softGlow" x="-30%" y="-30%" width="160%" height="160%">
                        <feGaussianBlur in="SourceGraphic" stdDeviation="4" result="glow" />
                        <feMerge>
                            <feMergeNode in="glow" />
                            <feMergeNode in="SourceGraphic" />
                        </feMerge>
                    </filter>

                    {/* Gradient for the X star */}
                    <linearGradient id="starGradient" x1="0%" y1="0%" x2="100%" y2="100%">
                        <stop offset="0%" stopColor="#64ffda" />
                        <stop offset="50%" stopColor="#00e5cc" />
                        <stop offset="100%" stopColor="#00bfa5" />
                    </linearGradient>

                    {/* Gradient for chains */}
                    <linearGradient id="chainGradient" x1="0%" y1="0%" x2="100%" y2="100%">
                        <stop offset="0%" stopColor="#80ffea" />
                        <stop offset="100%" stopColor="#00d4aa" />
                    </linearGradient>
                </defs>

                {/* ═══ X Star Shape ═══ */}
                <g filter="url(#neonGlow)" className="logo-x-star">
                    {/* Top-right spike */}
                    <polygon
                        points="100,72 140,28 130,55 168,32 120,70"
                        fill="url(#starGradient)"
                        opacity="0.95"
                    />
                    {/* Top-left spike */}
                    <polygon
                        points="100,72 60,28 70,55 32,32 80,70"
                        fill="url(#starGradient)"
                        opacity="0.95"
                    />
                    {/* Bottom-right spike */}
                    <polygon
                        points="100,128 140,172 130,145 168,168 120,130"
                        fill="url(#starGradient)"
                        opacity="0.95"
                    />
                    {/* Bottom-left spike */}
                    <polygon
                        points="100,128 60,172 70,145 32,168 80,130"
                        fill="url(#starGradient)"
                        opacity="0.95"
                    />
                    {/* Connecting diagonal lines for depth */}
                    <line x1="100" y1="65" x2="165" y2="25" stroke="#64ffda" strokeWidth="1.2" opacity="0.6" />
                    <line x1="100" y1="65" x2="35" y2="25" stroke="#64ffda" strokeWidth="1.2" opacity="0.6" />
                    <line x1="100" y1="135" x2="165" y2="175" stroke="#64ffda" strokeWidth="1.2" opacity="0.6" />
                    <line x1="100" y1="135" x2="35" y2="175" stroke="#64ffda" strokeWidth="1.2" opacity="0.6" />
                </g>

                {/* ═══ Chain Circle ═══ */}
                <g filter="url(#softGlow)" className="logo-chain-circle">
                    {/* Main circle ring */}
                    <circle
                        cx="100" cy="100" r="40"
                        fill="none"
                        stroke="url(#chainGradient)"
                        strokeWidth="2.5"
                        opacity="0.9"
                    />

                    {/* Chain links — small interlocked ellipses around the circle */}
                    {Array.from({ length: 16 }).map((_, i) => {
                        const angle = (i * 360) / 16;
                        const rad = (angle * Math.PI) / 180;
                        const cx = 100 + 40 * Math.cos(rad);
                        const cy = 100 + 40 * Math.sin(rad);
                        return (
                            <ellipse
                                key={i}
                                cx={cx}
                                cy={cy}
                                rx="6"
                                ry="3.5"
                                fill="none"
                                stroke="#64ffda"
                                strokeWidth="1.8"
                                transform={`rotate(${angle + 90}, ${cx}, ${cy})`}
                                opacity="0.85"
                            />
                        );
                    })}
                </g>

                {/* ═══ Clock Tick Marks ═══ */}
                <g className="logo-clock-marks" opacity="0.5">
                    {Array.from({ length: 24 }).map((_, i) => {
                        const angle = (i * 360) / 24;
                        const rad = (angle * Math.PI) / 180;
                        const innerR = 33;
                        const outerR = i % 2 === 0 ? 37 : 35;
                        return (
                            <line
                                key={i}
                                x1={100 + innerR * Math.cos(rad)}
                                y1={100 + innerR * Math.sin(rad)}
                                x2={100 + outerR * Math.cos(rad)}
                                y2={100 + outerR * Math.sin(rad)}
                                stroke="#64ffda"
                                strokeWidth={i % 6 === 0 ? '1.5' : '0.8'}
                                strokeLinecap="round"
                            />
                        );
                    })}
                </g>

                {/* ═══ "cron" Text ═══ */}
                <text
                    x="100"
                    y="105"
                    textAnchor="middle"
                    dominantBaseline="middle"
                    className="logo-cron-text"
                    filter="url(#softGlow)"
                >
                    cron
                </text>
            </svg>
        </div>
    );
}
