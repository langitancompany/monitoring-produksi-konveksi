// lib/finance/invoiceDoc.ts
//
// Model tampilan dokumen invoice untuk pelanggan + teks pesan WhatsApp. Fungsi MURNI (tanpa React/jaringan).
// Semua angka uang berasal dari server (OrderFinanceDetail.finance dan tagihan aktif). Baris rincian diambil dari
// pricing_snapshot tagihan aktif — dibekukan saat terbit, jadi dokumen selalu sama dengan yang ditagihkan walau
// item pesanan berubah sesudahnya. Bila jumlah baris tidak cocok dengan subtotal resmi (data tidak wajar), rincian
// diganti satu baris ringkas supaya dokumen TIDAK PERNAH menampilkan angka yang berbeda dari total tagihan.

import {
  PAYMENT_KIND_LABEL,
  PAYMENT_METHOD_LABEL,
  type OrderFinanceDetail,
  type OrderPaymentStatus,
} from "./types";

export interface InvoiceDocLine {
  label: string;
  detail: string;
  qty: number;
  subtotal: number;
}

export interface InvoicePaymentLine {
  date: string;
  label: string;
  amount: number;
  isRefund: boolean;
}

export interface InvoiceModel {
  number: string;
  revisionNote: string | null;
  issuedAt: string;
  dueDate: string | null;
  customerName: string;
  customerPhone: string | null;
  customerAddress: string | null;
  orderCode: string;
  status: OrderPaymentStatus;
  isLunas: boolean;
  lines: InvoiceDocLine[];
  totalPcs: number;
  subtotal: number;
  discount: number;
  total: number;
  paid: number;
  balance: number;
  overpaid: number;
  payments: InvoicePaymentLine[];
  /** Tanggal pembayaran terverifikasi terakhir (untuk keterangan "Lunas pada …"). */
  lastPaidAt: string | null;
}

const rp = (n: number) => "Rp " + Math.round(n).toLocaleString("id-ID");

/** Ambil detail keuangan → model invoice. null bila pesanan belum punya tagihan aktif. */
export function buildInvoiceModel(detail: OrderFinanceDetail): InvoiceModel | null {
  const inv = detail.invoices.find((i) => i.status === "active");
  if (!inv) return null;

  const f = detail.finance;
  const o = detail.order;

  const snapshot = Array.isArray(inv.pricing_snapshot) ? inv.pricing_snapshot : [];
  const snapshotSum = snapshot.reduce((n, l) => n + l.subtotal, 0);
  const consistent = snapshot.length > 0 && snapshotSum === inv.subtotal;

  const lines: InvoiceDocLine[] = consistent
    ? snapshot.map((l) => ({
        label: l.nama,
        detail: `${l.jumlah.toLocaleString("id-ID")} pcs × ${rp(l.harga_per_pcs)}`,
        qty: l.jumlah,
        subtotal: l.subtotal,
      }))
    : [
        {
          label: `Produksi pesanan ${o.kode_produksi}`,
          detail: "",
          qty: inv.total_pcs || o.jumlah,
          subtotal: inv.subtotal,
        },
      ];

  const payments: InvoicePaymentLine[] = detail.payments
    .filter((p) => p.status === "verified")
    .sort((a, b) => a.paid_at.localeCompare(b.paid_at))
    .map((p) => ({
      date: p.paid_at,
      label: `${PAYMENT_KIND_LABEL[p.kind]} · ${PAYMENT_METHOD_LABEL[p.method]}${p.account_name ? ` · ${p.account_name}` : ""}`,
      amount: p.amount,
      isRefund: p.kind === "refund",
    }));

  const revisions = Math.max(0, (inv.version ?? 1) - 1);
  return {
    number: `INV-${o.kode_produksi}`,
    revisionNote: revisions > 0 ? `Revisi ke-${revisions}` : null,
    issuedAt: inv.issued_at,
    dueDate: inv.due_date ?? f.due_date ?? null,
    customerName: o.nama_pemesan,
    customerPhone: o.no_hp?.trim() || null,
    customerAddress: o.alamat_pemesan?.trim() || null,
    orderCode: o.kode_produksi,
    status: f.payment_status,
    isLunas: f.payment_status === "Lunas" || f.payment_status === "Kelebihan Bayar",
    lines,
    totalPcs: inv.total_pcs || o.jumlah,
    subtotal: inv.subtotal,
    discount: inv.discount,
    total: f.total,
    paid: f.paid_verified,
    balance: f.balance,
    overpaid: f.overpaid,
    payments,
    lastPaidAt: payments.length ? payments[payments.length - 1].date : null,
  };
}

/** "08xx" / "+62 8xx" / "628xx" → "628xx" untuk tautan wa.me. null bila tidak valid. */
export function normalizeWaNumber(raw: string | null | undefined): string | null {
  if (!raw) return null;
  let d = raw.replace(/\D/g, "");
  if (!d) return null;
  if (d.startsWith("0")) d = "62" + d.slice(1);
  else if (d.startsWith("8")) d = "62" + d;
  return d.length >= 9 && d.length <= 15 ? d : null;
}

export const invoiceDateLong = (s: string | null | undefined): string => {
  if (!s) return "-";
  const d = /^\d{4}-\d{2}-\d{2}$/.test(s) ? new Date(`${s}T00:00:00`) : new Date(s);
  return Number.isNaN(d.getTime())
    ? "-"
    : d.toLocaleDateString("id-ID", { day: "numeric", month: "long", year: "numeric" });
};

/** Teks pesan WhatsApp yang menyertai invoice. */
export function buildWaText(m: InvoiceModel, storeName: string, paymentInfo: string): string {
  const head = `Halo ${m.customerName},`;
  if (m.isLunas) {
    return [
      head,
      "",
      `Terima kasih, pembayaran untuk *${m.number}* sudah kami terima *LUNAS*${m.lastPaidAt ? ` (${invoiceDateLong(m.lastPaidAt)})` : ""}.`,
      `Total: ${rp(m.total)}`,
      "",
      "Invoice berstatus lunas kami lampirkan sebagai bukti pembayaran.",
      "",
      `Salam, ${storeName}`,
    ].join("\n");
  }
  const out = [head, "", `Berikut invoice *${m.number}* dari ${storeName}.`, `Total tagihan: ${rp(m.total)}`];
  if (m.paid > 0) out.push(`Sudah dibayar: ${rp(m.paid)}`);
  out.push(`*Sisa yang harus dibayar: ${rp(m.balance)}*`);
  if (m.dueDate) out.push(`Jatuh tempo: ${invoiceDateLong(m.dueDate)}`);
  if (paymentInfo.trim()) out.push("", "Pembayaran ke:", paymentInfo.trim());
  out.push("", "Mohon kirim bukti transfer setelah melakukan pembayaran. Terima kasih 🙏", "", `Salam, ${storeName}`);
  return out.join("\n");
}

/** Data contoh untuk pratinjau di pengaturan invoice (BUKAN data nyata). */
export function buildSampleInvoiceModel(lunas: boolean): InvoiceModel {
  const total = 11_000_000;
  const dp = 4_000_000;
  return {
    number: "INV-K-261010-0001",
    revisionNote: null,
    issuedAt: "2026-10-10T03:00:00Z",
    dueDate: "2026-10-24",
    customerName: "Nama Pelanggan",
    customerPhone: "0812 3456 7890",
    customerAddress: "Alamat pelanggan contoh, Tuban",
    orderCode: "K-261010-0001",
    status: lunas ? "Lunas" : "DP",
    isLunas: lunas,
    lines: [
      { label: "Seragam Sekolah", detail: `100 pcs × ${rp(85_000)}`, qty: 100, subtotal: 8_500_000 },
      { label: "Kaos Polo", detail: `50 pcs × ${rp(60_000)}`, qty: 50, subtotal: 3_000_000 },
    ],
    totalPcs: 150,
    subtotal: 11_500_000,
    discount: 500_000,
    total,
    paid: lunas ? total : dp,
    balance: lunas ? 0 : total - dp,
    overpaid: 0,
    payments: lunas
      ? [
          { date: "2026-10-11", label: "DP · Transfer", amount: dp, isRefund: false },
          { date: "2026-10-20", label: "Pelunasan · Transfer", amount: total - dp, isRefund: false },
        ]
      : [{ date: "2026-10-11", label: "DP · Transfer", amount: dp, isRefund: false }],
    lastPaidAt: lunas ? "2026-10-20" : "2026-10-11",
  };
}
