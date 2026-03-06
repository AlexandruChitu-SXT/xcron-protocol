import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  output: 'export',
  images: {
    unoptimized: true,
  },
  webpack: (config) => {
    config.resolve.fallback = {
      ...config.resolve.fallback,
      fs: false,
      crypto: false,
      path: false,
    };
    return config;
  },
  eslint: {
    ignoreDuringBuilds: true,
  },
};
export default nextConfig;
