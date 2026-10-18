// app/components/orders/PJPicker.tsx
// Pilihan Penanggung Jawab (PJ) di form Pesanan Baru & Edit Pesanan. WAJIB diisi (keputusan pemilik,
// 19 Okt 2026). PJ digaji dengan rate "Gaji PJ" di Config Harga — lihat docs/PRD.md §20.
"use client";

import React, { useMemo } from "react";
import type { UserData } from "@/types";
import { hasRole, roleLabel, getUserRoles } from "@/lib/roles";
import { inputCls, labelCls } from "@/app/components/settings/settingsShared";

interface Props {
  value: string | null;
  onChange: (userId: string | null) => void;
  users: UserData[];
  disabled?: boolean;
}

export default function PJPicker({ value, onChange, users, disabled }: Props) {
  // User ber-role Produksi lebih dulu (kandidat utama PJ), lalu lainnya — semua tetap bisa dipilih.
  const { produksi, lainnya } = useMemo(() => {
    const sorted = [...users].sort((a, b) => a.name.localeCompare(b.name, "id"));
    return {
      produksi: sorted.filter((u) => hasRole(u, "produksi")),
      lainnya: sorted.filter((u) => !hasRole(u, "produksi")),
    };
  }, [users]);

  const opt = (u: UserData) => (
    <option key={u.id} value={u.id}>
      {u.name} ({getUserRoles(u).map(roleLabel).join(", ") || u.role})
    </option>
  );

  return (
    <div>
      <label className={labelCls}>Penanggung jawab (PJ) *</label>
      <select
        required
        className={inputCls}
        value={value ?? ""}
        disabled={disabled}
        onChange={(e) => onChange(e.target.value || null)}
      >
        <option value="">Pilih penanggung jawab…</option>
        {produksi.length > 0 && <optgroup label="Tim Produksi">{produksi.map(opt)}</optgroup>}
        {lainnya.length > 0 && <optgroup label="Lainnya">{lainnya.map(opt)}</optgroup>}
      </select>
      <p className="mt-1 text-[11px] text-zinc-400 dark:text-zinc-500">
        PJ digaji dengan rate Gaji PJ (Config Harga) dan ikut menggarap pcs bersama anggota tim.
      </p>
    </div>
  );
}
