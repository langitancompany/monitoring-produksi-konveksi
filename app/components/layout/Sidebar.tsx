// app/components/layout/Sidebar.tsx
"use client";

import React, { memo } from "react";
import {
  Home,
  Settings,
  Info,
  X,
  LogOut,
  Shirt,
  Scissors,
  CheckCircle2,
  CalendarDays,
  ClipboardList,
  ScrollText,
  Trash2,
  Wallet,
  Tags,
  Landmark,
} from "lucide-react";
import { UserData } from "@/types";
import { getUserRoles, roleLabel } from "@/lib/roles";
import { APP_INFO } from "@/lib/changelog";
import ThemedLogo from "@/app/components/ui/ThemedLogo";

interface SidebarProps {
  sidebarOpen: boolean;
  setSidebarOpen: (open: boolean) => void;
  currentUser: UserData;
  activeTab: string;
  handleNav: (tab: any) => void;
  onLogout: () => void;
  onOpenProfile: () => void;
}

export default function Sidebar({
  sidebarOpen,
  setSidebarOpen,
  currentUser,
  activeTab,
  handleNav,
  onLogout,
  onOpenProfile,
}: SidebarProps) {
  const p = currentUser.permissions;

  // ─── DAFTAR MENU ───────────────────────────────────────────────────────────
  // Tambah menu baru: tambah satu objek di `items` grup yang sesuai.
  //   id      → harus ada di lib/tabs.ts dan dirender di app/page.tsx
  //   icon    → ikon dari lucide-react (import di atas)
  //   visible → hak akses, mis. p?.orders?.view
  const menuGroups = [
    {
      title: "UTAMA",
      items: [
        {
          id: "dashboard",
          label: "Dashboard",
          icon: Home,
          visible: p?.dashboard?.view,
        },
        {
          id: "orders_utama",
          label: "Pesanan Utama",
          icon: Shirt,
          visible: p?.orders?.view,
        },
        {
          id: "orders_lain",
          label: "Pesanan Non-Utama",
          icon: Scissors,
          visible: p?.orders?.view,
        },
        {
          id: "completed_orders",
          label: "Pesanan Selesai",
          icon: CheckCircle2,
          visible: p?.orders?.view,
        },
        {
          id: "calendar",
          label: "Kalender",
          icon: CalendarDays,
          visible: p?.orders?.view,
        },
        {
          id: "meeting_notes",
          label: "Catatan Rapat",
          icon: ClipboardList,
          visible: p?.orders?.view,
        },
      ],
    },
    {
      title: "GAJI & HARGA",
      items: [
        {
          id: "salary",
          label: "Gaji & Upah",
          icon: Wallet,
          visible: p?.salary?.view,
        },
        {
          id: "config_harga",
          label: "Config Harga",
          icon: Tags,
          visible: p?.config_harga?.view,
        },
      ],
    },
    {
      title: "KEUANGAN",
      items: [
        {
          id: "keuangan",
          label: "Keuangan",
          icon: Landmark,
          visible: p?.keuangan?.view,
        },
      ],
    },
    {
      title: "LAINNYA",
      items: [
        {
          id: "logs",
          label: "Log Aktivitas",
          icon: ScrollText,
          visible: p?.logs?.view,
        },
        {
          id: "trash",
          label: "Sampah",
          icon: Trash2,
          visible: p?.trash?.view,
        },
        {
          id: "settings",
          label: "Pengaturan Admin",
          icon: Settings,
          visible: p?.settings?.view,
        },
        { id: "about", label: "Tentang App", icon: Info, visible: true },
      ],
    },
  ];

  // Hanya tampilkan grup yang punya minimal satu menu yang boleh diakses,
  // supaya judul grup (mis. "KEUANGAN") tidak muncul sendirian tanpa isi.
  const visibleGroups = menuGroups
    .map((group) => ({
      ...group,
      items: group.items.filter((item) => item.visible),
    }))
    .filter((group) => group.items.length > 0);

  return (
    <>
      {sidebarOpen && (
        <div
          className="fixed inset-0 z-40 bg-zinc-950/30 dark:bg-zinc-950/60 md:hidden transition-opacity duration-150"
          onClick={() => setSidebarOpen(false)}
          style={{ WebkitTapHighlightColor: "transparent" }}
        />
      )}

      <aside
        className={`
        fixed md:static inset-y-0 left-0 z-50 w-64
        bg-white dark:bg-zinc-950 border-r border-zinc-200 dark:border-zinc-800
        flex flex-col transition-transform duration-300 ease-out
        ${sidebarOpen ? "translate-x-0" : "-translate-x-full"} md:translate-x-0
      `}
      >
        {/* Header */}
        <div className="h-28 md:h-16 flex items-center px-6 md:px-6 border-b border-zinc-200 dark:border-zinc-800">
          <div className="flex items-center gap-3">
            <div className="w-12 h-12 md:w-9 md:h-9 rounded-xl flex items-center justify-center overflow-hidden">
              <ThemedLogo alt="Logo" className="w-full h-full object-contain" />
            </div>
            <div className="flex flex-col">
              <h1 className="font-semibold text-xl md:text-lg tracking-tight leading-none">
                <span className="text-zinc-900 dark:text-white">Langitan</span>
                <span className="text-[#49BFB4]">.co</span>
              </h1>
              <div className="flex flex-col mt-1 md:mt-0.5 md:flex-row md:items-center md:gap-1.5">
                <span className="text-[10px] font-semibold text-zinc-500 dark:text-zinc-400 tracking-[0.14em] uppercase">
                  SuperApp
                </span>
                <span className="text-[9px] font-mono text-zinc-400 dark:text-zinc-600 tracking-tight">
                  {APP_INFO.version}
                </span>
              </div>
            </div>
          </div>
          <button
            onClick={() => setSidebarOpen(false)}
            className="md:hidden ml-auto text-zinc-400 hover:text-zinc-600 dark:hover:text-zinc-200 transition-colors duration-150"
            style={{ WebkitTapHighlightColor: "transparent" }}
          >
            <X className="w-6 h-6" />
          </button>
        </div>

        {/* Menu */}
        <div className="flex-1 overflow-y-auto px-4 py-2 space-y-6 md:space-y-3 custom-scrollbar">
          {visibleGroups.map((group) => (
            <div key={group.title}>
              <h3 className="text-[10px] font-semibold text-zinc-400 dark:text-zinc-500 uppercase tracking-[0.14em] mb-3 md:mb-1 px-3">
                {group.title}
              </h3>
              <div className="space-y-1 md:space-y-0.5">
                {group.items.map((item) => (
                  <MenuItemMemo
                    key={item.id}
                    item={item}
                    isActive={activeTab === item.id}
                    onClick={() => handleNav(item.id)}
                  />
                ))}
              </div>
            </div>
          ))}
        </div>

        <ProfileCardDesktopMemo
          currentUser={currentUser}
          onOpenProfile={onOpenProfile}
          onLogout={onLogout}
        />
      </aside>
    </>
  );
}

// ─── Memoized sub-components ─────────────────────────────────────────────────

const MenuItemMemo = memo(
  ({
    item,
    isActive,
    onClick,
  }: {
    item: any;
    isActive: boolean;
    onClick: () => void;
  }) => (
    <button
      onClick={onClick}
      className={`w-full flex items-center gap-2 px-3 py-2 md:py-1.5 text-sm md:text-[13px] font-semibold rounded-xl transition-colors duration-150 ${
        isActive
          ? "bg-[#124540] text-white"
          : "text-zinc-500 dark:text-zinc-400 hover:bg-zinc-50 dark:hover:bg-zinc-900 hover:text-zinc-900 dark:hover:text-zinc-200"
      }`}
      style={{ WebkitTapHighlightColor: "transparent" }}
    >
      <item.icon
        className={`w-3.5 h-3.5 ${isActive ? "text-white" : "text-zinc-400 dark:text-zinc-500"}`}
      />
      {item.label}
    </button>
  ),
  (prev, next) =>
    prev.isActive === next.isActive && prev.item.id === next.item.id,
);
MenuItemMemo.displayName = "MenuItemMemo";

const ProfileCardDesktopMemo = memo(
  ({
    currentUser,
    onOpenProfile,
    onLogout,
  }: {
    currentUser: UserData;
    onOpenProfile: () => void;
    onLogout: () => void;
  }) => (
    <div className="p-3 border-t border-zinc-200 dark:border-zinc-800 hidden md:block mt-auto">
      <div className="bg-zinc-50 dark:bg-zinc-900 rounded-xl p-3 border border-zinc-200 dark:border-zinc-800">
        <div className="flex items-center gap-3 mb-2.5">
          <div className="w-9 h-9 rounded-full bg-white dark:bg-zinc-800 border border-zinc-200 dark:border-zinc-700 flex items-center justify-center text-zinc-700 dark:text-zinc-200 font-semibold overflow-hidden shrink-0">
            {currentUser.avatar_url ? (
              <img
                src={currentUser.avatar_url}
                alt="Profile"
                className="w-full h-full object-cover"
                loading="lazy"
              />
            ) : (
              currentUser.name.charAt(0)
            )}
          </div>
          <div className="flex-1 min-w-0">
            <p className="text-sm font-semibold text-zinc-900 dark:text-zinc-100 truncate">
              {currentUser.name}
            </p>
            <p className="text-[10px] text-zinc-500 dark:text-zinc-400 truncate">
              {getUserRoles(currentUser).map(roleLabel).join(", ")}
            </p>
          </div>
        </div>
        <div className="flex items-center gap-2">
          <button
            onClick={onOpenProfile}
            className="flex-1 flex items-center justify-center gap-2 px-3 py-1.5 rounded-md text-[11px] font-semibold text-zinc-600 dark:text-zinc-300 bg-white dark:bg-zinc-800 border border-zinc-200 dark:border-zinc-700 hover:bg-zinc-100 dark:hover:bg-zinc-700 transition-colors duration-150"
            style={{ WebkitTapHighlightColor: "transparent" }}
          >
            <Settings className="w-3.5 h-3.5" /> Setting
          </button>
          <button
            onClick={onLogout}
            className="flex-1 flex items-center justify-center gap-2 px-3 py-1.5 rounded-md text-[11px] font-semibold text-zinc-600 dark:text-zinc-300 bg-white dark:bg-zinc-800 border border-zinc-200 dark:border-zinc-700 hover:bg-red-50 dark:hover:bg-red-900/20 hover:text-red-600 dark:hover:text-red-400 hover:border-red-200 dark:hover:border-red-900/30 transition-colors duration-150"
            style={{ WebkitTapHighlightColor: "transparent" }}
          >
            <LogOut className="w-3.5 h-3.5" /> Log out
          </button>
        </div>
      </div>
    </div>
  ),
);
ProfileCardDesktopMemo.displayName = "ProfileCardDesktopMemo";
