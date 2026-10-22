// GET  /api/finance/expenses?status=&from=&to=&category_id=&vendor_id=&order_id=  -> daftar pengeluaran
// POST /api/finance/expenses (multipart/form-data)                                -> catat pengeluaran (+ bukti)
//
// Semua pengeluaran masuk antrean persetujuan (pending). Langsung disetujui hanya bila pengaturan
// auto_approve_own_expense menyala, pencatat berhak menyetujui, dan require_separate_verifier mati —
// dan database memeriksa ulang ketiganya.
import { NextRequest, NextResponse } from "next/server";
import { randomUUID } from "crypto";
import { getSupabaseAdmin } from "@/lib/supabaseAdmin";
import {
  requireFinance, finFail, bad, isUuid, isDate, loadSettings, sniffProof, PROOF_BUCKET, MAX_PROOF_BYTES,
} from "@/lib/finance/server";
import { EXPENSE_COLUMNS, EXPENSE_STATUSES, parseExpenseFields } from "@/lib/finance/expenses";
import { hydrateExpenses } from "@/lib/finance/expensesDb";

export const dynamic = "force-dynamic";

export async function GET(req: NextRequest) {
  const guard = await requireFinance(req, "view");
  if (!guard.ok) return guard.response;

  const sp = req.nextUrl.searchParams;
  const status = sp.get("status");
  const from = sp.get("from");
  const to = sp.get("to");
  const categoryId = sp.get("category_id");
  const vendorId = sp.get("vendor_id");
  const orderId = sp.get("order_id");
  if (status && !(EXPENSE_STATUSES as readonly string[]).includes(status)) return bad("Status tidak valid");
  if ((from && !isDate(from)) || (to && !isDate(to))) return bad("Tanggal tidak valid");
  for (const id of [categoryId, vendorId, orderId]) if (id && !isUuid(id)) return bad("Filter tidak valid");

  const admin = getSupabaseAdmin();
  let q = admin.from("finance_expenses").select(EXPENSE_COLUMNS);
  if (status) q = q.eq("status", status);
  if (from) q = q.gte("spent_at", from);
  if (to) q = q.lte("spent_at", to);
  if (categoryId) q = q.eq("category_id", categoryId);
  if (vendorId) q = q.eq("vendor_id", vendorId);
  if (orderId) q = q.eq("order_id", orderId);

  const { data, error } = await q
    .order("spent_at", { ascending: false })
    .order("recorded_at", { ascending: false })
    .limit(1000);
  if (error) return finFail(error);
  return NextResponse.json({ rows: await hydrateExpenses(admin, data ?? []) });
}

export async function POST(req: NextRequest) {
  const guard = await requireFinance(req, "create");
  if (!guard.ok) return guard.response;
  const { actor } = guard;

  const form = await req.formData().catch(() => null);
  if (!form) return bad("Data tidak valid");

  const parsed = parseExpenseFields((k) => {
    const v = form.get(k);
    return typeof v === "string" ? v : "";
  });
  if (!parsed.ok) return bad(parsed.error, parsed.status);
  const f = parsed.value;

  // Bukti (opsional di sini; wajib-tidaknya diputuskan database sesuai ambang pengaturan)
  const admin = getSupabaseAdmin();
  let proofPath: string | null = null;
  const file = form.get("proof");
  if (file instanceof File && file.size > 0) {
    if (file.size > MAX_PROOF_BYTES) return bad("Ukuran bukti maksimal 4 MB");
    const bytes = new Uint8Array(await file.arrayBuffer());
    const kindOfFile = sniffProof(bytes);
    if (!kindOfFile) return bad("Format bukti harus JPG, PNG, WEBP, atau PDF");

    proofPath = `expenses/${randomUUID()}.${kindOfFile.ext}`;
    const up = await admin.storage.from(PROOF_BUCKET).upload(proofPath, bytes, {
      contentType: kindOfFile.mime,
      upsert: false,
    });
    if (up.error) return finFail(up.error, "Gagal mengunggah bukti");
  }

  const settings = await loadSettings();
  const autoApprove = settings.auto_approve_own_expense && actor.caps.edit && !settings.require_separate_verifier;

  const { data: id, error } = await admin.rpc("fin_record_expense", {
    p_actor: actor.userId,
    p_actor_name: actor.name,
    p_category: f.categoryId,
    p_account: f.accountId,
    p_vendor: f.vendorId,
    p_order: f.orderId,
    p_source: "manual",
    p_source_ref: null,
    p_description: f.description,
    p_amount: f.amount,
    p_spent_at: f.spentAt,
    p_proof_path: proofPath,
    p_note: f.note,
    p_auto_approve: autoApprove,
  });

  if (error) {
    // Jangan tinggalkan file yatim bila pencatatan ditolak.
    if (proofPath) await admin.storage.from(PROOF_BUCKET).remove([proofPath]);
    return finFail(error);
  }
  const { data: row } = await admin.from("finance_expenses").select("status, expense_no").eq("id", id).maybeSingle();
  return NextResponse.json({ id, status: row?.status ?? "pending", expense_no: row?.expense_no ?? null });
}
