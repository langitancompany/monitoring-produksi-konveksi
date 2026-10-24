// tests/finance-invoice-ui.test.tsx — uji asap (smoke) dokumen invoice, pengaturan invoice, dan tombol ekspor:
// dirender di server tanpa galat dan memuat teks kunci sesuai status/pengaturan. Pembuatan PDF (html-to-image + jsPDF),
// dialog cetak, dan unduhan file hanya berjalan di browser dan TIDAK diuji di sini.
// Jalankan: npx tsx tests/finance-invoice-ui.test.tsx
import assert from "node:assert/strict";
import React from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { DialogProvider } from "../app/components/ui/DialogProvider";
import InvoiceDocument from "../app/components/finance/InvoiceDocument";
import InvoiceShareModal from "../app/components/finance/InvoiceShareModal";
import InvoiceSettingsCard from "../app/components/finance/InvoiceSettingsCard";
import ScaledDoc from "../app/components/finance/ScaledDoc";
import ExportButton from "../app/components/finance/ExportButton";
import { buildSampleInvoiceModel } from "../lib/finance/invoiceDoc";
import { DEFAULT_INVOICE_SETTINGS, type InvoiceSettings } from "../lib/finance/invoiceSettings";

let passed = 0;
function test(name: string, fn: () => void) {
  try {
    fn();
    passed += 1;
    console.log(`  ✓ ${name}`);
  } catch (e) {
    console.error(`  ✗ ${name}`);
    throw e;
  }
}
const html = (node: React.ReactElement) => renderToStaticMarkup(<DialogProvider>{node}</DialogProvider>);
const PNG = "data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNkYPhfDwAChwGA60e6kgAAAABJRU5ErkJggg==";
const settings = (over: Partial<InvoiceSettings> = {}): InvoiceSettings => ({
  ...DEFAULT_INVOICE_SETTINGS,
  store_name: "Langitan Konveksi",
  store_address: "Widang, Tuban",
  accounts: [{ bank: "BCA", number: "1234567890", holder: "PT Contoh" }, { bank: "BRI", number: "9876543210", holder: "" }],
  payment_note: "Transfer lalu kirim bukti",
  ...over,
});

console.log("dokumen invoice (InvoiceDocument)");
test("belum lunas (DP): kop teks, rincian item, total, sisa, rekening, jatuh tempo, tanpa cap LUNAS besar", () => {
  const out = html(<InvoiceDocument model={buildSampleInvoiceModel(false)} settings={settings()} />);
  for (const t of ["Langitan Konveksi", "Widang, Tuban", "INVOICE", "INV-K-261010-0001", "DP DITERIMA", "Seragam Sekolah", "Kaos Polo",
    "Sisa tagihan", "CARA PEMBAYARAN", "1234567890", "9876543210", "a\\.n\\. PT Contoh", "Transfer lalu kirim bukti", "JATUH TEMPO", "PEMBAYARAN DITERIMA"]) {
    assert.match(out, new RegExp(t), t);
  }
  assert.match(out, /Rp\s?7\.000\.000/); // sisa = 11.000.000 − 4.000.000
  assert.doesNotMatch(out, />LUNAS</);
});
test("lunas: cap LUNAS, ucapan terima kasih, tanpa cara pembayaran dan tanpa jatuh tempo", () => {
  const out = html(<InvoiceDocument model={buildSampleInvoiceModel(true)} settings={settings()} />);
  assert.match(out, />LUNAS</);
  assert.match(out, /Pembayaran diterima <b>lunas<\/b>/);
  assert.doesNotMatch(out, /CARA PEMBAYARAN/);
  assert.doesNotMatch(out, /JATUH TEMPO/);
  assert.match(out, /Sisa tagihan/);
});
test("tanpa rekening: bagian cara pembayaran tidak muncul; gambar kop menggantikan kop teks", () => {
  const noAcc = html(<InvoiceDocument model={buildSampleInvoiceModel(false)} settings={settings({ accounts: [] })} />);
  assert.doesNotMatch(noAcc, /CARA PEMBAYARAN/);
  const withHeader = html(<InvoiceDocument model={buildSampleInvoiceModel(false)} settings={settings()} headerUrl={PNG} />);
  assert.match(withHeader, /<img[^>]+alt="Langitan Konveksi"/);
  assert.doesNotMatch(withHeader, /Widang, Tuban/);
});
test("tanda tangan hanya tampil bila diaktifkan dan ada isinya; catatan tampil", () => {
  const off = html(<InvoiceDocument model={buildSampleInvoiceModel(false)} settings={settings({ show_signature: false, signature_name: "Majid" })} />);
  assert.doesNotMatch(off, /Hormat kami/);
  assert.match(off, /sah tanpa tanda tangan/);
  const on = html(<InvoiceDocument model={buildSampleInvoiceModel(false)} settings={settings({ show_signature: true, signature_name: "Majid", signature_title: "Direktur", signature_image: PNG })} note="Diproses setelah DP" />);
  for (const t of ["Hormat kami", "Majid", "Direktur", "Tanda tangan", "Diproses setelah DP"]) assert.match(on, new RegExp(t), t);
  assert.doesNotMatch(on, /sah tanpa tanda tangan/);
  assert.doesNotMatch(html(<InvoiceDocument model={buildSampleInvoiceModel(false)} settings={settings({ show_signature: true })} />), /Hormat kami/); // aktif tetapi kosong
});
test("data pelanggan tidak bisa menyisipkan HTML (di-escape)", () => {
  const evil = '<img src=x onerror="alert(1)"><script>alert(2)</script>';
  const m = { ...buildSampleInvoiceModel(false), customerName: evil, customerAddress: evil, lines: [{ label: evil, detail: evil, qty: 1, subtotal: 11_500_000 }] };
  const out = html(<InvoiceDocument model={m} settings={settings({ store_name: evil })} note={evil} />);
  assert.doesNotMatch(out, /<script>/);
  assert.doesNotMatch(out, /<img src=x/);
  assert.match(out, /&lt;script&gt;/);
});
test("revisi ditandai; invoice banyak item tidak dipotong", () => {
  const m = buildSampleInvoiceModel(false);
  const many = { ...m, revisionNote: "Revisi ke-2", lines: Array.from({ length: 30 }, (_, i) => ({ label: `Item ${i}`, detail: "1 pcs × Rp 1", qty: 1, subtotal: 1 })) };
  const out = html(<InvoiceDocument model={many} settings={settings()} />);
  assert.match(out, /Revisi ke-2/);
  assert.match(out, /Item 29/);
  assert.match(out, /min-height:148mm/);
});

console.log("komponen pendukung");
test("ScaledDoc membungkus isi", () => {
  assert.match(html(<ScaledDoc><p>isi dokumen</p></ScaledDoc>), /isi dokumen/);
});
test("InvoiceShareModal: keadaan memuat (data diambil di browser)", () => {
  const out = html(<InvoiceShareModal orderId="o1" onClose={() => {}} />);
  assert.match(out, /Invoice pelanggan/);
  assert.match(out, /Memuat invoice/);
});
test("InvoiceSettingsCard: keadaan memuat sebelum data server tiba", () => {
  assert.match(html(<InvoiceSettingsCard />), /Memuat pengaturan invoice/);
});
test("ExportButton: tombol berlabel Ekspor Excel; dapat dinonaktifkan", () => {
  const build = () => null;
  assert.match(html(<ExportButton scope="Tagihan" build={build} />), /Ekspor Excel/);
  assert.match(html(<ExportButton scope="Tagihan" build={build} disabled />), /disabled/);
});

console.log(`\n${passed} uji lulus`);
