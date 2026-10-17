// app/components/dashboard/Dashboard.tsx
//
// Dashboard awal (kerangka). Ganti isinya dengan ringkasan produksi konveksi
// begitu modul pesanan dibuat. Dua bagian di sini sengaja dibiarkan karena
// berlaku untuk semua unit: banner pengumuman dan banner "ada pembaruan".
"use client";

import React from "react";
import { UserData } from "@/types";
import { useUpdateCheck } from "@/hooks/useUpdateCheck";
import UpdateBanner from "@/app/components/dashboard/UpdateBanner";
import AnnouncementBanner from "@/app/components/ui/AnnouncementBanner";

interface DashboardProps {
  currentUser: UserData;
}

export default function Dashboard({ currentUser }: DashboardProps) {
  const { hasUpdate, updateInfo, applyUpdate, dismissUpdate } = useUpdateCheck({
    enableServiceWorker: false,
  });

  return (
    <div className="space-y-4 md:space-y-5">
      {hasUpdate && updateInfo && (
        <UpdateBanner
          updateInfo={updateInfo}
          onUpdate={applyUpdate}
          onDismiss={dismissUpdate}
        />
      )}

      <AnnouncementBanner />

      <div className="bg-white dark:bg-zinc-950 rounded-xl border border-zinc-200 dark:border-zinc-800 p-6 md:p-8">
        <p className="text-[10px] font-semibold text-zinc-500 dark:text-zinc-400 uppercase tracking-[0.14em]">
          Konveksi
        </p>
        <h2 className="mt-1 text-xl md:text-2xl font-semibold tracking-tight text-zinc-900 dark:text-zinc-100">
          Selamat datang, {currentUser.name}
        </h2>
        <p className="mt-2 text-sm text-zinc-500 dark:text-zinc-400 max-w-xl leading-relaxed">
          Kerangka aplikasi sudah siap: login, pengguna &amp; hak akses,
          pengumuman, notifikasi, dan backup. Ringkasan produksi akan tampil di
          sini setelah modul pesanan konveksi dibuat.
        </p>
      </div>
    </div>
  );
}
