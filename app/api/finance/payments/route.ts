// GET  /api/finance/payments?status=&from=&to=&order_id=  -> daftar transaksi
// POST /api/finance/payments (multipart/form-data)         -> catat pembayaran (+ bukti)
//
// Semua pembayaran masuk antrean verifikasi (pending). Langsung terverifikasi hanya bila pengaturan
// auto_verify_own_payment menyala, pencatat berhak memverifikasi, dan require_separate_verifier mati —
// dan database memeriksa ulang ketiganya.
import { NextRequest, NextResponse } from "next/server";
import { randomUUID } from "crypto";
import { getSupabaseAdmin } from "@/lib/supabaseAdmin";
import {
  requireFinance, finFail, bad, isUuid, isDate, loadSettings, sniffProof, PROOF_BUCKET, MAX_PROOF_BYTES,
} from "@/lib/finance/server";
import { PAYMENT_COLUMNS, PAYMENT_STATUSES, parsePaymentFields } from "@/lib/finance/payments";
import { hydratePayments } from "@/lib/finance/paymentsDb";

export const dynamic = "force-dynamic";

export async function GET(req: NextRequest) {
  const guard = await requireFinance(req, "view");
  if (!guard.ok) return guard.response;

  const sp = req.nextUrl.searchParams;
  const status = sp.get("status");
  const from = sp.get("from");
  const to = sp.get("to");
  const orderId = sp.get("order_id");
  if (status && !(PAYMENT_STATUSES as readonly string[]).includes(status)) return bad("Status tidak valid");
  if ((from && !isDate(from)) || (to && !isDate(to))) return bad("Tanggal tidak valid");
  if (orderId && !isUuid(orderId)) return bad("Order tidak valid");

  const admin = getSupabaseAdmin();
  let q = admin.from("order_payments").select(PAYMENT_COLUMNS);
  if (status) q = q.eq("status", status);
  if (from) q = q.gte("paid_at", from);
  if (to) q = q.lte("paid_at", to);
  if (orderId) q = q.eq("order_id", orderId);

  const { data, error } = await q
    .order("paid_at", { ascending: false })
    .order("recorded_at", { ascending: false })
    .limit(1000);
  if (error) return finFail(error);
  return NextResponse.json({ rows: await hydratePayments(admin, data ?? []) });
}

export async function POST(req: NextRequest) {
  const guard = await requireFinance(req, "create");
  if (!guard.ok) return guard.response;
  const { actor } = guard;

  const form = await req.formData().catch(() => null);
  if (!form) return bad("Data tidak valid");

  const parsed = parsePaymentFields(
    (k) => {
      const v = form.get(k);
      return typeof v === "string" ? v : "";
    },
    { edit: actor.caps.edit },
  );
  if (!parsed.ok) return bad(parsed.error, parsed.status);
  const f = parsed.value;

  // Bukti (opsional di sini; wajib-tidaknya diputuskan database sesuai pengaturan)
  const admin = getSupabaseAdmin();
  let proofPath: string | null = null;
  const file = form.get("proof");
  if (file instanceof File && file.size > 0) {
    if (file.size > MAX_PROOF_BYTES) return bad("Ukuran bukti maksimal 4 MB");
    const bytes = new Uint8Array(await file.arrayBuffer());
    const kindOfFile = sniffProof(bytes);
    if (!kindOfFile) return bad("Format bukti harus JPG, PNG, WEBP, atau PDF");

    proofPath = `${f.orderId}/${randomUUID()}.${kindOfFile.ext}`;
    const up = await admin.storage.from(PROOF_BUCKET).upload(proofPath, bytes, {
      contentType: kindOfFile.mime,
      upsert: false,
    });
    if (up.error) return finFail(up.error, "Gagal mengunggah bukti");
  }

  const settings = await loadSettings();
  const autoVerify = settings.auto_verify_own_payment && actor.caps.edit && !settings.require_separate_verifier;

  const { data: id, error } = await admin.rpc("fin_record_payment", {
    p_order: f.orderId,
    p_actor: actor.userId,
    p_actor_name: actor.name,
    p_amount: f.amount,
    p_kind: f.kind,
    p_method: f.method,
    p_account: f.accountId,
    p_paid_at: f.paidAt,
    p_reference: f.reference,
    p_payer: f.payer,
    p_proof_path: proofPath,
    p_note: f.note,
    p_auto_verify: autoVerify,
  });

  if (error) {
    // Jangan tinggalkan file yatim bila pencatatan ditolak.
    if (proofPath) await admin.storage.from(PROOF_BUCKET).remove([proofPath]);
    return finFail(error);
  }
  const { data: row } = await admin.from("order_payments").select("status, kind").eq("id", id).maybeSingle();
  return NextResponse.json({ id, status: row?.status ?? "pending", kind: row?.kind ?? null });
}
