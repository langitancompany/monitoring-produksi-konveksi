// app/components/orders/TeamPicker.tsx
// Pilihan tim pengerjaan di form Pesanan Baru & Edit Pesanan. Setelah dipilih,
// tampil kartu kecil berisi avatar & nama anggotanya supaya admin yakin memilih
// tim yang benar. Pilihan tim opsional ("Belum ditentukan").
"use client";

import React from "react";
import type { UserData } from "@/types";
import type { TeamData } from "@/types/team";
import { teamMembers } from "@/lib/teams";
import TeamAvatars from "@/app/components/ui/TeamAvatars";
import { inputCls, labelCls } from "@/app/components/settings/settingsShared";

interface Props {
  value: string | null;
  onChange: (teamId: string | null) => void;
  /** tim yang boleh dipilih (aktif; di Edit ditambah tim pesanan yang sekarang walau nonaktif) */
  teams: TeamData[];
  users: UserData[];
  disabled?: boolean;
}

export default function TeamPicker({ value, onChange, teams, users, disabled }: Props) {
  const selected = teams.find((t) => t.id === value) ?? null;
  const members = teamMembers(selected, users);

  return (
    <div>
      <label className={labelCls}>Tim pengerjaan</label>
      <select
        className={inputCls}
        value={value ?? ""}
        disabled={disabled}
        onChange={(e) => onChange(e.target.value || null)}
      >
        <option value="">Belum ditentukan</option>
        {teams.map((t) => (
          <option key={t.id} value={t.id}>
            {t.name}
            {!t.is_active ? " (nonaktif)" : ""}
          </option>
        ))}
      </select>

      {teams.length === 0 && (
        <p className="mt-1 text-[11px] text-zinc-400 dark:text-zinc-500">
          Belum ada tim. Buat dulu di Pengaturan → Tim.
        </p>
      )}

      {selected && (
        <div className="mt-2 flex items-center gap-3 rounded-md border border-zinc-200 dark:border-zinc-800 px-3 py-2.5">
          <TeamAvatars members={members} max={6} size="sm" />
          <p className="text-[11px] text-zinc-500 dark:text-zinc-400 truncate min-w-0">
            {members.length > 0
              ? `${members.length} anggota: ${members.map((m) => m.name.split(" ")[0]).join(", ")}`
              : ""}
          </p>
        </div>
      )}
    </div>
  );
}
