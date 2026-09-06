import { createRequire } from 'node:module';

const apiProxyTarget = process.env.API_PROXY_TARGET ?? 'http://127.0.0.1:8000';
// Settings shows the running interface version; reading it from the manifest
// keeps that number from drifting away from the package it describes.
const { version } = createRequire(import.meta.url)('./package.json');

/** @type {import('next').NextConfig} */
const nextConfig = {
  distDir: process.env.NODE_ENV === 'production' ? '.next' : '.next-dev',
  env: { NEXT_PUBLIC_APP_VERSION: version },
  async rewrites() {
    return [
      {
        source: '/api/:path*',
        destination: `${apiProxyTarget}/api/:path*`,
      },
    ];
  },
};

export default nextConfig;
