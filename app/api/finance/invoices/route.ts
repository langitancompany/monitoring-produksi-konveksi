// GET  /api/finance/invoices  -> posisi keuangan semua pesanan (tagihan, terbayar, sisa, status)
// POST /api/finance/invoices  -> terbitkan / revisi tagihan (total DIHITUNG di database)
//
// Body POST: { order_id, prices: { "<id item>": harga per pcs }, discount?, due_date?, reason?,
//              acknowledge_mismatch? }. Revisi (pesanan sudah punya tagihan aktif) WAJIB beralasan.
import { NextRequest, NextResponse } from "next/server";
import { getSupabaseAdmin } from "@/lib/supabaseAdmin";
import { requireFinance, finFail, bad, isUuid, isDate } from "@/lib/finance/server";
import { calcInvoice } from "@/lib/finance/pricing";
import type { OrderItem } from "@/types/order";

export const dynamic = "force-dynamic";

export async function GET(req: NextRequest) {
  const guard = await requireFinance(req, "view");
  if (!guard.ok) return guard.response;

  const { data, error } = await getSupabaseAdmin()
    .from("v_order_finance")
    .select("*")
    .order("tanggal_masuk", { ascending: false, nullsFirst: false })
    .limit(2000);
  if (error) return finFail(error);
  return NextResponse.json({ rows: data ?? [] });
}

export async function POST(req: NextRequest) {
  const guard = await requireFinance(req, "maker");
  if (!guard.ok) return guard.response;
  const { actor } = guard;

  const body = await req.json().catch(() => null);
  if (!body || !isUuid(body.order_id)) return bad("Pesanan tidak valid");
  if (!body.prices || typeof body.prices !== "object" || Array.isArray(body.prices)) return bad("Harga per item wajib diisi");
  if (body.due_date != null && !isDate(body.due_date)) return bad("Tanggal jatuh tempo tidak valid");
  const reason = typeof body.reason === "string" ? body.reason.trim().slice(0, 500) : "";

  const admin = getSupabaseAdmin();
  const { data: order, error: oErr } = await admin
    .from("orders")
    .select("id, jumlah, items, deleted_at")
    .eq("id", body.order_id)
    .maybeSingle();
  if (oErr) return finFail(oErr);
  if (!order || order.deleted_at) return bad("Pesanan tidak ditemukan", 404);

  // Pemeriksaan awal (aturan sama dengan fungsi SQL) supaya pesan galat jelas. Angka tetap dihitung ulang database.
  const calc = calcInvoice((order.items ?? []) as OrderItem[], body.prices, body.discount ?? 0);
  if (!calc.ok) return bad(calc.error);
  if (order.jumlah !== calc.calc.totalPcs && body.acknowledge_mismatch !== true) {
    return bad(
      `Jumlah pcs pada rincian item (${calc.calc.totalPcs}) berbeda dengan jumlah pesanan (${order.jumlah}). Periksa kembali, atau konfirmasi untuk melanjutkan.`,
      409,
      { code: "PCS_MISMATCH", total_pcs: calc.calc.totalPcs, jumlah: order.jumlah },
    );
  }

  const { data: id, error } = await admin.rpc("fin_issue_invoice", {
    p_order: order.id,
    p_actor: actor.userId,
    p_actor_name: actor.name,
    p_prices: body.prices,
    p_discount: body.discount ?? 0,
    p_reason: reason || null,
    p_due_date: body.due_date ?? null,
  });
  if (error) return finFail(error);

  // Total yang dikembalikan = angka yang benar-benar tersimpan di database.
  const { data: inv } = await admin.from("order_invoices").select("version, total").eq("id", id).maybeSingle();
  return NextResponse.json({ id, version: inv?.version ?? null, total: inv?.total ?? calc.calc.total });
}
