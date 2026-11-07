// lib/finance/expenseEntry.ts
// Logika catat pengeluaran / tambah vendor / cari pesanan yang dipakai DUA jalur API:
//   - /api/finance/*      (menu Keuangan, dijaga requireFinance "maker")
//   - /api/pengeluaran/*  (aplikasi terpisah, dijaga requireExpenseEntry)
// Sengaja satu sumber supaya aturan (bukti, persetujuan, audit) tidak bisa berbeda antar jalur. SERVER ONLY.
import { NextRequest, NextResponse } from "next/server";
import { randomUUID } from "crypto";
import { getSupabaseAdmin } from "@/lib/supabaseAdmin";
import {
  finFail, bad, loadSettings, sniffProof, PROOF_BUCKET, MAX_PROOF_BYTES, type FinActor,
} from "@/lib/finance/server";
import { parseExpenseFields, sanitizeLookupQuery } from "@/lib/finance/expenses";
import type { OrderLookupRow } from "@/lib/finance/types";

/** Catat pengeluaran (multipart) + bukti. Langsung disetujui hanya bila pencatat juga Approver dan pengaturan mengizinkan. */
export async function recordExpenseFromRequest(req: NextRequest, actor: FinActor) {
  const form = await req.formData().catch(() => null);
  if (!form) return bad("Data tidak valid");

  const parsed = parseExpenseFields((k) => {
    const v = form.get(k);
    return typeof v === "string" ? v : "";
  });
  if (!parsed.ok) return bad(parsed.error, parsed.status);
  const f = parsed.value;

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
  const autoApprove = settings.auto_approve_own_expense && actor.caps.approver && !settings.require_separate_verifier;

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

/** Tambah vendor/pemasok (tercatat di audit). */
export async function createVendorFromRequest(req: NextRequest, actor: FinActor) {
  const body = await req.json().catch(() => null);
  const name = typeof body?.name === "string" ? body.name.trim().replace(/\s+/g, " ") : "";
  const phone = typeof body?.phone === "string" ? body.phone.trim().slice(0, 30) : "";
  if (name.length < 2 || name.length > 80) return bad("Nama vendor 2–80 karakter");

  const admin = getSupabaseAdmin();
  const { data, error } = await admin
    .from("finance_vendors")
    .insert({ name, phone: phone || null })
    .select("id, name, phone")
    .single();

  if (error) {
    if (error.code === "23505") return bad("Vendor dengan nama itu sudah ada", 422);
    return finFail(error);
  }

  await admin.rpc("fin_audit", {
    p_actor: actor.userId,
    p_actor_name: actor.name,
    p_action: "vendor.create",
    p_entity: "vendor",
    p_entity_id: data.id,
    p_order: null,
    p_before: null,
    p_after: { name },
    p_reason: null,
  });
  return NextResponse.json({ vendor: data });
}

/** Vendor aktif (hanya id, nama, telepon). */
export async function listVendors() {
  const { data, error } = await getSupabaseAdmin()
    .from("finance_vendors")
    .select("id, name, phone")
    .eq("is_active", true)
    .order("name")
    .limit(1000);
  if (error) return finFail(error);
  return NextResponse.json({ vendors: data ?? [] });
}

/** Cari pesanan (kode produksi / nama pemesan) untuk menautkan biaya langsung. */
export async function lookupOrders(req: NextRequest) {
  const q = sanitizeLookupQuery(req.nextUrl.searchParams.get("q"));
  if (!q) return NextResponse.json({ rows: [] });

  const admin = getSupabaseAdmin();
  const base = () =>
    admin.from("orders").select("id, kode_produksi, nama_pemesan").is("deleted_at", null).limit(10);
  const [byKode, byNama] = await Promise.all([
    base().ilike("kode_produksi", `%${q}%`),
    base().ilike("nama_pemesan", `%${q}%`),
  ]);
  const err = byKode.error || byNama.error;
  if (err) return finFail(err);

  const seen = new Map<string, OrderLookupRow>();
  for (const r of [...(byKode.data ?? []), ...(byNama.data ?? [])]) seen.set(r.id, r as OrderLookupRow);
  const rows = [...seen.values()].sort((a, b) => a.kode_produksi.localeCompare(b.kode_produksi)).slice(0, 10);
  return NextResponse.json({ rows });
}
