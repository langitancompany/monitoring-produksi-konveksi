// lib/tabs.ts
//
// Daftar halaman (tab) aplikasi. Tambah id baru di sini, lalu render-nya
// di app/page.tsx dan menunya di app/components/layout/Sidebar.tsx
// (judul halaman di Header.tsx → pageTitles).

export const VALID_TABS = [
  "dashboard",
  "orders_utama",
  "orders_lain",
  "completed_orders",
  "calendar",
  "meeting_notes",
  "salary",
  "config_harga",
  "keuangan",
  "logs",
  "trash",
  "settings",
  "about",
] as const;

export type ActiveTab = (typeof VALID_TABS)[number];

export function isValidTab(value: string | null): value is ActiveTab {
  return !!value && (VALID_TABS as readonly string[]).includes(value);
}
