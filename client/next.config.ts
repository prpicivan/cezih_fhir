import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  async rewrites() {
    return {
      beforeFiles: [
        {
          source: '/api/:path*',
          destination: 'http://127.0.0.1:3010/api/:path*',
        },
      ],
      afterFiles: [],
      fallback: [],
    };
  },
  turbopack: {
    root: import.meta.dirname,
  },
};

export default nextConfig;

