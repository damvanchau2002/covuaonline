/** @type {import('next').NextConfig} */
const nextConfig = {
  reactStrictMode: true,
  webpack: (config) => {
    // Prevent browser build from trying to bundle Node-specific modules
    config.resolve.fallback = {
      ...(config.resolve.fallback || {}),
      fs: false,
      worker_threads: false,
      perf_hooks: false,
      readline: false,
    };
    return config;
  },
};

module.exports = nextConfig;