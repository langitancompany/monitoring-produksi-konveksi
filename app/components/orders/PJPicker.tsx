// app/components/orders/PJPicker.tsx
// Pilihan Penanggung Jawab (PJ) di form Pesanan Baru & Edit Pesanan. PJ menerima bagian terbesar
// gaji produksi pesanan ini (sisanya dibagi ke anggota tim) — lihat Config Harga & docs/PRD.md §20.
// Opsional ("Belum ditentukan"); tanpa PJ/tim, gaji produksi pesanan belum bisa dibagikan.
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
      <label className={labelCls}>Penanggung jawab (PJ)</label>
      <select
        className={inputCls}
        value={value ?? ""}
        disabled={disabled}
        onChange={(e) => onChange(e.target.value || null)}
      >
        <option value="">Belum ditentukan</option>
        {produksi.length > 0 && <optgroup label="Tim Produksi">{produksi.map(opt)}</optgroup>}
        {lainnya.length > 0 && <optgroup label="Lainnya">{lainnya.map(opt)}</optgroup>}
      </select>
      <p className="mt-1 text-[11px] text-zinc-400 dark:text-zinc-500">
        PJ menerima bagian terbesar gaji produksi pesanan ini.
      </p>
    </div>
  );
}
