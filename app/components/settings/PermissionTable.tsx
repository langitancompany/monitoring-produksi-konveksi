// app/components/settings/PermissionTable.tsx
// Tabel hak akses per modul (dipakai di tab Pengguna).
"use client";

import React from "react";
import { Check, Minus } from "lucide-react";
import { UserPermissions } from "@/types";

// ─── Definisi modul untuk tabel permission ───────────────────────────────────

type PermKey = keyof UserPermissions;

interface ModuleDef {
  key: PermKey;
  label: string;
  /** Kolom "Lihat" memakai field ini (default "view"). Untuk baris izin tambahan. */
  viewField?: string;
  viewLabel?: string;
  hasCreate: boolean;
  hasEdit: boolean;
  hasDelete: boolean;
  createLabel?: string;
  editLabel?: string;
  deleteLabel?: string;
}

// Daftar baris di tabel hak akses. Harus sejalan dengan UserPermissions
// (types/index.ts). Tambah modul baru: tambah satu objek di sini.
const MODULES: ModuleDef[] = [
  {
    key: "dashboard",
    label: "Dashboard",
    hasCreate: false,
    hasEdit: false,
    hasDelete: false,
  },
  {
    key: "orders",
    label: "Pesanan",
    hasCreate: true,
    hasEdit: true,
    hasDelete: true,
    createLabel: "Buat pesanan",
    editLabel: "Edit pesanan",
    deleteLabel: "Hapus pesanan",
  },
  {
    key: "orders",
    label: "Pesanan: akses semua pesanan",
    viewField: "view_all",
    viewLabel:
      "Melihat, dinotifikasi, dan mengerjakan tahap SEMUA pesanan (bukan hanya yang ditugaskan). Buat/edit/hapus tetap diatur di baris Pesanan.",
    hasCreate: false,
    hasEdit: false,
    hasDelete: false,
  },
  {
    key: "produksi",
    label: "Produksi",
    hasCreate: true,
    hasEdit: true,
    hasDelete: true,
    createLabel: "Mulai tahap produksi",
    editLabel: "Update tahap & kendala",
    deleteLabel: "Hapus file bukti",
  },
  {
    key: "finishing",
    label: "Finishing & QC",
    hasCreate: true,
    hasEdit: true,
    hasDelete: true,
    createLabel: "Reset QC",
    editLabel: "Cek QC, packing, kirim",
    deleteLabel: "Hapus file finishing",
  },
  {
    key: "salary",
    label: "Gaji & Upah",
    hasCreate: true,
    hasEdit: true,
    hasDelete: false,
    createLabel: "Cetak slip gaji",
    editLabel: "Edit data dari halaman Gaji",
  },
  {
    key: "keuangan",
    label: "Keuangan",
    hasCreate: true,
    hasEdit: true,
    hasDelete: true,
    createLabel: "Terbitkan tagihan & catat pembayaran",
    editLabel: "Verifikasi / tolak pembayaran",
    deleteLabel: "Void (batalkan) transaksi",
  },
  {
    key: "config_harga",
    label: "Config Harga",
    hasCreate: false,
    hasEdit: true,
    hasDelete: false,
    editLabel: "Edit rate gaji",
  },
  {
    key: "logs",
    label: "Log Aktivitas",
    hasCreate: false,
    hasEdit: false,
    hasDelete: false,
  },
  {
    key: "trash",
    label: "Sampah",
    hasCreate: false,
    hasEdit: false,
    hasDelete: true,
    deleteLabel: "Hapus permanen",
  },
  {
    key: "settings",
    label: "Pengaturan",
    hasCreate: true,
    hasEdit: true,
    hasDelete: true,
    createLabel: "Tambah user",
    editLabel: "Edit user",
    deleteLabel: "Hapus user",
  },
];

// ─── Helper: ambil/set nilai permission ──────────────────────────────────────

function getPermVal(
  permissions: UserPermissions,
  key: PermKey,
  field: string,
): boolean {
  const mod = permissions[key] as any;
  return mod ? !!mod[field] : false;
}

function setPermVal(
  permissions: UserPermissions,
  key: PermKey,
  field: string,
  value: boolean,
): UserPermissions {
  return {
    ...permissions,
    [key]: { ...(permissions[key] as any), [field]: value },
  };
}

// ─── Komponen: Sel tabel ─────────────────────────────────────────────────────

function PermCell({
  active,
  disabled,
  locked,
  frozen,
  tooltip,
  onChange,
}: {
  active: boolean;
  disabled?: boolean;
  /** Tampil sesuai nilai sekarang tapi tidak bisa diubah; isinya = alasan (tooltip). */
  frozen?: string;
  /** Tampil tercentang tapi tidak bisa diubah (mis. Super Admin). */
  locked?: boolean;
  tooltip?: string;
  onChange: () => void;
}) {
  if (disabled) {
    return (
      <td className="px-3 py-2.5 text-center">
        <Minus className="w-3.5 h-3.5 text-zinc-300 dark:text-zinc-700 mx-auto" />
      </td>
    );
  }
  if (frozen) {
    return (
      <td className="px-3 py-2.5 text-center" title={frozen}>
        <div
          className={`w-5 h-5 rounded-md border mx-auto flex items-center justify-center cursor-not-allowed opacity-40 ${
            active
              ? "bg-[#124540] border-[#124540]"
              : "bg-white dark:bg-zinc-800 border-zinc-300 dark:border-zinc-600"
          }`}
        >
          {active && <Check className="w-3 h-3 text-white" strokeWidth={3} />}
        </div>
      </td>
    );
  }
  if (locked) {
    return (
      <td
        className="px-3 py-2.5 text-center"
        title="Super Admin selalu punya akses ini"
      >
        <div className="w-5 h-5 rounded-md border mx-auto flex items-center justify-center bg-[#124540]/60 border-[#124540]/60 cursor-not-allowed">
          <Check className="w-3 h-3 text-white" strokeWidth={3} />
        </div>
      </td>
    );
  }
  return (
    <td className="px-3 py-2.5 text-center" title={tooltip}>
      <button
        onClick={onChange}
        className={`w-5 h-5 rounded-md border mx-auto flex items-center justify-center transition-colors duration-150 ${
          active
            ? "bg-[#124540] border-[#124540]"
            : "bg-white dark:bg-zinc-800 border-zinc-300 dark:border-zinc-600 hover:border-zinc-400 dark:hover:border-zinc-500"
        }`}
      >
        {active && <Check className="w-3 h-3 text-white" strokeWidth={3} />}
      </button>
    </td>
  );
}

// ─── Komponen: Tabel Permission ───────────────────────────────────────────────

export function PermissionTable({
  permissions,
  onChange,
  allGranted = false,
  readOnly = false,
  canGrant,
}: {
  permissions: UserPermissions;
  onChange: (updated: UserPermissions) => void;
  /** Super Admin: semua izin aktif otomatis (sama seperti pengecekan di aplikasi & database). */
  allGranted?: boolean;
  /** Tabel hanya dibaca (mis. Admin melihat izin akunnya sendiri). */
  readOnly?: boolean;
  /** Boleh menambah/mengubah izin ini? false → sel dibekukan. Dipakai agar Admin tidak memberi izin di atas miliknya. */
  canGrant?: (key: PermKey, field: string) => boolean;
}) {
  // Alasan sel dibekukan (undefined = bisa diubah)
  const freezeReason = (key: PermKey, field: string): string | undefined => {
    if (allGranted) return undefined; // ditangani `locked`
    if (readOnly) return "Anda tidak bisa mengubah izin akun Anda sendiri";
    if (canGrant && !canGrant(key, field))
      return "Anda tidak punya izin ini, jadi tidak bisa memberikannya";
    return undefined;
  };
  const toggle = (key: PermKey, field: string) => {
    const current = getPermVal(permissions, key, field);
    onChange(setPermVal(permissions, key, field, !current));
  };

  return (
    <div className="overflow-x-auto">
      <table className="w-full text-sm border-collapse">
        <thead>
          <tr className="bg-zinc-50 dark:bg-zinc-900">
            <th className="px-3 py-2.5 text-left text-[10px] font-semibold text-zinc-500 dark:text-zinc-400 uppercase tracking-[0.12em] border-b border-zinc-200 dark:border-zinc-800 w-[40%]">
              Modul / Fitur
            </th>
            <th className="px-3 py-2.5 text-center text-[10px] font-semibold text-zinc-500 dark:text-zinc-400 uppercase tracking-[0.12em] border-b border-zinc-200 dark:border-zinc-800">
              Lihat
            </th>
            <th className="px-3 py-2.5 text-center text-[10px] font-semibold text-zinc-500 dark:text-zinc-400 uppercase tracking-[0.12em] border-b border-zinc-200 dark:border-zinc-800">
              Buat
            </th>
            <th className="px-3 py-2.5 text-center text-[10px] font-semibold text-zinc-500 dark:text-zinc-400 uppercase tracking-[0.12em] border-b border-zinc-200 dark:border-zinc-800">
              Edit
            </th>
            <th className="px-3 py-2.5 text-center text-[10px] font-semibold text-zinc-500 dark:text-zinc-400 uppercase tracking-[0.12em] border-b border-zinc-200 dark:border-zinc-800">
              Hapus
            </th>
          </tr>
        </thead>
        <tbody className="divide-y divide-zinc-100 dark:divide-zinc-800">
          {MODULES.map((mod) => (
            <tr
              key={`${mod.key}-${mod.viewField ?? "view"}`}
              className="hover:bg-zinc-50 dark:hover:bg-zinc-900 transition-colors duration-150"
            >
              <td className="px-3 py-2.5">
                <span className="text-xs font-semibold text-zinc-700 dark:text-zinc-300">
                  {mod.label}
                </span>
              </td>
              <PermCell
                locked={allGranted}
                frozen={freezeReason(mod.key, mod.viewField ?? "view")}
                active={getPermVal(permissions, mod.key, mod.viewField ?? "view")}
                tooltip={mod.viewLabel ?? "Akses halaman ini"}
                onChange={() => toggle(mod.key, mod.viewField ?? "view")}
              />
              <PermCell
                locked={allGranted && mod.hasCreate}
                frozen={mod.hasCreate ? freezeReason(mod.key, "create") : undefined}
                active={
                  mod.hasCreate
                    ? getPermVal(permissions, mod.key, "create")
                    : false
                }
                disabled={!mod.hasCreate}
                tooltip={mod.createLabel}
                onChange={() => mod.hasCreate && toggle(mod.key, "create")}
              />
              <PermCell
                locked={allGranted && mod.hasEdit}
                frozen={mod.hasEdit ? freezeReason(mod.key, "edit") : undefined}
                active={
                  mod.hasEdit ? getPermVal(permissions, mod.key, "edit") : false
                }
                disabled={!mod.hasEdit}
                tooltip={mod.editLabel}
                onChange={() => mod.hasEdit && toggle(mod.key, "edit")}
              />
              <PermCell
                locked={allGranted && mod.hasDelete}
                frozen={mod.hasDelete ? freezeReason(mod.key, "delete") : undefined}
                active={
                  mod.hasDelete
                    ? getPermVal(permissions, mod.key, "delete")
                    : false
                }
                disabled={!mod.hasDelete}
                tooltip={mod.deleteLabel}
                onChange={() => mod.hasDelete && toggle(mod.key, "delete")}
              />
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
