// app/components/ui/TeamAvatars.tsx
//
// Deretan avatar anggota tim (saling menumpuk). Dipakai kartu tim di
// Pengaturan, pilihan tim di form pesanan, dan Detail Pesanan.
// Melebihi `max` → sisanya jadi bulatan "+N". Foto kosong/gagal → inisial.
"use client";

import React from "react";
import UserAvatar from "@/app/components/ui/UserAvatar";
import { initialsOf } from "@/lib/teams";

interface Member {
  id: string;
  name: string;
  avatar_url?: string | null;
}

interface Props {
  members: Member[];
  /** jumlah avatar yang ditampilkan sebelum diringkas jadi "+N" */
  max?: number;
  size?: "sm" | "md";
}

const SIZE = {
  sm: { box: "w-7 h-7", text: "text-[10px]" },
  md: { box: "w-9 h-9", text: "text-xs" },
} as const;

export default function TeamAvatars({ members, max = 8, size = "md" }: Props) {
  const s = SIZE[size];
  const shown = members.slice(0, max);
  const extra = members.length - shown.length;
  const ring = "ring-2 ring-white dark:ring-zinc-950";

  if (members.length === 0) {
    return <span className="text-xs text-zinc-400 dark:text-zinc-500">Belum ada anggota</span>;
  }

  return (
    <div className="flex items-center -space-x-2" aria-label={`${members.length} anggota`}>
      {shown.map((m) => (
        // title = nama muncul saat kursor di atas avatar
        <span key={m.id} title={m.name} className="inline-flex">
          <UserAvatar
            src={m.avatar_url}
            alt={m.name}
            fallback={initialsOf(m.name)}
            className={`${s.box} ${s.text} ${ring} shrink-0 font-semibold bg-zinc-100 dark:bg-zinc-800 text-zinc-600 dark:text-zinc-300`}
          />
        </span>
      ))}
      {extra > 0 && (
        <span
          title={members.slice(max).map((m) => m.name).join(", ")}
          className={`${s.box} ${s.text} ${ring} shrink-0 inline-flex items-center justify-center rounded-full font-semibold font-mono tabular-nums bg-[#124540] text-white`}
        >
          +{extra}
        </span>
      )}
    </div>
  );
}
