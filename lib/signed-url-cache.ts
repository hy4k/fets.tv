/**
 * Signed links that stay the same between reads.
 *
 * Every call to createSignedUrl mints a new token, so the link differs each
 * time even for the same file. A browser treats a new link as a new file and
 * downloads it again: a TV that re-reads its state every minute would pull
 * every poster and video afresh all day, which is what used up the project's
 * egress. Here a link is signed once and handed out again until half its life
 * has passed, so the browser's cache can do its job.
 */

type Signer = {
  storage: {
    from(bucket: string): {
      createSignedUrls(
        paths: string[],
        expiresIn: number,
      ): PromiseLike<{ data: { path: string | null; signedUrl: string | null }[] | null; error: unknown }>;
    };
  };
};

const cache = new Map<string, { url: string; until: number }>();

/** For tests only. */
export function clearSignedUrlCache() {
  cache.clear();
}

export async function stableSignedUrls(
  supabase: Signer,
  bucket: string,
  paths: string[],
  seconds: number,
  now: number = Date.now(),
): Promise<Map<string, string>> {
  const out = new Map<string, string>();
  const fresh = now + (seconds * 1000) / 2;
  const missing: string[] = [];

  for (const [key, hit] of cache) if (hit.until <= now) cache.delete(key);

  for (const path of new Set(paths)) {
    const hit = cache.get(`${bucket}/${path}`);
    if (hit && hit.until > fresh) out.set(path, hit.url);
    else missing.push(path);
  }

  if (missing.length) {
    const { data } = await supabase.storage.from(bucket).createSignedUrls(missing, seconds);
    const until = now + seconds * 1000;
    for (const s of data ?? []) {
      if (!s.path || !s.signedUrl) continue;
      cache.set(`${bucket}/${s.path}`, { url: s.signedUrl, until });
      out.set(s.path, s.signedUrl);
    }
  }

  return out;
}
