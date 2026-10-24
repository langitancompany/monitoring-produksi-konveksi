// GET /api/finance/invoice-settings -> pengaturan tampilan invoice (kop, rekening, tanda tangan)
// PUT /api/finance/invoice-settings -> simpan (HANYA supervisor: rekening pembayaran rawan disalahgunakan).
// Perubahan dicatat di log audit tanpa data gambar (hanya ada/tidaknya dan ukurannya).
import { NextRequest, NextResponse } from "next/server";
import { getSupabaseAdmin } from "@/lib/supabaseAdmin";
import { requireFinance, finFail, bad } from "@/lib/finance/server";
import {
  INVOICE_SETTINGS_KEY,
  readInvoiceSettings,
  sanitizeInvoiceSettings,
  summarizeInvoiceSettings,
} from "@/lib/finance/invoiceSettings";

export const dynamic = "force-dynamic";

export async function GET(req: NextRequest) {
  const guard = await requireFinance(req, "view");
  if (!guard.ok) return guard.response;

  const { data, error } = await getSupabaseAdmin()
    .from("finance_settings")
    .select("value")
    .eq("key", INVOICE_SETTINGS_KEY)
    .maybeSingle();
  if (error) return finFail(error);

  return NextResponse.json({ settings: readInvoiceSettings(data?.value) });
}

export async function PUT(req: NextRequest) {
  const guard = await requireFinance(req, "view");
  if (!guard.ok) return guard.response;
  if (!guard.actor.caps.isSupervisor) return bad("Hanya supervisor yang boleh mengubah pengaturan invoice", 403);

  const body = await req.json().catch(() => null);
  const res = sanitizeInvoiceSettings(body?.settings);
  if (!res.ok) return bad(res.error, 422);

  const admin = getSupabaseAdmin();
  const { data: prev, error: prevErr } = await admin
    .from("finance_settings")
    .select("value")
    .eq("key", INVOICE_SETTINGS_KEY)
    .maybeSingle();
  if (prevErr) return finFail(prevErr);

  const value = { ...res.value, updated_by: guard.actor.name, updated_at: new Date().toISOString() };
  const { error } = await admin
    .from("finance_settings")
    .upsert({ key: INVOICE_SETTINGS_KEY, value, updated_by: guard.actor.userId, updated_at: value.updated_at }, { onConflict: "key" });
  if (error) return finFail(error);

  // Jejak audit (tanpa gambar). Kegagalan mencatat tidak membatalkan simpan, tetapi dilaporkan ke log server.
  const { error: auditErr } = await admin.rpc("fin_audit", {
    p_actor: guard.actor.userId,
    p_actor_name: guard.actor.name,
    p_action: "settings.invoice",
    p_entity: "settings",
    p_entity_id: null,
    p_order: null,
    p_before: prev?.value ? summarizeInvoiceSettings(readInvoiceSettings(prev.value)) : null,
    p_after: summarizeInvoiceSettings(readInvoiceSettings(value)),
    p_reason: null,
  });
  if (auditErr) console.error("[finance] gagal mencatat audit pengaturan invoice", auditErr);

  return NextResponse.json({ settings: readInvoiceSettings(value) });
}
