// lib/finance/excel.ts
//
// Ekspor Excel (.xlsx) untuk Keuangan. Pembentukan isi lembar adalah fungsi MURNI (diuji); pembuatan file memakai
// pustaka `xlsx` yang dimuat dinamis hanya saat tombol ekspor ditekan. Angka rupiah ditulis sebagai ANGKA (bisa
// dijumlah di Excel); teks selalu ditulis sebagai teks — string yang diawali "=" tidak dievaluasi sebagai rumus.
// Ekspor dicatat ke log audit lewat /api/finance/export-log sebelum file dibuat (lihat ExportButton).

import type { ExpenseRow, OrderFinanceRow, PaymentRow, ReportData } from "./types";
import { PAYMENT_KIND_LABEL, PAYMENT_METHOD_LABEL, PAYMENT_STATE_LABEL, EXPENSE_STATE_LABEL } from "./types";

type Cell = string | number | null;

export interface SheetSpec {
  /** nama lembar (otomatis dirapikan sesuai batas Excel) */
  name: string;
  header: string[];
  rows: Cell[][];
  /** indeks kolom (mulai 0) yang berisi rupiah: sel angkanya diberi format #,##0 */
  moneyCols?: number[];
  /** lebar kolom (jumlah karakter); bawaan dihitung dari isi */
  widths?: number[];
  /** catatan satu baris di bawah tabel (mis. "menampilkan 300 dari 412 pesanan") */
  note?: string;
}

/** Nama lembar Excel: maks 31 karakter, tanpa [ ] : * ? / \ , tidak kosong. */
export function sanitizeSheetName(name: string): string {
  const cleaned = name.replace(/[[\]:*?/\\]/g, " ").replace(/\s+/g, " ").trim().slice(0, 31);
  return cleaned || "Data";
}

/** Nama file: Keuangan-<lingkup>-<YYYY-MM-DD>.xlsx (lingkup dibuat aman untuk nama file). */
export function exportFileName(scope: string, date: string): string {
  const slug = scope
    .normalize("NFKD")
    .replace(/[^\p{L}\p{N}]+/gu, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 40);
  return `Keuangan-${slug || "Data"}-${date}.xlsx`;
}

export function invoicesSheet(rows: OrderFinanceRow[]): SheetSpec {
  return {
    name: "Tagihan",
    header: ["Kode produksi", "Pemesan", "Jumlah (pcs)", "Tanggal masuk", "Jatuh tempo", "Status", "Tagihan", "Terbayar", "Menunggu verifikasi", "Sisa", "Lebih bayar"],
    rows: rows.map((r) => [
      r.kode_produksi, r.nama_pemesan, r.jumlah, r.tanggal_masuk ?? "", r.due_date ?? "", r.payment_status,
      r.total, r.paid_verified, r.paid_pending, r.balance, r.overpaid,
    ]),
    moneyCols: [6, 7, 8, 9, 10],
  };
}

export function paymentsSheet(rows: PaymentRow[]): SheetSpec {
  return {
    name: "Pembayaran",
    header: ["Tanggal bayar", "Kode produksi", "Pemesan", "Jenis", "Arah", "Metode", "Akun", "Nominal", "Status", "Referensi", "Pengirim", "Dicatat oleh", "Diverifikasi oleh", "Alasan (ditolak/void)", "Catatan"],
    rows: rows.map((p) => [
      p.paid_at, p.orders?.kode_produksi ?? "", p.orders?.nama_pemesan ?? "", PAYMENT_KIND_LABEL[p.kind],
      p.kind === "refund" ? "Keluar (refund)" : "Masuk", PAYMENT_METHOD_LABEL[p.method], p.account_name ?? "",
      p.amount, PAYMENT_STATE_LABEL[p.status], p.reference_no ?? "", p.payer_name ?? "", p.recorded_by_name ?? "",
      p.verified_by_name ?? "", p.status === "rejected" ? (p.reject_reason ?? "") : p.status === "void" ? (p.void_reason ?? "") : "",
      p.note ?? "",
    ]),
    moneyCols: [7],
  };
}

export function expensesSheet(rows: ExpenseRow[]): SheetSpec {
  return {
    name: "Pengeluaran",
    header: ["Nomor", "Tanggal", "Keterangan", "Kategori", "Vendor", "Akun", "Pesanan", "Nominal", "Status", "Dicatat oleh", "Disetujui oleh", "Alasan (ditolak/void)", "Catatan", "Sumber"],
    rows: rows.map((x) => [
      x.expense_no ?? "", x.spent_at, x.description, x.category_name ?? "", x.vendor_name ?? "", x.account_name ?? "",
      x.order_kode ?? "", x.amount, EXPENSE_STATE_LABEL[x.status], x.recorded_by_name ?? "", x.approved_by_name ?? "",
      x.status === "rejected" ? (x.reject_reason ?? "") : x.status === "void" ? (x.void_reason ?? "") : "",
      x.note ?? "", x.source === "manual" ? "Manual" : x.source === "salary" ? "Gaji" : "Pembelian",
    ]),
    moneyCols: [7],
  };
}

/** Empat lembar: Ringkasan, Per bulan, Per kategori, Per pesanan (mencatat bila daftar pesanan terpotong). */
export function reportSheets(d: ReportData): SheetSpec[] {
  const t = d.totals;
  const truncated = d.orders_total > d.orders.length;
  return [
    {
      name: "Ringkasan",
      header: ["Keterangan", "Nilai"],
      rows: [
        ["Periode", `${d.period.from} s/d ${d.period.to}`],
        ["Pendapatan (nilai tagihan)", t.revenue],
        ["Biaya (pengeluaran disetujui)", t.expenses],
        ["Laba (perkiraan)", t.profit],
        ["Kas masuk (bersih refund)", t.cash_in],
        ["Kas keluar", t.cash_out],
        ["Arus kas bersih", t.cash_net],
        ["Tagihan belum terbayar", t.unpaid_billed],
        ["Biaya ditautkan ke pesanan", t.expenses_linked],
        ["Biaya belum ditautkan", t.expenses_unlinked],
      ],
      moneyCols: [1],
      note: "Laba adalah perkiraan manajemen dari data yang tercatat, bukan pembukuan resmi.",
    },
    {
      name: "Per bulan",
      header: ["Bulan", "Pendapatan", "Biaya", "Laba", "Kas masuk", "Kas keluar", "Kas bersih"],
      rows: d.months.map((m) => [m.month, m.revenue, m.expenses, m.profit, m.cash_in, m.cash_out, m.cash_net]),
      moneyCols: [1, 2, 3, 4, 5, 6],
    },
    {
      name: "Per kategori",
      header: ["Kategori biaya", "Jumlah"],
      rows: d.by_category.map((c) => [c.name, c.amount]),
      moneyCols: [1],
    },
    {
      name: "Per pesanan",
      header: ["Kode produksi", "Pemesan", "Tanggal masuk", "Tagihan", "Terbayar", "Biaya langsung", "Laba kotor"],
      rows: d.orders.map((o) => [o.kode_produksi, o.nama_pemesan, o.tanggal_masuk ?? "", o.total, o.paid, o.direct_cost, o.gross]),
      moneyCols: [3, 4, 5, 6],
      note: truncated
        ? `Menampilkan ${d.orders.length} pesanan terbaru dari ${d.orders_total} pesanan ditagih pada periode ini.`
        : undefined,
    },
  ];
}

type XlsxLib = typeof import("xlsx");

/** Susun buku kerja dari lembar-lembar. Dipisah dari unduhan agar bisa diuji di Node. */
export function buildWorkbook(XLSX: XlsxLib, sheets: SheetSpec[]) {
  const wb = XLSX.utils.book_new();
  const used = new Set<string>();
  for (const s of sheets) {
    const aoa: Cell[][] = [s.header, ...s.rows];
    if (s.note) aoa.push([], [s.note]);
    const ws = XLSX.utils.aoa_to_sheet(aoa);

    ws["!cols"] = s.header.map((h, i) => ({
      wch:
        s.widths?.[i] ??
        Math.min(48, Math.max(h.length, ...s.rows.map((r) => String(r[i] ?? "").length)) + 2),
    }));

    for (const c of s.moneyCols ?? []) {
      for (let r = 1; r <= s.rows.length; r++) {
        const cell = ws[XLSX.utils.encode_cell({ r, c })];
        if (cell && cell.t === "n") cell.z = "#,##0";
      }
    }

    // Nama lembar harus unik (tanpa membedakan huruf besar-kecil)
    let name = sanitizeSheetName(s.name);
    let n = 2;
    while (used.has(name.toLowerCase())) name = `${sanitizeSheetName(s.name).slice(0, 28)} ${n++}`;
    used.add(name.toLowerCase());
    XLSX.utils.book_append_sheet(wb, ws, name);
  }
  return wb;
}

/** Unduh file .xlsx di browser. Pustaka dimuat dinamis supaya tidak membebani halaman lain. */
export async function downloadXlsx(filename: string, sheets: SheetSpec[]): Promise<void> {
  const XLSX = await import("xlsx");
  const wb = buildWorkbook(XLSX, sheets);
  const out = XLSX.write(wb, { type: "array", bookType: "xlsx" }) as ArrayBuffer;
  const blob = new Blob([out], { type: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet" });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 2000);
}
