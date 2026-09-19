/**
 * Next rewrites <Link> and router paths for basePath, but not URLs handed to
 * fetch() or EventSource. Those call sites prefix with this.
 */
export const basePath = process.env.NEXT_PUBLIC_BASE_PATH ?? "";
