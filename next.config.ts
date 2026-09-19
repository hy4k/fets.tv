import type { NextConfig } from "next";

// Traefik serves this app under fets.online/tv, so the prefix has to be baked
// into both the router and the client bundle: raw fetch/EventSource URLs are
// not rewritten by Next.
const basePath = process.env.NEXT_PUBLIC_BASE_PATH ?? "/tv";

const nextConfig: NextConfig = {
  reactStrictMode: true,
  output: "standalone",
  basePath,
  env: { NEXT_PUBLIC_BASE_PATH: basePath },
};

export default nextConfig;
