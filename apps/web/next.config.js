/** @type {import('next').NextConfig} */
const nextConfig = {
  // A production build writes to the same .next the dev server is serving from,
  // which corrupts its chunks mid-session ("Cannot find module
  // './vendor-chunks/@supabase.js'"). Give each its own directory.
  distDir: process.env.NODE_ENV === 'development' ? '.next-dev' : '.next',
  images: {
    remotePatterns: [
      {
        protocol: 'https',
        hostname: '*.supabase.co',
      },
    ],
  },
};

module.exports = nextConfig;
