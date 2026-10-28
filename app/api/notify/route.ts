// app/api/notify/route.ts
//
// Kirim notifikasi ke banyak user sekaligus (per role / semua user).
//
// KENAPA DI SERVER: policy tabel `users` hanya mengizinkan user biasa membaca
// baris dirinya sendiri, jadi pencarian penerima dari browser untuk user
// non-admin hasilnya kosong (notifikasi tidak terkirim ke role lain).
// Di sini penerima dicari dengan service role, lalu notifikasi disimpan
// (lonceng) dan push FCM dikirim.
//
// Body: { title, message, orderId?, roles?: string[] | all?: true }

import { NextResponse, type NextRequest } from "next/server";
import { requireUser } from "@/lib/apiAuth";
import { getSupabaseAdmin } from "@/lib/supabaseAdmin";
import { sendPushToUser } from "@/lib/pushServer";
import { ROLE_OPTIONS } from "@/lib/roles";

// Sama dengan is_staff() di database: hanya staf yang boleh memicu notifikasi.
const STAFF_ROLES = ["admin", "super_admin", "manager", "produksi", "qc"];
const VALID_ROLES = new Set<string>(ROLE_OPTIONS.map((r) => r.value));
const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export async function POST(request: NextRequest) {
  const guard = await requireUser(request, STAFF_ROLES);
  if (!guard.ok) return guard.response;

  let payload: any;
  try {
    payload = await request.json();
  } catch {
    return NextResponse.json({ error: "Body tidak valid" }, { status: 400 });
  }

  const title = typeof payload?.title === "string" ? payload.title.trim() : "";
  const message = typeof payload?.message === "string" ? payload.message.trim() : "";
  const orderId =
    typeof payload?.orderId === "string" && UUID_RE.test(payload.orderId)
      ? payload.orderId
      : undefined;

  if (!title || !message || title.length > 120 || message.length > 500) {
    return NextResponse.json(
      { error: "title/message wajib diisi (maks 120 / 500 karakter)" },
      { status: 400 }
    );
  }

  const toAll = payload?.all === true;
  const roles: string[] = Array.isArray(payload?.roles) ? payload.roles : [];
  // Role harus dari daftar yang dikenal (juga mencegah karakter aneh masuk ke filter query)
  if (!toAll && (roles.length === 0 || !roles.every((r) => VALID_ROLES.has(r)))) {
    return NextResponse.json({ error: "roles tidak valid" }, { status: 400 });
  }

  try {
    const db = getSupabaseAdmin();

    let query = db.from("users").select("id");
    if (!toAll) {
      const list = roles.join(",");
      // Cek kolom `role` (utama) DAN `roles` (array, role ganda)
      query = query.or(`role.in.(${list}),roles.ov.{${list}}`);
    }
    const { data: users, error: fetchError } = await query;
    if (fetchError) {
      console.error("❌ /api/notify: gagal mencari penerima:", fetchError);
      return NextResponse.json({ error: "Database error" }, { status: 500 });
    }
    if (!users || users.length === 0) {
      return NextResponse.json({ success: true, recipients: 0 });
    }

    const rows = users.map((u: any) => ({
      user_id: u.id,
      title,
      message,
      order_id: orderId ?? null,
      is_read: false,
    }));
    const { error: insertError } = await db.from("notifications").insert(rows);
    if (insertError) {
      console.error("❌ /api/notify: gagal menyimpan notifikasi:", insertError);
      return NextResponse.json({ error: "Database error" }, { status: 500 });
    }

    // Push gagal tidak masalah — notifikasi lonceng sudah tersimpan
    await Promise.allSettled(
      users.map((u: any) => sendPushToUser({ userId: u.id, title, body: message, orderId }))
    );

    return NextResponse.json({ success: true, recipients: users.length });
  } catch (error: any) {
    console.error("🔥 /api/notify:", error);
    return NextResponse.json({ error: "Internal Server Error" }, { status: 500 });
  }
}
