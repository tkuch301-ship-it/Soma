import { createClient, SupabaseClient } from "@supabase/supabase-js";

/**
 * Singleton Supabase client used by the data layer (src/lib/repo.ts).
 *
 * We deliberately do NOT read/validate env vars at module load time: this
 * file is imported by API routes, and Next.js may load route modules
 * during the build (e.g. for static analysis) before env vars are
 * available. Instead, the error is thrown lazily the first time a request
 * actually needs the client, which surfaces as a clear 500 response rather
 * than crashing the build.
 */
let cached: SupabaseClient | null = null;

export function getSupabase(): SupabaseClient {
  if (cached) {
    return cached;
  }

  const url = process.env.SUPABASE_URL;
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY;

  if (!url || !key) {
    throw new Error(
      "SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY must be set. " +
        "Copy .env.example to .env.local and fill in your Supabase project credentials."
    );
  }

  cached = createClient(url, key, {
    auth: { persistSession: false, autoRefreshToken: false },
  });
  return cached;
}

/** For tests: clears the cached client so a new one is created (e.g. after changing env vars). */
export function resetSupabaseForTests(): void {
  cached = null;
}
