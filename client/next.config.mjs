/** @type {import('next').NextConfig} */
const nextConfig = {
    rewrites: async () => [
        {
            source: '/api/:path*',
            destination: 'http://localhost:3010/api/:path*',
        },
    ],
};

export default nextConfig;
