// app/components/finance/utils.ts
// Format tampilan untuk modul Keuangan (rupiah, tanggal). Hanya tampilan — bukan sumber angka.

import { parseLocalDate, toLocalISODate } from "@/lib/utils";

export const formatRupiah = (value: number): string => {
  if (!value) return "Rp 0";
  return new Intl.NumberFormat("id-ID", {
    style: "currency",
    currency: "IDR",
    minimumFractionDigits: 0,
    maximumFractionDigits: 0,
  }).format(value);
};

/** "2026-10-10" atau ISO timestamp → "10 Okt 26". Tanggal saja dibaca sebagai tanggal LOKAL (tanpa geser hari). */
export const formatDateShort = (dateStr?: string | null): string => {
  if (!dateStr) return "-";
  const d = parseLocalDate(dateStr);
  if (Number.isNaN(d.getTime())) return "-";
  return d.toLocaleDateString("id-ID", { day: "numeric", month: "short", year: "2-digit" });
};

export const formatDateTime = (iso?: string | null): string => {
  if (!iso) return "-";
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return "-";
  return d.toLocaleString("id-ID", {
    day: "numeric",
    month: "short",
    year: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
  });
};

export const todayYmd = (): string => toLocalISODate(new Date());

export const monthStartYmd = (): string => {
  const d = new Date();
  return toLocalISODate(new Date(d.getFullYear(), d.getMonth(), 1));
};
