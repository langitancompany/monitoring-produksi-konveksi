// lib/supabaseAdmin.ts
//
// Client Supabase dengan SERVICE ROLE (bypass RLS) — HANYA untuk server.
// Dibuat LAZY: client baru dibuat saat fungsi dipanggil (saat ada request),
// bukan saat file di-import. Dengan begitu `next build` tidak gagal walaupun
// env var belum tersedia di tahap build.

import { createClient, type SupabaseClient } from '@supabase/supabase-js';
import { UNIT } from '@/lib/config';

const cache = new Map<string, SupabaseClient<any, any, any>>();

export function getSupabaseAdmin(
  schema: string = UNIT.dbSchema
): SupabaseClient<any, any, any> {
  const cached = cache.get(schema);
  if (cached) return cached;

  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;

  if (!url || !serviceKey) {
    throw new Error(
      'NEXT_PUBLIC_SUPABASE_URL / SUPABASE_SERVICE_ROLE_KEY belum diset di server'
    );
  }

  const client = createClient(url, serviceKey, {
    auth: { autoRefreshToken: false, persistSession: false },
    db: { schema },
  }) as unknown as SupabaseClient<any, any, any>;

  cache.set(schema, client);
  return client;
}