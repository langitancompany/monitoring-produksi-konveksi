// lib/inventory/caps.ts
//
// Hak akses menu Stok Barang Jadi (aman dipakai di browser maupun server). PRD-inventori §11.
//
//   view  -> membuka menu, melihat stok, daftar verifikasi, dan riwayat
//   edit  -> (label: "Verifikasi stok masuk") mengisi dan menyimpan verifikasi
// Super Admin memiliki semua hak. Punya `edit` otomatis juga bisa melihat.
// UI hanya memakai ini untuk menampilkan tombol; penegakan sebenarnya ada di server (requireInventori).

import type { InventoryCaps } from "./types";

type PermLike = { view?: boolean; edit?: boolean } | null | undefined;

export type InvAction = "view" | "verify";

export function resolveInventoryCaps(
  user: { role?: string | null; roles?: string[] | null } | null | undefined,
  perm: PermLike,
): InventoryCaps {
  const isSuperAdmin =
    user?.role === "super_admin" || (Array.isArray(user?.roles) && user.roles.includes("super_admin"));
  const verify = isSuperAdmin || perm?.edit === true;
  const view = isSuperAdmin || perm?.view === true || verify;
  return { view, verify, isSuperAdmin };
}
