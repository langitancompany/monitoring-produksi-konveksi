// lib/finance/caps.ts
// Hak akses menu Keuangan (aman dipakai di browser maupun server).
//
// Pemetaan permission `keuangan` (tabel Pengguna di Pengaturan):
//   view   -> melihat tagihan, transaksi & laporan
//   create -> menerbitkan/merevisi tagihan & mencatat pembayaran
//   edit   -> memverifikasi / menolak pembayaran
//   delete -> void (koreksi) transaksi
// Supervisor memiliki semua hak (di Sablon namanya Super Admin). UI hanya memakai ini untuk
// menampilkan tombol; penegakan sebenarnya ada di server (requireFinance) dan database.

export type FinAction = "view" | "create" | "edit" | "delete";
export type FinCaps = Record<FinAction, boolean> & {
  /** supervisor: boleh melihat log audit & mengubah pengaturan keuangan */
  isSupervisor: boolean;
};

type PermLike = Partial<Record<FinAction, boolean>> | null | undefined;

export function resolveFinanceCaps(
  user: { role?: string | null; roles?: string[] | null } | null | undefined,
  perm: PermLike,
): FinCaps {
  const isSupervisor =
    user?.role === "supervisor" || (Array.isArray(user?.roles) && user.roles.includes("supervisor"));
  const p = perm ?? {};
  const create = isSupervisor || p.create === true;
  const edit = isSupervisor || p.edit === true;
  const del = isSupervisor || p.delete === true;
  const view = isSupervisor || p.view === true || create || edit || del;
  return { view, create, edit, delete: del, isSupervisor };
}
