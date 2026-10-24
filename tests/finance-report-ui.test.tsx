// tests/finance-report-ui.test.tsx — uji asap (smoke) tab Ringkasan, Laporan, Audit, dan Panduan: dirender di server
// tanpa galat. Tab yang memuat data lewat fetch menampilkan keadaan "Memuat…" (efek tidak jalan di server);
// Panduan statis sehingga isinya diperiksa penuh. Bukan pengganti uji klik di browser.
// Jalankan: npx tsx tests/finance-report-ui.test.tsx
import assert from "node:assert/strict";
import React from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { DialogProvider } from "../app/components/ui/DialogProvider";
import OverviewTab from "../app/components/finance/tabs/OverviewTab";
import ReportTab from "../app/components/finance/tabs/ReportTab";
import AuditTab from "../app/components/finance/tabs/AuditTab";
import GuideTab from "../app/components/finance/tabs/GuideTab";
import { SummaryCard } from "../app/components/finance/SummaryCard";

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
const noop = () => {};
const caps = (c: Partial<Record<"view" | "create" | "edit" | "delete", boolean>>, isSupervisor = false) => ({
  view: true, create: false, edit: false, delete: false, ...c, isSupervisor,
});

console.log("tab yang memuat data");
test("Ringkasan: filter tanggal dan keadaan memuat", () => {
  const out = html(<OverviewTab version={0} canVerify onGoVerify={noop} onGoExpenses={noop} />);
  assert.match(out, /Dari/);
  assert.match(out, /Sampai/);
  assert.match(out, /Memuat/);
  assert.match(out, /posisi saat ini/);
});
test("Laporan: filter, tombol preset, dan catatan bahwa laba adalah perkiraan", () => {
  const out = html(<ReportTab version={0} />);
  for (const t of ["Bulan ini", "3 bulan", "Tahun ini", "perkiraan manajemen", "Memuat"]) assert.match(out, new RegExp(t));
});
test("Audit: filter jenis memuat semua jenis catatan", () => {
  const out = html(<AuditTab version={0} />);
  for (const t of ["Pembayaran", "Tagihan", "Pengeluaran", "Vendor", "Memuat"]) assert.match(out, new RegExp(t));
});
test("SummaryCard menampilkan label, nilai, dan petunjuk", () => {
  const out = html(<SummaryCard label="Kas masuk" value="Rp 5" hint="bersih refund" icon={<span />} color="bg-x" />);
  for (const t of ["Kas masuk", "Rp 5", "bersih refund"]) assert.match(out, new RegExp(t));
});

console.log("Panduan");
test("semua bagian tampil; invoice & Excel sudah tidak disebut belum tersedia, gaji otomatis masih", () => {
  const out = html(<GuideTab caps={caps({ create: true, edit: true, delete: true }, true)} version={0} userKey="u1" onGo={noop} />);
  for (const t of ["Perlu tindakan sekarang", "Tugas rutin", "Aturan penting", "Tanya jawab", "Belum tersedia", "Gaji yang otomatis", "Bagaimana mengirim invoice", "Bagaimana mengekspor data ke Excel"]) {
    assert.match(out, new RegExp(t));
  }
  assert.doesNotMatch(out, /Invoice dalam bentuk PDF\/cetak dan kirim/);
});
test("tugas harian mengikuti hak: admin pencatat tidak melihat tugas verifikasi", () => {
  const creator = html(<GuideTab caps={caps({ create: true })} version={0} userKey="u1" onGo={noop} />);
  assert.match(creator, /Terbitkan tagihan untuk pesanan baru/);
  assert.match(creator, /Catat pembayaran yang masuk/);
  assert.doesNotMatch(creator, /Proses antrean verifikasi pembayaran/);
  const verifier = html(<GuideTab caps={caps({ edit: true })} version={0} userKey="u1" onGo={noop} />);
  assert.match(verifier, /Proses antrean verifikasi pembayaran/);
  assert.doesNotMatch(verifier, /Catat pembayaran yang masuk/);
});
test("hanya-lihat: tidak ada tugas harian, ada pesan jelas", () => {
  const out = html(<GuideTab caps={caps({})} version={0} userKey="u1" onGo={noop} />);
  assert.match(out, /Tidak ada tugas harian untuk hak akses Anda/);
});
test("setiap tugas punya kotak centang yang dapat diakses (aria-label)", () => {
  const out = html(<GuideTab caps={caps({ create: true, edit: true }, false)} version={0} userKey="u1" onGo={noop} />);
  assert.ok((out.match(/role="checkbox"/g) ?? []).length >= 5);
  assert.match(out, /aria-label="Tandai selesai: Catat pembayaran yang masuk"/);
});

console.log(`\n${passed} uji lulus`);
