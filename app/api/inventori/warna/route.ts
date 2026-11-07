// GET /api/inventori/warna  -> daftar warna yang sudah ada (buku besar stok + pesanan terbaru) untuk saran
// saat mengetik warna di form pesanan, supaya salah ketik tidak memecah stok jadi baris baru.
// Tidak butuh hak menu Stok: cukup yang boleh membuat/mengedit pesanan (atau melihat stok).
import { NextRequest, NextResponse } from "next/server";
import { requireUser } from "@/lib/apiAuth";
import { getSupabaseAdmin } from "@/lib/supabaseAdmin";
import { VARIAN_LAINNYA } from "@/lib/orderItems";
import { normWarna, type WarnaOption } from "@/lib/inventory/warna";
import { resolveInventoryCaps } from "@/lib/inventory/caps";
import type { OrderItem } from "@/types/order";

export const dynamic = "force-dynamic";

const MOVEMENT_LIMIT = 5000;
const ORDER_LIMIT = 400;
const OPTION_LIMIT = 300;

export async function GET(req: NextRequest) {
  const auth = await requireUser(req);
  if (!auth.ok) return auth.response;

  const db = getSupabaseAdmin();
  const { data: me } = await db.from("users").select("role, roles, permissions").eq("id", auth.userId).maybeSingle();
  if (!me) return NextResponse.json({ error: "Pengguna tidak ditemukan" }, { status: 403 });
  const perms = (me.permissions ?? {}) as Record<string, Record<string, boolean> | undefined>;
  const allowed =
    resolveInventoryCaps(me, perms.inventori).view ||
    perms.orders?.create === true ||
    perms.orders?.edit === true;
  if (!allowed) return NextResponse.json({ error: "Anda tidak memiliki hak akses" }, { status: 403 });

  const map = new Map<string, { warna: string; n: number; jenis: Set<string>; stok: boolean }>();
  const add = (raw: string, jenis: string, fromStok: boolean) => {
    const label = raw.replace(/\s+/g, " ").trim();
    const key = normWarna(label).replace(/[\s\-_.]/g, "");
    if (!key || label.length > 40) return;
    const cur = map.get(key);
    if (!cur) {
      map.set(key, { warna: label, n: 1, jenis: new Set(jenis ? [jenis] : []), stok: fromStok });
      return;
    }
    cur.n += 1;
    if (jenis) cur.jenis.add(jenis);
    // Ejaan dari buku besar stok menjadi baku (yang pertama dilihat = paling baru).
    if (fromStok && !cur.stok) cur.warna = label;
    if (fromStok) cur.stok = true;
  };

  try {
    // 1) Buku besar stok (ejaan baku). Terbaru dulu supaya ejaan terbaru yang dipakai.
    const { data: moves, error: e1 } = await db
      .from("inventory_movements")
      .select("warna, jenis_produksi")
      .neq("warna", "")
      .order("created_at", { ascending: false })
      .limit(MOVEMENT_LIMIT);
    if (e1) throw e1;
    for (const m of (moves ?? []) as Array<{ warna: string; jenis_produksi: string }>) add(m.warna, m.jenis_produksi, true);

    // 2) Pesanan terbaru (yang belum masuk stok), supaya ejaan di pesanan berjalan ikut seragam.
    const { data: orders, error: e2 } = await db
      .from("orders")
      .select("items")
      .is("deleted_at", null)
      .order("created_at", { ascending: false })
      .limit(ORDER_LIMIT);
    if (e2) throw e2;
    for (const o of (orders ?? []) as Array<{ items: OrderItem[] | null }>) {
      for (const it of o.items ?? []) {
        for (const r of it.rincian ?? []) {
          const w = r.warna === VARIAN_LAINNYA ? r.warna_lain : r.warna;
          if (w) add(w, it.jenis_produksi, false);
        }
      }
    }
  } catch (e) {
    const err = e as { code?: string; message?: string };
    // Tabel stok belum ada (migration 024 belum dijalankan): saran tidak wajib, jangan ganggu form.
    if (err?.code === "42P01" || err?.code === "PGRST205") return NextResponse.json({ options: [] });
    console.error("[inventori/warna]", e);
    return NextResponse.json({ error: "Gagal memuat daftar warna" }, { status: 500 });
  }

  const options: WarnaOption[] = [...map.values()]
    .sort((a, b) => b.n - a.n || a.warna.localeCompare(b.warna, "id"))
    .slice(0, OPTION_LIMIT)
    .map((x) => ({ warna: x.warna, n: x.n, jenis: [...x.jenis], stok: x.stok }));

  return NextResponse.json({ options });
}