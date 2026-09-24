import type { NextConfig } from "next";

// Traefik serves this app at the root of fets.online. The prefix stays
// configurable (NEXT_PUBLIC_BASE_PATH) because raw fetch/EventSource URLs are
// not rewritten by Next and read it from the client bundle.
const basePath = process.env.NEXT_PUBLIC_BASE_PATH ?? "";

const nextConfig: NextConfig = {
  reactStrictMode: true,
  output: "standalone",
  basePath,
  env: { NEXT_PUBLIC_BASE_PATH: basePath },
  // The console used to live under /tv. Hall TVs and staff bookmarks still
  // point there (fets.online/tv/display/hall1), so send them to the same page
  // at the root. "/tv" on its own is now the staff TV-screen page, so only
  // paths beneath it move.
  async redirects() {
    if (basePath) return [];
    return [{ source: "/tv/:path+", destination: "/:path+", permanent: false }];
  },
};

export default nextConfig;