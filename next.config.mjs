/** @type {import('next').NextConfig} */
const nextConfig = {
  reactStrictMode: true,
  // Standalone output keeps the runtime image small: only the files the server
  // actually needs are copied, not the whole node_modules tree.
  output: "standalone",
  eslint: { ignoreDuringBuilds: true },
  experimental: {
    // Lets src/instrumentation.ts run once per server process — that is where
    // the uptime monitor is started.
    instrumentationHook: true,
  },
};

export default nextConfig;
