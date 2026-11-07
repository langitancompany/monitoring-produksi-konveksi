// GET /api/inventori/meta -> hak pengguna di menu Stok Barang Jadi + jumlah catatan menunggu verifikasi.
// Jumlah menunggu dipakai untuk lencana menu dan hanya dihitung untuk pemegang izin Verifikasi.
import { NextRequest, NextResponse } from "next/server";
import { requireInventori, invFail, countPending } from "@/lib/inventory/server";
import type { InventoryMeta } from "@/lib/inventory/types";

export const dynamic = "force-dynamic";

export async function GET(req: NextRequest) {
  const guard = await requireInventori(req, "view");
  if (!guard.ok) return guard.response;

  try {
    const body: InventoryMeta = {
      caps: guard.actor.caps,
      pending_count: guard.actor.caps.verify ? await countPending() : 0,
      user_id: guard.actor.userId,
    };
    return NextResponse.json(body);
  } catch (e) {
    return invFail(e as { message?: string; code?: string });
  }
}
