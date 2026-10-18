// app/components/ui/AnnouncementBanner.tsx

"use client";

import { useEffect, useState } from "react";
import { createClient } from "@/lib/supabase/client";
import { UNIT } from "@/lib/config";
import { Announcement } from "@/types";
import { X, Info, AlertTriangle, CheckCircle, Megaphone } from "lucide-react";

// Status = indikator garis + ikon/teks berwarna, bukan box warna penuh
const typeConfig = {
  info: {
    icon: Info,
    accent: "text-zinc-500 dark:text-zinc-400",
    border: "border-l-zinc-400 dark:border-l-zinc-500",
  },
  warning: {
    icon: AlertTriangle,
    accent: "text-orange-600 dark:text-orange-500",
    border: "border-l-orange-600",
  },
  success: {
    icon: CheckCircle,
    accent: "text-emerald-600 dark:text-emerald-500",
    border: "border-l-emerald-600",
  },
  update: {
    icon: Megaphone,
    accent: "text-purple-600 dark:text-purple-500",
    border: "border-l-purple-600",
  },
};

export default function AnnouncementBanner() {
  const [announcements, setAnnouncements] = useState<Announcement[]>([]);
  const [dismissed, setDismissed] = useState<string[]>([]);
  const [supabase] = useState(() => createClient());

  useEffect(() => {
    // Ambil dari localStorage supaya kalau sudah di-dismiss tidak muncul lagi
    const stored = JSON.parse(
      localStorage.getItem("dismissed_announcements") || "[]",
    );
    setDismissed(stored);

    const fetchAnnouncements = async () => {
      const { data } = await supabase
        .from("announcements")
        .select("*")
        .eq("is_active", true)
        .order("created_at", { ascending: false });

      // Filter expires_at di sisi client
      const filtered = (data || []).filter(
        (a) => !a.expires_at || new Date(a.expires_at) > new Date(),
      );
      if (filtered) setAnnouncements(filtered);
    };

    fetchAnnouncements();

    // Realtime — otomatis muncul kalau admin posting pengumuman baru
    const channel = supabase
      .channel("announcements")
      .on(
        "postgres_changes",
        { event: "*", schema: UNIT.dbSchema, table: "announcements" },
        fetchAnnouncements,
      )
      .subscribe();

    return () => {
      supabase.removeChannel(channel);
    };
  }, []);

  const handleDismiss = (id: string) => {
    const updated = [...dismissed, id];
    setDismissed(updated);
    localStorage.setItem("dismissed_announcements", JSON.stringify(updated));
  };

  const visible = announcements.filter((a) => !dismissed.includes(a.id));
  if (visible.length === 0) return null;

  return (
    <div className="space-y-2">
      {visible.map((a) => {
        const config = typeConfig[a.type];
        const Icon = config.icon;
        return (
          <div
            key={a.id}
            className={`flex items-start gap-3 p-3 md:p-4 rounded-xl border border-zinc-200 dark:border-zinc-800 border-l-2 bg-white dark:bg-zinc-950 ${config.border}`}
          >
            <Icon className={`w-4 h-4 mt-0.5 shrink-0 ${config.accent}`} />
            <div className="flex-1 min-w-0">
              <p className="text-sm font-semibold text-zinc-900 dark:text-zinc-100">
                {a.title}
              </p>
              <p className="text-xs mt-0.5 text-zinc-500 dark:text-zinc-400">
                {a.message}
              </p>
            </div>
            <button
              onClick={() => handleDismiss(a.id)}
              className="shrink-0 text-zinc-300 dark:text-zinc-600 hover:text-zinc-500 dark:hover:text-zinc-400 transition-colors duration-150"
            >
              <X className="w-4 h-4" />
            </button>
          </div>
        );
      })}
    </div>
  );
}
