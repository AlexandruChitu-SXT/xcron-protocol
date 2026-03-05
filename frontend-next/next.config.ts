import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  webpack: (config) => {
    config.resolve.fallback = {
      ...config.resolve.fallback,
      fs: false,
      crypto: false,
      path: false,
    };
    return config;
  },
  // @ts-expect-error NextConfig typing in this canary version doesn't recognize eslint properly
  eslint: {
    ignoreDuringBuilds: true,
  },
};
export default nextConfig;
