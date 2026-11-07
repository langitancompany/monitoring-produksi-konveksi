// lib/inventory/server.ts
//
// Helper khusus API route Stok Barang Jadi (SERVER ONLY). Bentuknya mengikuti lib/finance/server.ts.
// Semua tulis lewat service role; izin diperiksa ke tabel `users`, bukan ke klien.

import { NextResponse, type NextRequest } from "next/server";
import { requireUser } from "@/lib/apiAuth";
import { getSupabaseAdmin } from "@/lib/supabaseAdmin";
import { isUuid, isDate } from "@/lib/finance/validate";
import { sumItems } from "@/lib/orderItems";
import type { OrderItem } from "@/types/order";
import { resolveInventoryCaps, type InvAction } from "./caps";
import { expectedLines, makeLineComparator } from "./sku";
import { invError, validateAdjustment, validateVerification } from "./validate";
import type {
  InventoryCaps,
  MovementRow,
  ReceiptDetail,
  ReceiptListItem,
  ReceiptStatus,
  StockResponse,
  StockRow,
} from "./types";

export { isUuid, isDate };

export interface InvActor {
  userId: string;
  name: string;
  caps: InventoryCaps;
}

type GuardResult = { ok: true; actor: InvActor } | { ok: false; response: NextResponse };

export const bad = (error: string, status = 400, extra?: Record<string, unknown>) =>
  NextResponse.json({ error, ...extra }, { status });

/** Wajib login + punya hak `action` pada menu Stok Barang Jadi. Dicek ke database, bukan ke klien. */
export async function requireInventori(req: NextRequest, action: InvAction): Promise<GuardResult> {
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

  const caps = resolveInventoryCaps(row, row.permissions?.inventori);
  if (!caps[action]) {
    return {
      ok: false,
      response: NextResponse.json({ error: "Anda tidak memiliki hak akses untuk aksi ini" }, { status: 403 }),
    };
  }
  return { ok: true, actor: { userId: auth.userId, name: row.name || "User", caps } };
}

/** Error "INV: ..." dari fungsi database diteruskan ke pengguna; error lain disamarkan. */
export function invFail(error: { message?: string; code?: string } | null | undefined, fallback?: string) {
  const r = invError(error, fallback);
  if (!r.expected) {
    // Tabel/fungsi belum ada = migration belum dijalankan: beri petunjuk yang bisa ditindaklanjuti.
    if (error?.code === "42P01" || error?.code === "PGRST205" || error?.code === "PGRST202") {
      return NextResponse.json(
        {
          error: "Tabel/fungsi stok belum terbaca. Jalankan migration 024_inventory.sql di SQL Editor Supabase, lalu muat ulang.",
          code: "MIGRATION_MISSING",
        },
        { status: 503 },
      );
    }
    console.error("[inventori]", error);
  }
  return NextResponse.json({ error: r.message }, { status: r.status });
}

const db = () => getSupabaseAdmin();

/** Master jenis produksi (nama + urutan ukuran) untuk menyusun daftar baris. */
async function loadTypes() {
  const { data, error } = await db().from("production_types").select("value, name, ukuran, sort_order");
  if (error) throw error;
  return (data ?? []) as Array<{ value: string; name: string; ukuran: string[] | null; sort_order: number | null }>;
}

// ─── Meta ────────────────────────────────────────────────────────────────────

/** Catatan menunggu verifikasi, tidak termasuk pesanan yang ada di Sampah. */
export async function countPending(): Promise<number> {
  const { data: recs, error } = await db().from("inventory_receipts").select("order_id").eq("status", "pending");
  if (error) throw error;
  const ids = (recs ?? []).map((r: { order_id: string }) => r.order_id);
  if (ids.length === 0) return 0;
  const { data: orders, error: e2 } = await db().from("orders").select("id").in("id", ids).is("deleted_at", null);
  if (e2) throw e2;
  return orders?.length ?? 0;
}

// ─── Stok ────────────────────────────────────────────────────────────────────

export async function loadStock(opts: {
  jenis?: string | null;
  q?: string | null;
  /** sertakan barang yang saldonya nol; form penyesuaian perlu memilihnya */
  includeZero?: boolean;
}): Promise<StockResponse> {
  const stock = db().from("v_inventory_stock").select("*");
  const [{ data, error }, types] = await Promise.all([
    opts.includeZero ? stock : stock.gt("qty", 0),
    loadTypes(),
  ]);
  if (error) throw error;

  const q = (opts.q ?? "").trim().toLowerCase().slice(0, 80);
  let rows = ((data ?? []) as StockRow[]).filter((r) => {
    if (opts.jenis && r.jenis_produksi !== opts.jenis) return false;
    if (q && !`${r.jenis_name} ${r.varian} ${r.warna} ${r.ukuran}`.toLowerCase().includes(q)) return false;
    return true;
  });
  rows = rows.sort(makeLineComparator(types));
  return { rows, total_pcs: rows.reduce((n, r) => n + r.qty, 0) };
}

// ─── Catatan (receipts) ──────────────────────────────────────────────────────

interface ReceiptRow {
  id: string;
  order_id: string;
  kode_produksi: string;
  status: ReceiptStatus;
  qc_done_at: string;
  lines: Array<{ expected: number; counted?: number }> | null;
  total_expected: number | null;
  total_counted: number | null;
  note: string | null;
  verified_by_name: string | null;
  verified_at: string | null;
}

interface OrderRow {
  id: string;
  deleted_at: string | null;
  assigned_to: string | null;
  deadline: string | null;
  items: OrderItem[] | null;
  tujuan?: string;
}

const RECEIPT_COLS =
  "id, order_id, kode_produksi, status, qc_done_at, lines, total_expected, total_counted, note, verified_by_name, verified_at";

async function pjNames(orders: OrderRow[]): Promise<Map<string, string>> {
  const ids = [...new Set(orders.map((o) => o.assigned_to).filter((x): x is string => !!x))];
  if (ids.length === 0) return new Map();
  const { data, error } = await db().from("users").select("id, name").in("id", ids);
  if (error) throw error;
  return new Map((data ?? []).map((u: { id: string; name: string }) => [u.id, u.name]));
}

const hasDiff = (lines: ReceiptRow["lines"]) =>
  Array.isArray(lines) && lines.some((l) => typeof l.counted === "number" && l.counted !== l.expected);

export async function loadReceipts(
  status: "pending" | "verified" | "all",
  limit: number,
  orderId?: string | null,
): Promise<ReceiptListItem[]> {
  let q = db().from("inventory_receipts").select(RECEIPT_COLS);
  if (orderId) q = q.eq("order_id", orderId);
  if (status === "all") q = q.in("status", ["pending", "verified"]);
  else q = q.eq("status", status);
  q = status === "pending" ? q.order("qc_done_at", { ascending: true }) : q.order("qc_done_at", { ascending: false });
  const { data, error } = await q.limit(limit);
  if (error) throw error;
  const recs = (data ?? []) as ReceiptRow[];
  if (recs.length === 0) return [];

  const { data: ords, error: e2 } = await db()
    .from("orders")
    .select("id, deleted_at, assigned_to, deadline, items")
    .in("id", recs.map((r) => r.order_id));
  if (e2) throw e2;
  const orderMap = new Map(((ords ?? []) as OrderRow[]).map((o) => [o.id, o]));
  const names = await pjNames([...orderMap.values()]);

  const out: ReceiptListItem[] = [];
  for (const r of recs) {
    const o = orderMap.get(r.order_id);
    // Yang menunggu tindakan dan pesanannya di Sampah disembunyikan; kembali muncul bila dipulihkan.
    if (r.status === "pending" && (!o || o.deleted_at)) continue;
    out.push({
      id: r.id,
      order_id: r.order_id,
      kode_produksi: r.kode_produksi,
      status: r.status,
      qc_done_at: r.qc_done_at,
      pj_name: o?.assigned_to ? names.get(o.assigned_to) ?? null : null,
      total_pcs: r.status === "verified" ? r.total_counted ?? 0 : sumItems(o?.items ?? []),
      total_expected: r.total_expected,
      total_counted: r.total_counted,
      has_diff: hasDiff(r.lines),
      verified_by_name: r.verified_by_name,
      verified_at: r.verified_at,
    });
  }
  return out;
}

export async function loadReceiptDetail(id: string): Promise<ReceiptDetail | null> {
  const { data, error } = await db().from("inventory_receipts").select(RECEIPT_COLS).eq("id", id).maybeSingle();
  if (error) throw error;
  if (!data) return null;
  const r = data as ReceiptRow;

  const { data: o, error: e2 } = await db()
    .from("orders")
    .select("id, deleted_at, assigned_to, deadline, items")
    .eq("id", r.order_id)
    .maybeSingle();
  if (e2) throw e2;
  const order = o as OrderRow | null;
  const names = order ? await pjNames([order]) : new Map<string, string>();

  let lines: ReceiptDetail["lines"] = [];
  if (r.status === "pending" && order) {
    lines = expectedLines(order.items, await loadTypes());
  } else if (r.status === "verified" && Array.isArray(r.lines)) {
    lines = r.lines as ReceiptDetail["lines"];
  }

  return {
    id: r.id,
    order_id: r.order_id,
    kode_produksi: r.kode_produksi,
    status: r.status,
    qc_done_at: r.qc_done_at,
    pj_name: order?.assigned_to ? names.get(order.assigned_to) ?? null : null,
    total_pcs:
      r.status === "verified" ? r.total_counted ?? 0 : lines.reduce((n, l) => n + l.expected, 0),
    total_expected: r.total_expected,
    total_counted: r.total_counted,
    has_diff: hasDiff(r.lines),
    verified_by_name: r.verified_by_name,
    verified_at: r.verified_at,
    note: r.note,
    deadline: order?.deadline ?? null,
    lines,
  };
}

/** Hasil: sukses atau galat yang sudah berbentuk respons. */
export async function verifyReceipt(
  actor: InvActor,
  receiptId: string,
  body: { lines?: unknown; note?: unknown },
): Promise<NextResponse> {
  const { data: rec, error } = await db()
    .from("inventory_receipts")
    .select("id, order_id, status")
    .eq("id", receiptId)
    .maybeSingle();
  if (error) return invFail(error);
  if (!rec) return bad("Catatan stok tidak ditemukan", 404);
  if (rec.status === "verified") return bad("Catatan ini sudah diverifikasi", 409);
  if (rec.status === "cancelled") return bad("Catatan ini dibatalkan karena QC dibuka lagi", 409);

  const { data: order, error: e2 } = await db()
    .from("orders")
    .select("id, items, deleted_at, tujuan")
    .eq("id", rec.order_id)
    .maybeSingle();
  if (e2) return invFail(e2);
  if (!order || order.deleted_at) return bad("Pesanan ada di Sampah. Pulihkan dulu sebelum verifikasi.", 409);

  // `expected` DISUSUN SERVER dari rincian pesanan; klien hanya mengirim sku_key + counted + alasan.
  let types;
  try {
    types = await loadTypes();
  } catch (e) {
    return invFail(e as { message?: string });
  }
  const expected = expectedLines(order.items as OrderItem[], types);
  const checked = validateVerification(expected, body.lines, body.note);
  if (!checked.ok) return bad(checked.error, 422);

  const { data, error: e3 } = await db().rpc("inv_verify_receipt", {
    p_receipt: receiptId,
    p_actor: actor.userId,
    p_actor_name: actor.name,
    p_lines: checked.lines,
    p_note: checked.note || null,
  });
  if (e3) return invFail(e3);
  return NextResponse.json({ ok: true, ...(data as Record<string, unknown>) });
}

// ─── Riwayat pergerakan ──────────────────────────────────────────────────────

/** Tanggal YYYY-MM-DD dibaca sebagai hari WIB. */
const wibStart = (d: string) => `${d}T00:00:00+07:00`;
const wibEnd = (d: string) => `${d}T23:59:59.999+07:00`;

export async function loadMovements(opts: {
  sku?: string | null;
  from?: string | null;
  to?: string | null;
  limit: number;
}): Promise<MovementRow[]> {
  let q = db()
    .from("inventory_movements")
    .select("id, created_at, kind, receipt_id, order_id, kode_produksi, sku_key, jenis_name, varian, warna, ukuran, delta, note, by_name")
    .order("created_at", { ascending: false })
    .order("id", { ascending: false });
  if (opts.sku) q = q.eq("sku_key", opts.sku);
  if (opts.from) q = q.gte("created_at", wibStart(opts.from));
  if (opts.to) q = q.lte("created_at", wibEnd(opts.to));
  const { data, error } = await q.limit(opts.limit);
  if (error) throw error;
  const moves = (data ?? []) as Array<Omit<MovementRow, "expected" | "diff">>;
  if (moves.length === 0) return [];

  // Hasil produksi tiap baris diambil dari snapshot verifikasi, untuk menandai selisih.
  const rids = [...new Set(moves.map((m) => m.receipt_id).filter((x): x is string => !!x))];
  if (rids.length === 0) return moves.map((m) => ({ ...m, expected: null, diff: null }));
  const { data: recs, error: e2 } = await db().from("inventory_receipts").select("id, lines").in("id", rids);
  if (e2) throw e2;
  const expectedBy = new Map<string, number>();
  for (const r of (recs ?? []) as Array<{ id: string; lines: Array<{ sku_key: string; expected: number }> | null }>) {
    for (const l of r.lines ?? []) expectedBy.set(`${r.id}|${l.sku_key}`, l.expected);
  }
  return moves.map((m) => {
    const exp = m.receipt_id ? expectedBy.get(`${m.receipt_id}|${m.sku_key}`) : undefined;
    return { ...m, expected: exp ?? null, diff: exp === undefined ? null : m.delta - exp };
  });
}

// ─── Penyesuaian ─────────────────────────────────────────────────────────────

export async function adjustStock(
  actor: InvActor,
  body: { kind?: unknown; lines?: unknown; reason?: unknown },
): Promise<NextResponse> {
  const checked = validateAdjustment(body.kind, body.lines, body.reason);
  if (!checked.ok) return bad(checked.error, 422);

  const { data, error } = await db().rpc("inv_adjust_stock", {
    p_actor: actor.userId,
    p_actor_name: actor.name,
    p_kind: checked.kind,
    p_reason: checked.reason,
    p_lines: checked.lines,
  });
  if (error) return invFail(error);
  return NextResponse.json({ ok: true, ...(data as Record<string, unknown>) });
}
