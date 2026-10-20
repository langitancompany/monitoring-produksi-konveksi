// lib/finance/server.ts
// Helper khusus API route keuangan (SERVER ONLY).

import { NextResponse, type NextRequest } from "next/server";
import { requireUser } from "@/lib/apiAuth";
import { getSupabaseAdmin } from "@/lib/supabaseAdmin";
import { resolveFinanceCaps, type FinAction, type FinCaps } from "./caps";
import { finError, parseSettings, SETTING_KEYS, type FinanceSettings } from "./validate";

export { isUuid, isMoney, isDate, todayWib, sniffProof, PROOF_BUCKET, MAX_PROOF_BYTES } from "./validate";

export interface FinActor {
  userId: string;
  name: string;
  caps: FinCaps;
}

type GuardResult = { ok: true; actor: FinActor } | { ok: false; response: NextResponse };

/** Wajib login + punya hak `action` pada menu Keuangan. Dicek ke database, bukan ke klien. */
export async function requireFinance(req: NextRequest, action: FinAction): Promise<GuardResult> {
  const auth = await requireUser(req);
  if (!auth.ok) return auth;

  const { data: row, error } = await getSupabaseAdmin()
    .from("users")
    .select("name, role, roles, permissions")
    .eq("id", auth.userId)
    .maybeSingle();

  if (error || !row) {
    return { ok: false, response: NextResponse.json({ error: "Pengguna tidak ditemukan" }, { status: 403 }) };
  }

  const caps = resolveFinanceCaps(row, row.permissions?.keuangan);
  if (!caps[action]) {
    return {
      ok: false,
      response: NextResponse.json({ error: "Anda tidak memiliki hak akses untuk aksi ini" }, { status: 403 }),
    };
  }
  return { ok: true, actor: { userId: auth.userId, name: row.name || "User", caps } };
}

/** Error "FIN: ..." dari fungsi database diteruskan ke pengguna; error lain disamarkan. */
export function finFail(error: { message?: string; code?: string } | null | undefined, fallback?: string) {
  const r = finError(error, fallback);
  if (!r.expected) {
    // Tabel/fungsi belum ada = migration belum dijalankan: beri petunjuk yang bisa ditindaklanjuti.
    if (error?.code === "42P01" || error?.code === "PGRST205" || error?.code === "PGRST202") {
      return NextResponse.json(
        {
          error:
            "Tabel/fungsi keuangan belum terbaca. Jalankan migration Keuangan (009 dst.) di SQL Editor Supabase, lalu muat ulang.",
          code: "MIGRATION_MISSING",
        },
        { status: 503 },
      );
    }
    console.error("[finance]", error);
  }
  return NextResponse.json({ error: r.message }, { status: r.status });
}

export const bad = (error: string, status = 400, extra?: Record<string, unknown>) =>
  NextResponse.json({ error, ...extra }, { status });

export async function loadSettings(): Promise<FinanceSettings> {
  // Hanya kunci yang dipakai. Baris lain (mis. invoice_settings berisi gambar) tidak ikut terbaca.
  const { data } = await getSupabaseAdmin()
    .from("finance_settings")
    .select("key, value")
    .in("key", [...SETTING_KEYS]);
  return parseSettings(data);
}
