/** @type {import('next').NextConfig} */
const nextConfig = {
  reactStrictMode: true,
  // Standalone output keeps the runtime image small: only the files the server
  // actually needs are copied, not the whole node_modules tree.
  output: "standalone",
  eslint: { ignoreDuringBuilds: true },
  experimental: {
    // Kept out of the bundle and required at runtime instead. undici reaches
    // for node: built-ins that webpack refuses to inline, and bundling a copy
    // of the HTTP stack into a server that already has one is pointless anyway.
    serverComponentsExternalPackages: ["undici", "fetch-socks", "socks", "nodemailer"],
  },

  /**
   * Keep the HTTP stack out of the bundle.
   *
   * undici's entry point pulls in its mock agent, which imports `node:console`,
   * and webpack refuses to inline `node:` URIs. Marking the packages external
   * makes the server `require()` them at runtime — which is what should happen
   * anyway: they are used only by server code, and Node already ships undici.
   */
  webpack: (config, { isServer }) => {
    if (isServer) {
      config.externals = [...(config.externals ?? []), "undici", "fetch-socks", "socks"];
    }
    return config;
  },
};

export default nextConfig;
