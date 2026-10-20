// GET /api/finance/orders/:orderId -> posisi keuangan + riwayat tagihan satu pesanan.
// Menyertakan riwayat pembayaran (path bukti tidak pernah dikirim — hanya `has_proof`).
import { NextRequest, NextResponse } from "next/server";
import { getSupabaseAdmin } from "@/lib/supabaseAdmin";
import { requireFinance, finFail, bad, isUuid } from "@/lib/finance/server";
import { invoiceIsStale } from "@/lib/finance/pricing";
import { PAYMENT_COLUMNS } from "@/lib/finance/payments";
import { hydratePayments } from "@/lib/finance/paymentsDb";
import type { OrderFinanceDetail, InvoiceRow } from "@/lib/finance/types";

export const dynamic = "force-dynamic";

export async function GET(req: NextRequest, ctx: { params: Promise<{ orderId: string }> }) {
  const guard = await requireFinance(req, "view");
  if (!guard.ok) return guard.response;

  const { orderId } = await ctx.params;
  if (!isUuid(orderId)) return bad("Pesanan tidak valid");

  const admin = getSupabaseAdmin();
  const [fin, order, inv, pay] = await Promise.all([
    admin.from("v_order_finance").select("*").eq("order_id", orderId).maybeSingle(),
    admin
      .from("orders")
      .select("id, kode_produksi, nama_pemesan, no_hp, alamat_pemesan, jumlah, jenis_produksi, tanggal_masuk, kategori, items")
      .eq("id", orderId)
      .maybeSingle(),
    admin
      .from("order_invoices")
      .select("id, order_id, version, status, pricing_snapshot, total_pcs, subtotal, discount, total, reason, due_date, issued_by_name, issued_at")
      .eq("order_id", orderId)
      .order("version", { ascending: false }),
    admin
      .from("order_payments")
      .select(PAYMENT_COLUMNS)
      .eq("order_id", orderId)
      .order("paid_at", { ascending: false })
      .order("recorded_at", { ascending: false }),
  ]);
  const err = fin.error || order.error || inv.error || pay.error;
  if (err) return finFail(err);
  if (!fin.data || !order.data) return bad("Pesanan tidak ditemukan", 404);

  const invoices = (inv.data ?? []) as InvoiceRow[];
  const active = invoices.find((i) => i.status === "active");
  const body: OrderFinanceDetail = {
    finance: fin.data,
    order: { ...order.data, items: order.data.items ?? [] },
    invoices,
    payments: await hydratePayments(admin, pay.data ?? []),
    invoice_stale: invoiceIsStale(active?.pricing_snapshot, order.data.items ?? []),
  };
  return NextResponse.json(body);
}
