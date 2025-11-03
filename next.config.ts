import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  /* config options here */
  typescript: {
    ignoreBuildErrors: true,
  },
  reactStrictMode: true,
  eslint: {
    // 构建时忽略ESLint错误
    ignoreDuringBuilds: true,
  },
  // Use a custom distDir to avoid Windows file locking on .next/trace
  distDir: ".next-dev",
  // Next 15+: expose native Node deps to the server runtime
  serverExternalPackages: [
    "@whiskeysockets/baileys",
    "ws",
    "pino",
    "pino-pretty",
    "qrcode-terminal",
  ],
  webpack: (config) => {
    // Avoid bundling optional native deps so ws can fall back to JS implementation
    config.externals = config.externals || []
    config.externals.push({
      bufferutil: "commonjs bufferutil",
      "utf-8-validate": "commonjs utf-8-validate",
    })
    return config
  },
};

export default nextConfig;
