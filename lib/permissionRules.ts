// lib/permissionRules.ts
//
// Aturan siapa boleh memberi izin apa (murni, dipakai server /api/users dan
// tampilan tabel hak akses). Cermin trigger database di migration 019.
//
//  • Super Admin: bebas.
//  • Admin (dan role lain yang boleh mengelola user): TIDAK bisa mengubah izin
//    dirinya sendiri, dan TIDAK bisa MENAMBAH izin yang ia sendiri tidak punya
//    (mengurangi izin tetap boleh).

import type { UserPermissions } from "@/types";

type PermMap = Record<string, Record<string, boolean> | undefined>;

const asMap = (p: unknown): PermMap => ((p && typeof p === "object" ? p : {}) as PermMap);

const MODULE_LABEL: Record<string, string> = {
  dashboard: "Dashboard",
  orders: "Pesanan",
  produksi: "Produksi",
  finishing: "Finishing & QC",
  salary: "Gaji & Upah",
  keuangan: "Keuangan",
  config_harga: "Config Harga",
  logs: "Log Aktivitas",
  trash: "Sampah",
  settings: "Pengaturan",
};
const ACTION_LABEL: Record<string, string> = {
  view: "Lihat",
  create: "Buat",
  edit: "Edit",
  delete: "Hapus",
  view_all: "Akses semua pesanan",
};

export function permissionLabel(module: string, action: string): string {
  return `${MODULE_LABEL[module] ?? module} · ${ACTION_LABEL[action] ?? action}`;
}

/** Apakah `permissions` memberi izin ini? (true murni) */
export function holdsPermission(permissions: unknown, module: string, action: string): boolean {
  return asMap(permissions)[module]?.[action] === true;
}

/** Dua set izin sama persis? (modul/aksi yang tidak ada dianggap false) */
export function permissionsEqual(a: unknown, b: unknown): boolean {
  const A = asMap(a);
  const B = asMap(b);
  const modules = new Set([...Object.keys(A), ...Object.keys(B)]);
  for (const m of modules) {
    const actions = new Set([...Object.keys(A[m] ?? {}), ...Object.keys(B[m] ?? {})]);
    for (const act of actions) {
      if ((A[m]?.[act] === true) !== (B[m]?.[act] === true)) return false;
    }
  }
  return true;
}

/**
 * Izin pertama yang DITAMBAHKAN (false → true) tetapi tidak dimiliki si pemberi.
 * Mengembalikan label izinnya, atau null bila tidak ada pelanggaran.
 * `current` = izin target saat ini (user baru: nilai default).
 */
export function findPermissionEscalation(
  next: UserPermissions | unknown,
  current: UserPermissions | unknown,
  caller: UserPermissions | unknown,
): string | null {
  const N = asMap(next);
  for (const [module, actions] of Object.entries(N)) {
    for (const [action, value] of Object.entries(actions ?? {})) {
      if (value !== true) continue;
      if (holdsPermission(current, module, action)) continue; // tidak berubah
      if (!holdsPermission(caller, module, action)) return permissionLabel(module, action);
    }
  }
  return null;
}
