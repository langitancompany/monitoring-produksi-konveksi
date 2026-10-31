// types/index.ts
//
// Tipe & hak akses yang dipakai bersama. Hanya hal UMUM yang dibawa dari
// aplikasi Sablon (user, hak akses, pengumuman). Tipe pesanan/produksi
// khusus konveksi dibuat sendiri di sini nanti (mis. `Order`, `ProductionStep`).

export type UserRole =
  | "admin"
  | "produksi"
  | "qc"
  | "manager"
  | "super_admin"
  | "designer";

// ─── Bentuk hak akses per modul ──────────────────────────────────────────────

interface ModuleFull {
  view: boolean;
  create: boolean;
  edit: boolean;
  delete: boolean;
}
/** Pesanan: izin biasa + `view_all` (akses ke SEMUA pesanan, bukan hanya yang ditugaskan). */
interface ModuleOrders extends ModuleFull {
  view_all: boolean;
}
/**
 * Keuangan: `view` + `delete` (void) + dua peran terpisah.
 *  - maker    : menerbitkan/merevisi tagihan & mencatat pembayaran/pengeluaran
 *  - approver : memverifikasi/menolak pembayaran & pengeluaran (+ laporan)
 * Kolom lama `create`/`edit` tidak dipakai lagi (dibaca hanya sebagai cadangan
 * untuk user lama yang belum punya `maker`/`approver`; lihat resolvePermissions).
 */
interface ModuleKeuangan {
  view: boolean;
  maker: boolean;
  approver: boolean;
  delete: boolean;
}
interface ModuleView {
  view: boolean;
}
interface ModuleViewCreateEdit {
  view: boolean;
  create: boolean;
  edit: boolean;
}
interface ModuleViewEdit {
  view: boolean;
  edit: boolean;
}
interface ModuleTrash {
  view: boolean;
  delete: boolean;
}

// ─── Definisi Hak Akses ──────────────────────────────────────────────────────
// CARA MENAMBAH MODUL BARU (mis. "gudang"):
//   1. tambah key di sini + di DEFAULT_PERMISSIONS di bawah
//   2. tambah satu objek di MODULE_DEFS — lib/permissionModules.ts
//   3. tambah menu di Sidebar — app/components/layout/Sidebar.tsx
//   4. tambah id tab di lib/tabs.ts dan render-nya di app/page.tsx
// User lama otomatis dapat nilai default modul baru (lihat resolvePermissions).
//
// Modul di bawah adalah KERANGKA untuk konveksi. Yang BENAR-BENAR sudah punya
// halaman hanya `dashboard` dan `settings`; sisanya baru slot hak akses yang
// siap dipakai begitu halamannya dibuat (atau hapus kalau tidak diperlukan).

export interface UserPermissions {
  dashboard: ModuleView;
  orders: ModuleOrders;
  produksi: ModuleFull;
  finishing: ModuleFull;
  salary: ModuleViewCreateEdit;
  keuangan: ModuleKeuangan;
  config_harga: ModuleViewEdit;
  logs: ModuleView;
  trash: ModuleTrash;
  settings: ModuleFull;
}

export const DEFAULT_PERMISSIONS: UserPermissions = {
  dashboard: { view: true },
  orders: { view: true, create: false, edit: false, delete: false, view_all: false },
  produksi: { view: true, create: false, edit: false, delete: false },
  finishing: { view: true, create: false, edit: false, delete: false },
  salary: { view: false, create: false, edit: false },
  keuangan: { view: false, maker: false, approver: false, delete: false },
  config_harga: { view: false, edit: false },
  logs: { view: false },
  trash: { view: false, delete: false },
  settings: { view: false, create: false, edit: false, delete: false },
};

/**
 * Normalisasi `permissions` yang dibaca dari database.
 *
 * Tiap modul digabung dengan nilai default-nya, jadi:
 *  - user lama yang belum punya modul baru tidak error (dapat default),
 *  - key lama yang sudah tidak ada di aplikasi ini (mis. 'merchandise' dari
 *    Sablon) dibuang, tidak ikut tersimpan lagi.
 */
export function resolvePermissions(
  raw?: Partial<Record<string, unknown>> | null,
): UserPermissions {
  const out = {} as Record<string, unknown>;
  for (const key of Object.keys(DEFAULT_PERMISSIONS)) {
    out[key] = {
      ...(DEFAULT_PERMISSIONS as unknown as Record<string, object>)[key],
      ...(((raw as Record<string, object> | null | undefined)?.[key]) ?? {}),
    };
  }
  // User lama (sebelum ada Maker/Approver): create → maker, edit → approver,
  // supaya akses mereka tidak hilang. Hanya berlaku bila kunci barunya belum tertulis.
  const rawK = (raw as Record<string, Record<string, unknown>> | null | undefined)?.keuangan;
  if (rawK) {
    const k = out.keuangan as Record<string, unknown>;
    if (typeof rawK.maker !== "boolean") k.maker = rawK.create === true;
    if (typeof rawK.approver !== "boolean") k.approver = rawK.edit === true;
    delete k.create;
    delete k.edit;
  }
  return out as unknown as UserPermissions;
}

// ─── User ────────────────────────────────────────────────────────────────────

export interface UserData {
  id: string;
  /** email login (akun Supabase Auth); tidak bisa diubah setelah dibuat */
  username: string;
  /** hanya dipakai di form; TIDAK disimpan di tabel users dan tidak dimuat ke browser */
  password?: string;
  name: string;
  /** role utama (untuk pengecekan akses `role === 'super_admin'` dst) */
  role: UserRole;
  /** semua role yang dipilih (boleh lebih dari satu); kosong = [role]. Lihat lib/roles.ts */
  roles?: string[] | null;
  permissions: UserPermissions;
  address?: string;
  dob?: string;
  avatar_url?: string;
  /** nomor WhatsApp (08xx / 62xx) */
  no_wa?: string | null;
}

// ─── Pengumuman ──────────────────────────────────────────────────────────────

export interface Announcement {
  id: string;
  title: string;
  message: string;
  type: "info" | "warning" | "success" | "update";
  is_active: boolean;
  created_by?: string;
  created_at: string;
  expires_at?: string | null;
}
