// lib/supabase/client.ts
//
// Client Supabase untuk BROWSER. Pakai fungsi ini di semua tempat
// (halaman, hook, komponen) — jangan membuat createBrowserClient sendiri,
// supaya schema & opsi cookie selalu sama.
//
// Penting: panggil sekali per komponen (useState(() => createClient()) atau
// useMemo), BUKAN di badan render. Tiap instance menyalakan timer
// auto-refresh token sendiri; instance yang dibuat tiap render akan
// membanjiri Supabase dengan request refresh_token (rate limit).

import { createBrowserClient } from "@supabase/ssr";
import type { SupabaseClient } from "@supabase/supabase-js";
import { UNIT, authCookieOptions } from "@/lib/config";

export function createClient(): SupabaseClient<any, any, any> {
  return createBrowserClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    {
      db: { schema: UNIT.dbSchema },
      cookieOptions: authCookieOptions(),
    },
  ) as unknown as SupabaseClient<any, any, any>;
}
