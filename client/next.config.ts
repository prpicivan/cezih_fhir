import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  rewrites: async () => [
    {
      source: '/api/:path*',
      destination: 'http://127.0.0.1:3010/api/:path*',
    },
  ],
  turbopack: {
    root: import.meta.dirname,
  },
};

export default nextConfig;

