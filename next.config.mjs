/** @type {import('next').NextConfig} */
const nextConfig = {
  // Emits a self-contained server bundle so the runtime image does not need
  // node_modules. Required for the Docker build; harmless on Vercel.
  output: 'standalone',
  experimental: { serverActions: { bodySizeLimit: '25mb' } },
  images: {
    remotePatterns: [
      { protocol: 'https', hostname: '*.supabase.co' },
      { protocol: 'https', hostname: 'lh3.googleusercontent.com' },
      { protocol: 'https', hostname: 'drive.google.com' },
    ],
  },
};
export default nextConfig;
