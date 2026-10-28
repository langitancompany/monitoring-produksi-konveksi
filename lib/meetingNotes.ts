// lib/meetingNotes.ts
//
// Logika murni untuk Catatan Rapat (Bagian 4): bagian catatan, rentang minggu,
// pengelompokan per pesanan, dan laporan cetak. Tidak memakai React/Supabase
// supaya mudah diuji. (Pola dari WeeklyNotesView & ProductionNotes Sablon.)

import { formatDateTime } from "@/lib/utils";

/** Tiga bagian catatan di detail pesanan (sama dengan Sablon). */
export type NoteSection = "produksi" | "finishing" | "pengiriman";

export const NOTE_SECTIONS: { value: NoteSection; label: string }[] = [
  { value: "produksi", label: "Produksi" },
  { value: "finishing", label: "QC & Packing" },
  { value: "pengiriman", label: "Pengiriman" },
];

export const NOTE_SECTION_LABEL: Record<NoteSection, string> = {
  produksi: "Produksi",
  finishing: "QC & Packing",
  pengiriman: "Pengiriman",
};

/** Batas panjang satu catatan (database mengizinkan sampai 1000, UI lebih ketat agar ringkas). */
export const NOTE_MAX_LENGTH = 500;

/** Kolom yang dimuat dari tabel production_notes. */
export const NOTE_COLUMNS =
  "id, order_id, kode_produksi, nama_pemesan, content, section, created_by_id, created_by_name, created_at";

export interface ProductionNote {
  id: string;
  order_id: string;
  kode_produksi: string | null;
  nama_pemesan: string | null;
  content: string;
  section: NoteSection;
  created_by_id: string;
  created_by_name: string;
  created_at: string;
}

export const isNoteSection = (v: unknown): v is NoteSection =>
  v === "produksi" || v === "finishing" || v === "pengiriman";

/**
 * Rapikan teks catatan sebelum disimpan: samakan baris baru, buang spasi di
 * ujung, batasi panjang. Hasil kosong = catatan tidak valid (jangan disimpan).
 */
export function cleanNoteText(raw: string): string {
  return raw.replace(/\r\n?/g, "\n").trim().slice(0, NOTE_MAX_LENGTH).trim();
}

/** Boleh menghapus catatan? Pembuatnya atau Super Admin (sama dengan policy database). */
export function canDeleteNote(
  note: Pick<ProductionNote, "created_by_id">,
  user: { id: string; role: string } | null | undefined,
): boolean {
  if (!user) return false;
  return note.created_by_id === user.id || user.role === "super_admin";
}

/** Pesan galat yang ramah. Tabel belum ada = migration 004 belum dijalankan. */
export function noteErrorMessage(err: { code?: string; message?: string } | null | undefined): string {
  const code = err?.code ?? "";
  const msg = err?.message ?? "";
  const tableMissing = /production_notes/i.test(msg) && /schema cache|does not exist/i.test(msg);
  if (code === "PGRST205" || code === "42P01" || tableMissing) {
    return "Tabel catatan belum ada di database. Jalankan supabase/migrations/004_production_notes.sql di SQL Editor Supabase, lalu muat ulang halaman.";
  }
  if (code === "42501" || /row-level security|permission denied/i.test(msg)) {
    return "Anda tidak punya izin untuk tindakan ini.";
  }
  return msg || "Terjadi kesalahan tak dikenal.";
}

// ─── Rentang minggu ──────────────────────────────────────────────────────────

export type WeekFilter = "this" | "last" | "all";

/** Senin 00:00 (waktu lokal) pada minggu yang memuat `now`. Minggu dimulai hari Senin. */
export function startOfWeek(now: Date): Date {
  const d = new Date(now);
  d.setHours(0, 0, 0, 0);
  const day = d.getDay(); // 0 = Minggu
  d.setDate(d.getDate() + (day === 0 ? -6 : 1 - day));
  return d;
}

/** Rentang [from, to) untuk filter; "all" = tanpa batas (null). */
export function weekRange(filter: WeekFilter, now: Date): { from: Date | null; to: Date | null } {
  if (filter === "all") return { from: null, to: null };
  const thisMonday = startOfWeek(now);
  const from = new Date(thisMonday);
  if (filter === "last") from.setDate(from.getDate() - 7);
  const to = new Date(from);
  to.setDate(to.getDate() + 7);
  return { from, to };
}

const FILTER_NAME: Record<WeekFilter, string> = {
  this: "Minggu ini",
  last: "Minggu lalu",
  all: "Semua waktu",
};

const shortDate = (d: Date, withYear: boolean) =>
  d.toLocaleDateString("id-ID", {
    day: "numeric",
    month: "short",
    ...(withYear ? { year: "numeric" } : {}),
  });

/** "Minggu ini (12 – 18 Okt 2026)" — hari terakhir = Minggu. */
export function periodLabel(filter: WeekFilter, now: Date): string {
  const { from, to } = weekRange(filter, now);
  if (!from || !to) return FILTER_NAME[filter];
  const last = new Date(to);
  last.setDate(last.getDate() - 1);
  return `${FILTER_NAME[filter]} (${shortDate(from, false)} – ${shortDate(last, true)})`;
}

// ─── Pengelompokan ───────────────────────────────────────────────────────────

export interface OrderNotes {
  order_id: string;
  kode_produksi: string;
  nama_pemesan: string;
  sections: Record<NoteSection, ProductionNote[]>;
}

export const countNotes = (g: OrderNotes): number =>
  NOTE_SECTIONS.reduce((n, s) => n + g.sections[s.value].length, 0);

type OrderRef = { id: string; kode_produksi: string; nama_pemesan: string };

/**
 * Kelompokkan catatan per pesanan.
 *  - Hanya catatan dari pesanan di `orders` (pesanan di Sampah / sudah terhapus tidak ikut).
 *  - Nama & kode memakai data pesanan TERBARU (bisa diedit setelah catatan dibuat).
 *  - Urutan pesanan = urutan catatan pertamanya; catatan dalam bagian urut waktu naik.
 */
export function groupNotesByOrder(notes: ProductionNote[], orders: OrderRef[]): OrderNotes[] {
  const byId = new Map(orders.map((o) => [o.id, o]));
  const sorted = [...notes].sort((a, b) => a.created_at.localeCompare(b.created_at));
  const groups = new Map<string, OrderNotes>();

  for (const n of sorted) {
    const order = byId.get(n.order_id);
    if (!order || !isNoteSection(n.section)) continue;
    let g = groups.get(n.order_id);
    if (!g) {
      g = {
        order_id: n.order_id,
        kode_produksi: order.kode_produksi,
        nama_pemesan: order.nama_pemesan,
        sections: { produksi: [], finishing: [], pengiriman: [] },
      };
      groups.set(n.order_id, g);
    }
    g.sections[n.section].push(n);
  }
  return [...groups.values()];
}

// ─── Laporan cetak ───────────────────────────────────────────────────────────

/** Escape teks sebelum masuk HTML (catatan ditulis pengguna — jangan pernah dipercaya). */
export function escapeHtml(s: string): string {
  return s
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");
}

/**
 * Dokumen HTML laporan (A4) yang siap dicetak / disimpan sebagai PDF lewat
 * dialog cetak browser. Tanpa library tambahan.
 */
export function buildReportHtml(groups: OrderNotes[], filter: WeekFilter, printedAt: Date): string {
  const total = groups.reduce((n, g) => n + countNotes(g), 0);

  const orderBlocks = groups
    .map((g, i) => {
      const sections = NOTE_SECTIONS.map(({ value, label }) => {
        const notes = g.sections[value];
        const body =
          notes.length === 0
            ? `<p class="empty">Tidak ada catatan</p>`
            : notes
                .map(
                  (n) =>
                    `<div class="note"><p class="text">${escapeHtml(n.content)}</p>` +
                    `<p class="meta">${escapeHtml(n.created_by_name)} · ${escapeHtml(formatDateTime(n.created_at))}</p></div>`,
                )
                .join("");
        return `<div class="sec"><h4>${escapeHtml(label)}</h4>${body}</div>`;
      }).join("");
      return (
        `<section class="order"><h3>${i + 1}. ${escapeHtml(g.nama_pemesan)}` +
        ` <span class="kode">#${escapeHtml(g.kode_produksi)}</span></h3>${sections}</section>`
      );
    })
    .join("");

  return `<!DOCTYPE html>
<html lang="id"><head><meta charset="utf-8">
<title>Catatan Rapat — ${escapeHtml(periodLabel(filter, printedAt))}</title>
<style>
  @page { size: A4; margin: 15mm; }
  * { box-sizing: border-box; }
  body { font-family: -apple-system, "Segoe UI", Roboto, Helvetica, Arial, sans-serif; color: #18181b; font-size: 11px; line-height: 1.5; margin: 0; }
  h1 { font-size: 18px; margin: 0 0 2px; }
  .sub { color: #71717a; font-size: 10px; margin: 0 0 4px; }
  .sum { color: #71717a; font-size: 10px; margin: 0 0 14px; padding-bottom: 8px; border-bottom: 1px solid #e4e4e7; }
  .order { break-inside: avoid-page; margin-bottom: 14px; padding-bottom: 10px; border-bottom: 1px solid #e4e4e7; }
  .order h3 { font-size: 13px; margin: 0 0 6px; }
  .kode { font-family: ui-monospace, Menlo, Consolas, monospace; font-size: 10px; color: #71717a; font-weight: 400; }
  .sec { margin: 0 0 6px 10px; }
  .sec h4 { font-size: 9px; letter-spacing: .12em; text-transform: uppercase; color: #52525b; margin: 0 0 3px; }
  .note { margin: 0 0 4px 8px; padding-left: 8px; border-left: 2px solid #d4d4d8; break-inside: avoid; }
  .text { margin: 0; white-space: pre-wrap; overflow-wrap: anywhere; }
  .meta { margin: 0; font-size: 9px; color: #a1a1aa; }
  .empty { margin: 0 0 0 8px; font-size: 10px; color: #a1a1aa; font-style: italic; }
  .foot { margin-top: 16px; font-size: 9px; color: #a1a1aa; }
</style></head><body>
<h1>Laporan Catatan Rapat</h1>
<p class="sub">Langitan.co Konveksi · Periode: ${escapeHtml(periodLabel(filter, printedAt))} · Dicetak: ${escapeHtml(formatDateTime(printedAt.toISOString()))}</p>
<p class="sum">${groups.length} pesanan · ${total} catatan</p>
${orderBlocks}
<p class="foot">Langitan.co · Sistem Produksi</p>
</body></html>`;
}
