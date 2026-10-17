// app/components/settings/tabs/NotificationsTab.tsx
// Tab Notifikasi — notifikasi push.
// (Pengaturan WhatsApp Bot milik app Sablon belum dibawa ke sini.)
"use client";

import React from "react";
import { Bell } from "lucide-react";
import { requestAndRegisterFCM } from "@/app/components/misc/FCMManager";

export default function NotificationsTab() {
  return (
    <div className="space-y-4">
      <div className="bg-white dark:bg-zinc-950 rounded-xl border border-zinc-200 dark:border-zinc-800 p-5 md:p-6 flex items-center justify-between gap-4 flex-wrap">
        <div>
          <h2 className="text-base font-semibold tracking-tight text-zinc-900 dark:text-zinc-100">
            Notifikasi Push
          </h2>
          <p className="text-xs text-zinc-500 dark:text-zinc-400 mt-0.5">
            Aktifkan agar perangkat ini menerima notifikasi dari aplikasi.
          </p>
        </div>
        <button
          onClick={async () => {
            const result = await requestAndRegisterFCM();
            const pesan =
              result === "granted"
                ? "Notifikasi push aktif di perangkat ini."
                : result === "denied"
                  ? "Izin notifikasi ditolak. Aktifkan lewat pengaturan situs di browser."
                  : "Browser ini tidak mendukung notifikasi push.";
            alert(pesan);
          }}
          className="flex items-center gap-2 bg-[#124540] hover:bg-[#0d332f] text-white px-4 py-2 rounded-md text-sm font-semibold transition-colors duration-150"
        >
          <Bell className="w-4 h-4" />
          Aktifkan Notifikasi Push
        </button>
      </div>
    </div>
  );
}
