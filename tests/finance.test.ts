// tests/finance.test.ts — uji logika murni Keuangan (lib/finance/*)
// Jalankan: npx tsx tests/finance.test.ts
import assert from "node:assert/strict";
import { resolveFinanceCaps } from "../lib/finance/caps";
import { parsePaymentFields, toPaymentRow } from "../lib/finance/payments";
import { calcInvoice, invoiceIsStale, MAX_PRICE } from "../lib/finance/pricing";
import type { OrderItem } from "../types/order";
import type { OrderFinanceRow } from "../lib/finance/types";
import {
  countByFilter, expenseFormState, expenseProofRequired, expensesByCategory, expenseTotals, filterFinanceRows,
  initialPrices, isOverdue, netVerified, paymentFormState, totalsOf,
  type PaymentFormInput,
} from "../lib/finance/view";
import { parseExpenseFields, sanitizeLookupQuery, toExpenseRow } from "../lib/finance/expenses";
import {
  AGING_ORDER, BUCKET_LABEL, bucketTone, datePreset, isValidRange, lossOrders, monthLabel, pct, reportWarnings,
  sortReportOrders,
} from "../lib/finance/report";
import { COMING_SOON, FAQ, RULES, TASKS, canDo, periodKey, pruneDone, taskKey, tasksFor } from "../lib/finance/guideTasks";
import { AUDIT_ACTION_LABEL, AUDIT_ENTITIES, type ReportData, type ReportOrder } from "../lib/finance/types";
import { readdirSync, readFileSync, statSync } from "node:fs";
import { join } from "node:path";
import * as XLSX from "xlsx";
import {
  DEFAULT_INVOICE_SETTINGS, MAX_ACCOUNTS, MAX_HEADER_DATAURL, formatAccountsText, readInvoiceSettings,
  sanitizeInvoiceSettings, summarizeInvoiceSettings,
} from "../lib/finance/invoiceSettings";
import {
  buildInvoiceModel, buildSampleInvoiceModel, buildWaText, invoiceDateLong, normalizeWaNumber,
} from "../lib/finance/invoiceDoc";
import { escapeHtml } from "../lib/finance/printFrame";
import {
  buildWorkbook, exportFileName, expensesSheet, invoicesSheet, paymentsSheet, reportSheets, sanitizeSheetName,
} from "../lib/finance/excel";
import type { ExpenseRow, InvoiceRow, OrderFinanceDetail, PaymentRow } from "../lib/finance/types";
import { finError, isDate, isMoney, isUuid, parseSettings, sniffProof, todayWib } from "../lib/finance/validate";

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

console.log("hak akses (caps)");
test("Super Admin punya semua hak walau permission kosong", () => {
  const c = resolveFinanceCaps({ role: "super_admin" }, null);
  assert.deepEqual(c, { view: true, maker: true, approver: true, delete: true, isSuperAdmin: true });
});
test("Super Admin lewat roles ganda juga dikenali", () => {
  assert.equal(resolveFinanceCaps({ role: "admin", roles: ["admin", "super_admin"] }, null).isSuperAdmin, true);
});
test("tanpa permission → tidak punya hak apa pun", () => {
  const c = resolveFinanceCaps({ role: "admin" }, undefined);
  assert.deepEqual(c, { view: false, maker: false, approver: false, delete: false, isSuperAdmin: false });
  assert.equal(resolveFinanceCaps(null, null).view, false);
});
test("hak lebih tinggi otomatis boleh melihat; hak lain tidak ikut naik", () => {
  const c = resolveFinanceCaps({ role: "admin" }, { maker: true });
  assert.equal(c.view, true);
  assert.equal(c.maker, true);
  assert.equal(c.approver, false);
  assert.equal(c.delete, false);
  assert.equal(c.isSuperAdmin, false); // bukan Super Admin → tak boleh lihat audit
});
test("Maker dan Approver terpisah: punya satu tidak membawa yang lain", () => {
  const maker = resolveFinanceCaps({ role: "admin" }, { view: true, maker: true });
  assert.equal(maker.maker, true);
  assert.equal(maker.approver, false);
  const appr = resolveFinanceCaps({ role: "admin" }, { view: true, approver: true });
  assert.equal(appr.approver, true);
  assert.equal(appr.maker, false);
  const both = resolveFinanceCaps({ role: "admin" }, { maker: true, approver: true });
  assert.equal(both.maker && both.approver, true);
  assert.equal(both.delete, false);
});
test("hanya Lihat: tidak boleh membuat tagihan maupun memverifikasi", () => {
  const c = resolveFinanceCaps({ role: "admin" }, { view: true });
  assert.deepEqual([c.view, c.maker, c.approver, c.delete], [true, false, false, false]);
});
test("kunci maker/approver yang tertulis false mengalahkan create/edit lama", () => {
  const c = resolveFinanceCaps({ role: "admin" }, { view: true, maker: false, approver: false, create: true, edit: true });
  assert.deepEqual([c.maker, c.approver], [false, false]);
});
test("user lama tanpa maker/approver: create → maker, edit → approver", () => {
  const c = resolveFinanceCaps({ role: "admin" }, { view: true, create: true, edit: false });
  assert.deepEqual([c.maker, c.approver], [true, false]);
  const d = resolveFinanceCaps({ role: "admin" }, { view: true, create: false, edit: true });
  assert.deepEqual([d.maker, d.approver], [false, true]);
});
test("nilai bukan boolean true tidak dianggap hak (mis. string 'true')", () => {
  const c = resolveFinanceCaps({ role: "admin" }, { view: "true" as unknown as boolean });
  assert.equal(c.view, false);
});

console.log("validator");
test("isUuid", () => {
  assert.equal(isUuid("123e4567-e89b-12d3-a456-426614174000"), true);
  assert.equal(isUuid("123e4567-e89b-12d3-a456-42661417400"), false);
  assert.equal(isUuid(null), false);
  assert.equal(isUuid("' or 1=1 --"), false);
});
test("isMoney: bulat, ≥ 0, ada batas atas", () => {
  assert.equal(isMoney(0), true);
  assert.equal(isMoney(1_500_000), true);
  assert.equal(isMoney(100_000_000_000), true);
  assert.equal(isMoney(100_000_000_001), false);
  assert.equal(isMoney(-1), false);
  assert.equal(isMoney(10.5), false);
  assert.equal(isMoney(NaN), false);
  assert.equal(isMoney("1000"), false);
});
test("isDate: format dan kalender benar (31 Feb & 29 Feb non-kabisat ditolak)", () => {
  assert.equal(isDate("2026-10-19"), true);
  assert.equal(isDate("2028-02-29"), true);
  assert.equal(isDate("2026-02-29"), false);
  assert.equal(isDate("2026-02-31"), false);
  assert.equal(isDate("2026-13-01"), false);
  assert.equal(isDate("19-10-2026"), false);
  assert.equal(isDate(20261019), false);
});
test("todayWib memakai tanggal WIB (UTC+7), bukan UTC", () => {
  // 18 Okt 2026 20:00 UTC = 19 Okt 2026 03:00 WIB
  assert.equal(todayWib(new Date(Date.UTC(2026, 9, 18, 20, 0, 0))), "2026-10-19");
  assert.equal(todayWib(new Date(Date.UTC(2026, 9, 18, 16, 59, 0))), "2026-10-18");
});

console.log("bukti pembayaran (sniffProof)");
test("mengenali JPG, PNG, PDF, WEBP dari isi file", () => {
  assert.equal(sniffProof(Uint8Array.from([0xff, 0xd8, 0xff, 0xe0]))?.ext, "jpg");
  assert.equal(sniffProof(Uint8Array.from([0x89, 0x50, 0x4e, 0x47, 0x0d]))?.mime, "image/png");
  assert.equal(sniffProof(Uint8Array.from([0x25, 0x50, 0x44, 0x46, 0x2d]))?.ext, "pdf");
  const webp = Uint8Array.from([0x52, 0x49, 0x46, 0x46, 0, 0, 0, 0, 0x57, 0x45, 0x42, 0x50]);
  assert.equal(sniffProof(webp)?.ext, "webp");
});
test("file lain (HTML, EXE, WAV bermodel RIFF) ditolak walau berekstensi gambar", () => {
  assert.equal(sniffProof(new TextEncoder().encode("<html><script>")), null);
  assert.equal(sniffProof(Uint8Array.from([0x4d, 0x5a, 0x90, 0x00])), null);
  const wav = Uint8Array.from([0x52, 0x49, 0x46, 0x46, 0, 0, 0, 0, 0x57, 0x41, 0x56, 0x45]);
  assert.equal(sniffProof(wav), null);
  assert.equal(sniffProof(new Uint8Array(0)), null);
});

console.log("pengaturan (parseSettings)");
test("tanpa baris → bawaan paling ketat/aman", () => {
  assert.deepEqual(parseSettings([]), {
    require_proof_non_cash: true,
    require_separate_verifier: false,
    allow_overpayment: false,
    auto_verify_own_payment: false,
    auto_approve_own_expense: false,
    expense_proof_required_above: 500_000,
    salary_default_account_code: "KAS",
  });
  assert.equal(parseSettings(null).require_proof_non_cash, true);
});
test("nilai dari database dipakai bila tipenya benar", () => {
  const s = parseSettings([
    { key: "require_proof_non_cash", value: false },
    { key: "allow_overpayment", value: true },
    { key: "expense_proof_required_above", value: 0 },
    { key: "salary_default_account_code", value: "BANK" },
  ]);
  assert.equal(s.require_proof_non_cash, false);
  assert.equal(s.allow_overpayment, true);
  assert.equal(s.expense_proof_required_above, 0);
  assert.equal(s.salary_default_account_code, "BANK");
});
test("tipe salah / nilai aneh jatuh ke bawaan, bukan membuka kontrol", () => {
  const s = parseSettings([
    { key: "require_proof_non_cash", value: "false" }, // string, bukan boolean
    { key: "allow_overpayment", value: 1 },
    { key: "expense_proof_required_above", value: -5 },
    { key: "salary_default_account_code", value: "kas; drop table" },
  ]);
  assert.equal(s.require_proof_non_cash, true);
  assert.equal(s.allow_overpayment, false);
  assert.equal(s.expense_proof_required_above, 500_000);
  assert.equal(s.salary_default_account_code, "KAS");
});

console.log("galat database (finError)");
test("pesan 'FIN:' diteruskan (422), galat lain disamarkan (500)", () => {
  assert.deepEqual(finError({ message: "FIN: Tagihan tidak ditemukan" }), {
    status: 422,
    message: "Tagihan tidak ditemukan",
    expected: true,
  });
  const r = finError({ message: 'relation "finance_x" does not exist: secret detail' });
  assert.equal(r.status, 500);
  assert.equal(r.expected, false);
  assert.equal(r.message, "Terjadi kesalahan pada server");
  assert.equal(finError(null, "Gagal").message, "Gagal");
});

// ─── Tagihan (langkah 6.2) ─────────────────────────────────────────────────────
const items: OrderItem[] = [
  { id: "it-a", jenis_produksi: "seragam_sekolah", jumlah: 100 },
  { id: "it-b", jenis_produksi: "kaos_polo", jumlah: 50 },
];
const nameOf = (j: string) => ({ seragam_sekolah: "Seragam Sekolah", kaos_polo: "Kaos Polo" }[j] ?? j);

console.log("hitung tagihan (calcInvoice)");
test("total = Σ jumlah × harga − diskon (sama dengan hasil uji fungsi SQL: Rp11.000.000)", () => {
  const r = calcInvoice(items, { "it-a": 85_000, "it-b": 60_000 }, 500_000, nameOf);
  assert.equal(r.ok, true);
  if (!r.ok) return;
  assert.equal(r.calc.subtotal, 11_500_000);
  assert.equal(r.calc.total, 11_000_000);
  assert.equal(r.calc.totalPcs, 150);
  assert.deepEqual(r.calc.lines[0], {
    item_id: "it-a", jenis_produksi: "seragam_sekolah", nama: "Seragam Sekolah",
    jumlah: 100, harga_per_pcs: 85_000, subtotal: 8_500_000,
  });
});
test("tanpa diskon", () => {
  const r = calcInvoice([items[0]], { "it-a": 1 });
  assert.equal(r.ok && r.calc.total, 100);
});
test("harga item belum diisi / kosong → galat menyebut nama item", () => {
  const r = calcInvoice(items, { "it-a": 85_000 }, 0, nameOf);
  assert.deepEqual(r, { ok: false, error: 'Harga untuk item "Kaos Polo" belum diisi.' });
  assert.equal(calcInvoice(items, { "it-a": 1, "it-b": "" }, 0, nameOf).ok, false);
});
test("harga harus bilangan bulat > 0 (nol, minus, pecahan, teks, NaN, terlalu besar ditolak)", () => {
  for (const bad of [0, -5, 10.5, "85000", NaN, Infinity, MAX_PRICE + 1]) {
    const r = calcInvoice([items[0]], { "it-a": bad as unknown });
    assert.equal(r.ok, false, String(bad));
  }
  assert.equal(calcInvoice([items[0]], { "it-a": MAX_PRICE }).ok, true);
});
test("harga untuk item yang tidak ada di pesanan ditolak (jangan diabaikan diam-diam)", () => {
  const r = calcInvoice(items, { "it-a": 1, "it-b": 1, hantu: 5 });
  assert.equal(r.ok, false);
});
test("diskon: tidak minus, tidak pecahan, tidak ≥ subtotal", () => {
  assert.equal(calcInvoice([items[0]], { "it-a": 10 }, -1).ok, false);
  assert.equal(calcInvoice([items[0]], { "it-a": 10 }, 1.5).ok, false);
  assert.equal(calcInvoice([items[0]], { "it-a": 10 }, "5").ok, false);
  assert.equal(calcInvoice([items[0]], { "it-a": 10 }, 1000).ok, false); // sama dengan subtotal
  assert.equal(calcInvoice([items[0]], { "it-a": 10 }, 999).ok, true);
});
test("pesanan tanpa item / jumlah tidak valid / item tanpa id ditolak", () => {
  assert.equal(calcInvoice([], {}).ok, false);
  assert.equal(calcInvoice([{ id: "x", jenis_produksi: "a", jumlah: 0 }], { x: 1 }).ok, false);
  assert.equal(calcInvoice([{ id: "x", jenis_produksi: "a", jumlah: 2.5 }], { x: 1 }).ok, false);
  assert.equal(calcInvoice([{ id: "", jenis_produksi: "a", jumlah: 1 }], {}).ok, false);
  assert.equal(calcInvoice(items, null as unknown as Record<string, unknown>).ok, false);
});

console.log("tagihan usang (invoiceIsStale)");
test("sama dengan pesanan → tidak usang; tanpa tagihan → tidak usang", () => {
  const r = calcInvoice(items, { "it-a": 1, "it-b": 1 });
  assert.equal(r.ok, true);
  if (!r.ok) return;
  assert.equal(invoiceIsStale(r.calc.lines, items), false);
  assert.equal(invoiceIsStale(undefined, items), false);
  assert.equal(invoiceIsStale(null, items), false);
});
test("jumlah / jenis berubah, item ditambah atau dihapus → usang", () => {
  const r = calcInvoice(items, { "it-a": 1, "it-b": 1 });
  if (!r.ok) throw new Error("setup");
  const lines = r.calc.lines;
  assert.equal(invoiceIsStale(lines, [{ ...items[0], jumlah: 101 }, items[1]]), true);
  assert.equal(invoiceIsStale(lines, [{ ...items[0], jenis_produksi: "lain" }, items[1]]), true);
  assert.equal(invoiceIsStale(lines, [items[0]]), true);
  assert.equal(invoiceIsStale(lines, [...items, { id: "it-c", jenis_produksi: "x", jumlah: 1 }]), true);
  assert.equal(invoiceIsStale(lines, [items[0], { ...items[1], id: "it-z" }]), true);
});

// ─── Pembayaran (langkah 6.3) ──────────────────────────────────────────────────
const OID = "123e4567-e89b-12d3-a456-426614174000";
const AID = "223e4567-e89b-12d3-a456-426614174000";
const form = (over: Record<string, string> = {}) => {
  const base: Record<string, string> = {
    order_id: OID, account_id: AID, method: "transfer", paid_at: "2026-10-19", amount: "3000000",
    reference_no: "TRX1", payer_name: "Pak Budi", note: "DP awal",
  };
  const all = { ...base, ...over };
  return (k: string) => all[k] ?? "";
};

console.log("isian pembayaran (parsePaymentFields)");
test("isian lengkap → diterima dan dirapikan", () => {
  const r = parsePaymentFields(form(), { maker: false });
  assert.equal(r.ok, true);
  if (!r.ok) return;
  assert.deepEqual(r.value, {
    orderId: OID, accountId: AID, method: "transfer", paidAt: "2026-10-19", amount: 3_000_000,
    kind: null, reference: "TRX1", payer: "Pak Budi", note: "DP awal",
  });
});
test("isian opsional kosong → null; teks panjang dipotong", () => {
  const r = parsePaymentFields(form({ reference_no: "", payer_name: "  ", note: "x".repeat(900) }), { maker: false });
  assert.equal(r.ok, true);
  if (!r.ok) return;
  assert.equal(r.value.reference, null);
  assert.equal(r.value.payer, null);
  assert.equal(r.value.note?.length, 500);
});
test("nominal: harus angka bulat > 0 tanpa titik/koma/minus/huruf", () => {
  for (const amount of ["", "0", "-5", "1.5", "1,000", "1e6", "abc", " ", "9999999999999", "100000000001"]) {
    const r = parsePaymentFields(form({ amount }), { maker: true });
    assert.equal(r.ok, false, `amount=${JSON.stringify(amount)}`);
  }
  assert.equal(parsePaymentFields(form({ amount: "100000000000" }), { maker: true }).ok, true);
});
test("pesanan, akun, metode, tanggal tidak valid ditolak", () => {
  assert.equal(parsePaymentFields(form({ order_id: "x" }), { maker: true }).ok, false);
  assert.equal(parsePaymentFields(form({ account_id: "" }), { maker: true }).ok, false);
  assert.equal(parsePaymentFields(form({ method: "cek" }), { maker: true }).ok, false);
  assert.equal(parsePaymentFields(form({ paid_at: "2026-02-30" }), { maker: true }).ok, false);
  for (const method of ["transfer", "tunai", "qris", "lainnya"]) {
    assert.equal(parsePaymentFields(form({ method }), { maker: false }).ok, true, method);
  }
});
test("jenis: hanya kosong atau refund; refund butuh hak Maker (403)", () => {
  assert.equal(parsePaymentFields(form({ kind: "dp" }), { maker: true }).ok, false);
  assert.equal(parsePaymentFields(form({ kind: "pelunasan" }), { maker: true }).ok, false);
  const denied = parsePaymentFields(form({ kind: "refund" }), { maker: false });
  assert.deepEqual(denied.ok === false && denied.status, 403);
  const ok = parsePaymentFields(form({ kind: "refund" }), { maker: true });
  assert.equal(ok.ok && ok.value.kind, "refund");
});

console.log("baris pembayaran (toPaymentRow)");
test("path bukti TIDAK ikut ke browser; hanya has_proof", () => {
  const raw = { id: "p1", order_id: OID, account_id: AID, amount: 5, status: "pending", proof_path: `${OID}/rahasia.jpg` };
  const row = toPaymentRow(raw);
  assert.equal(row.has_proof, true);
  assert.equal("proof_path" in row, false);
  assert.equal(JSON.stringify(row).includes("rahasia"), false);
  assert.equal(toPaymentRow({ ...raw, proof_path: null }).has_proof, false);
});
test("nama akun & pesanan diambil dari lookup; tanpa lookup → null", () => {
  const raw = { id: "p1", order_id: OID, account_id: AID, proof_path: null };
  const lookups = {
    accounts: new Map([[AID, "Kas Tunai"]]),
    orders: new Map([[OID, { kode_produksi: "K-1", nama_pemesan: "SMP 1" }]]),
  };
  const row = toPaymentRow(raw, lookups);
  assert.equal(row.account_name, "Kas Tunai");
  assert.deepEqual(row.orders, { kode_produksi: "K-1", nama_pemesan: "SMP 1" });
  const bare = toPaymentRow(raw);
  assert.equal(bare.account_name, null);
  assert.equal(bare.orders, null);
});

// ─── Langkah 6.4: logika tampilan layar Keuangan (lib/finance/view.ts) ──────────────────────────
const fr = (o: Partial<OrderFinanceRow> = {}): OrderFinanceRow => ({
  order_id: OID, kode_produksi: "KNV-10/26-0001", nama_pemesan: "SMP Negeri 1", jenis_produksi: null, jumlah: 100,
  tanggal_masuk: "2026-10-01", deadline: "2026-10-30", order_status: "On Process", invoice_id: "inv1",
  invoice_version: 1, due_date: null, total: 1_000_000, paid_verified: 0, paid_pending: 0, balance: 1_000_000,
  overpaid: 0, payment_status: "Belum Bayar", kategori: "utama", ...o,
});

console.log("daftar tagihan (filter & total)");
test("filter status + cari kode/nama tidak membedakan huruf besar/kecil", () => {
  const rows = [
    fr({ order_id: "a", kode_produksi: "KNV-10/26-0001", nama_pemesan: "SMP Negeri 1", payment_status: "Lunas" }),
    fr({ order_id: "b", kode_produksi: "KNV-10/26-0002", nama_pemesan: "Toko Maju", payment_status: "DP" }),
    fr({ order_id: "c", kode_produksi: "KNV-10/26-0003", nama_pemesan: "smp negeri 3", payment_status: "DP" }),
  ];
  assert.equal(filterFinanceRows(rows, "", "Semua").length, 3);
  assert.deepEqual(filterFinanceRows(rows, "", "DP").map((r) => r.order_id), ["b", "c"]);
  assert.deepEqual(filterFinanceRows(rows, "SMP", "Semua").map((r) => r.order_id), ["a", "c"]);
  assert.deepEqual(filterFinanceRows(rows, " 0002 ", "Semua").map((r) => r.order_id), ["b"]);
  assert.deepEqual(filterFinanceRows(rows, "smp", "Lunas").map((r) => r.order_id), ["a"]);
  assert.equal(filterFinanceRows(rows, "tidak ada", "Semua").length, 0);
});
test("hitung per status: semua filter ada (minimal 0) dan 'Semua' = seluruh baris", () => {
  const c = countByFilter([fr({ payment_status: "Lunas" }), fr({ payment_status: "Lunas" }), fr({ payment_status: "DP" })]);
  assert.equal(c.Semua, 3);
  assert.equal(c.Lunas, 2);
  assert.equal(c.DP, 1);
  assert.equal(c["Kelebihan Bayar"], 0);
  assert.equal(countByFilter([]).Semua, 0);
});
test("total: tagihan, terbayar, menunggu verifikasi, sisa dijumlah", () => {
  const t = totalsOf([
    fr({ total: 1_000_000, paid_verified: 400_000, paid_pending: 100_000, balance: 600_000 }),
    fr({ total: 500_000, paid_verified: 500_000, paid_pending: 0, balance: 0 }),
  ]);
  assert.deepEqual(t, { total: 1_500_000, paid: 900_000, pending: 100_000, balance: 600_000 });
  assert.deepEqual(totalsOf([]), { total: 0, paid: 0, pending: 0, balance: 0 });
});
test("lewat jatuh tempo: hanya tagihan aktif, ada sisa, jatuh tempo sebelum hari ini", () => {
  const today = new Date(2026, 9, 20); // 20 Okt 2026 (waktu lokal)
  assert.equal(isOverdue(fr({ due_date: "2026-10-19", balance: 1 }), today), true);
  assert.equal(isOverdue(fr({ due_date: "2026-10-20", balance: 1 }), today), false); // hari ini belum lewat
  assert.equal(isOverdue(fr({ due_date: "2026-10-25", balance: 1 }), today), false);
  assert.equal(isOverdue(fr({ due_date: "2026-10-01", balance: 0 }), today), false); // sudah lunas
  assert.equal(isOverdue(fr({ due_date: null, balance: 5 }), today), false); // tanpa jatuh tempo
  assert.equal(isOverdue(fr({ invoice_id: null, due_date: "2026-10-01", balance: 5 }), today), false); // belum ditagih
});

console.log("form tagihan (harga awal)");
test("revisi: harga lama terisi untuk item yang masih ada; item baru = 0", () => {
  const items: OrderItem[] = [
    { id: "i1", jenis_produksi: "kaos_polo", jumlah: 100 },
    { id: "i3", jenis_produksi: "celana", jumlah: 20 },
  ];
  const lines = [
    { item_id: "i1", jenis_produksi: "kaos_polo", nama: "Kaos Polo", jumlah: 100, harga_per_pcs: 85_000, subtotal: 8_500_000 },
    { item_id: "i2", jenis_produksi: "topi", nama: "Topi", jumlah: 5, harga_per_pcs: 10_000, subtotal: 50_000 },
  ];
  assert.deepEqual(initialPrices(items, lines), { i1: 85_000, i3: 0 }); // i2 sudah dihapus dari pesanan → tak ikut
  assert.deepEqual(initialPrices(items, null), { i1: 0, i3: 0 });
  assert.deepEqual(initialPrices([], lines), {});
});
test("harga awal yang dipakai calcInvoice: 0 ditolak sampai diisi, lengkap diterima", () => {
  const items: OrderItem[] = [{ id: "i1", jenis_produksi: "kaos_polo", jumlah: 10 }];
  assert.equal(calcInvoice(items, initialPrices(items, null), 0).ok, false);
  const r = calcInvoice(items, { i1: 50_000 }, 0);
  assert.equal(r.ok && r.calc.total, 500_000);
});

console.log("form pembayaran (paymentFormState)");
const pf = (o: Partial<PaymentFormInput> = {}): PaymentFormInput => ({
  amount: 100_000, balance: 1_000_000, paidPending: 0, paidVerified: 0, isRefund: false, allowOverpayment: false,
  method: "tunai", requireProofNonCash: true, hasAccount: true, hasDate: true, hasFile: false, ...o,
});
test("tunai tanpa bukti boleh disimpan; transfer tanpa bukti ditolak, dengan bukti boleh", () => {
  assert.equal(paymentFormState(pf()).canSubmit, true);
  assert.equal(paymentFormState(pf()).needProof, false);
  assert.equal(paymentFormState(pf({ method: "transfer" })).canSubmit, false);
  assert.equal(paymentFormState(pf({ method: "transfer" })).needProof, true);
  assert.equal(paymentFormState(pf({ method: "qris", hasFile: true })).canSubmit, true);
});
test("bukti tak wajib bila pengaturan mematikannya", () => {
  assert.equal(paymentFormState(pf({ method: "transfer", requireProofNonCash: false })).canSubmit, true);
});
test("batas nominal = sisa dikurangi yang menunggu verifikasi; melebihi ditolak kecuali kelebihan bayar diizinkan", () => {
  const s = paymentFormState(pf({ balance: 1_000_000, paidPending: 300_000, amount: 700_000 }));
  assert.equal(s.maxAmount, 700_000);
  assert.equal(s.canSubmit, true);
  const over = paymentFormState(pf({ balance: 1_000_000, paidPending: 300_000, amount: 700_001 }));
  assert.equal(over.overLimit, true);
  assert.equal(over.canSubmit, false);
  assert.equal(paymentFormState(pf({ balance: 1_000_000, paidPending: 300_000, amount: 900_000, allowOverpayment: true })).canSubmit, true);
});
test("sisa tertutup pembayaran menunggu → batas 0, tidak bisa disimpan", () => {
  const s = paymentFormState(pf({ balance: 500_000, paidPending: 500_000, amount: 1 }));
  assert.equal(s.maxAmount, 0);
  assert.equal(s.canSubmit, false);
});
test("refund dibatasi uang terverifikasi, TIDAK ikut pengaturan kelebihan bayar", () => {
  const ok = paymentFormState(pf({ isRefund: true, paidVerified: 400_000, amount: 400_000, allowOverpayment: true }));
  assert.equal(ok.canSubmit, true);
  const over = paymentFormState(pf({ isRefund: true, paidVerified: 400_000, amount: 400_001, allowOverpayment: true }));
  assert.equal(over.overLimit, true);
  assert.equal(over.canSubmit, false);
});
test("nominal 0/negatif/pecahan, tanpa akun, atau tanpa tanggal tidak bisa disimpan", () => {
  assert.equal(paymentFormState(pf({ amount: 0 })).canSubmit, false);
  assert.equal(paymentFormState(pf({ amount: -5 })).canSubmit, false);
  assert.equal(paymentFormState(pf({ amount: 10.5 })).canSubmit, false);
  assert.equal(paymentFormState(pf({ hasAccount: false })).canSubmit, false);
  assert.equal(paymentFormState(pf({ hasDate: false })).canSubmit, false);
});
test("kas masuk bersih: hanya terverifikasi, refund mengurangi", () => {
  assert.equal(
    netVerified([
      { status: "verified", kind: "dp", amount: 500_000 },
      { status: "verified", kind: "cicilan", amount: 300_000 },
      { status: "verified", kind: "refund", amount: 100_000 },
      { status: "pending", kind: "pelunasan", amount: 999_999 },
      { status: "void", kind: "dp", amount: 123 },
      { status: "rejected", kind: "dp", amount: 456 },
    ]),
    700_000,
  );
  assert.equal(netVerified([]), 0);
});

// ─── Pengeluaran (langkah 6.5) ─────────────────────────────────────────────────
const CID = "323e4567-e89b-12d3-a456-426614174000";
const VID = "423e4567-e89b-12d3-a456-426614174000";
const expForm = (over: Record<string, string> = {}) => {
  const base: Record<string, string> = {
    category_id: CID, account_id: AID, spent_at: "2026-10-19", amount: "150000",
    description: "Benang jahit 10 cone", vendor_id: VID, order_id: OID, note: "nota menyusul",
  };
  const all = { ...base, ...over };
  return (k: string) => all[k] ?? "";
};

console.log("isian pengeluaran (parseExpenseFields)");
test("isian lengkap → diterima dan dirapikan", () => {
  const r = parseExpenseFields(expForm({ description: "  Benang   jahit \n 10 cone " }));
  assert.equal(r.ok, true);
  if (!r.ok) return;
  assert.deepEqual(r.value, {
    categoryId: CID, accountId: AID, vendorId: VID, orderId: OID, description: "Benang jahit 10 cone",
    amount: 150_000, spentAt: "2026-10-19", note: "nota menyusul",
  });
});
test("vendor, pesanan, dan catatan opsional → null; teks panjang dipotong", () => {
  const r = parseExpenseFields(expForm({ vendor_id: "", order_id: "", note: "x".repeat(900), description: "d".repeat(500) }));
  assert.equal(r.ok, true);
  if (!r.ok) return;
  assert.equal(r.value.vendorId, null);
  assert.equal(r.value.orderId, null);
  assert.equal(r.value.note?.length, 500);
  assert.equal(r.value.description.length, 200);
  const blankNote = parseExpenseFields(expForm({ note: "  " }));
  assert.equal(blankNote.ok && blankNote.value.note, null);
});
test("kategori, akun, vendor, pesanan tidak valid ditolak", () => {
  assert.equal(parseExpenseFields(expForm({ category_id: "" })).ok, false);
  assert.equal(parseExpenseFields(expForm({ category_id: "x" })).ok, false);
  assert.equal(parseExpenseFields(expForm({ account_id: "" })).ok, false);
  assert.equal(parseExpenseFields(expForm({ vendor_id: "bukan-uuid" })).ok, false);
  assert.equal(parseExpenseFields(expForm({ order_id: "' or 1=1 --" })).ok, false);
});
test("keterangan minimal 3 karakter (setelah dirapikan) dan tanggal harus nyata", () => {
  assert.equal(parseExpenseFields(expForm({ description: "ab" })).ok, false);
  assert.equal(parseExpenseFields(expForm({ description: "   " })).ok, false);
  assert.equal(parseExpenseFields(expForm({ description: "a   " })).ok, false); // spasi di ujung tidak dihitung
  const collapsed = parseExpenseFields(expForm({ description: "a  b" })); // dirapikan jadi "a b" (3 karakter) — sah
  assert.equal(collapsed.ok && collapsed.value.description, "a b");
  assert.equal(parseExpenseFields(expForm({ description: "abc" })).ok, true);
  assert.equal(parseExpenseFields(expForm({ spent_at: "2026-02-30" })).ok, false);
  assert.equal(parseExpenseFields(expForm({ spent_at: "" })).ok, false);
});
test("nominal: angka bulat > 0 tanpa titik/koma/minus/huruf, maksimal Rp100 miliar", () => {
  for (const amount of ["", "0", "-5", "1.5", "1,000", "1e6", "abc", " ", "9999999999999", "100000000001"]) {
    assert.equal(parseExpenseFields(expForm({ amount })).ok, false, `amount=${JSON.stringify(amount)}`);
  }
  assert.equal(parseExpenseFields(expForm({ amount: "100000000000" })).ok, true);
});

console.log("baris pengeluaran (toExpenseRow)");
test("path bukti TIDAK ikut ke browser; hanya has_proof", () => {
  const raw = { id: "x1", category_id: CID, account_id: AID, vendor_id: null, order_id: null, amount: 5, proof_path: "expenses/rahasia.jpg" };
  const row = toExpenseRow(raw);
  assert.equal(row.has_proof, true);
  assert.equal("proof_path" in row, false);
  assert.equal(JSON.stringify(row).includes("rahasia"), false);
  assert.equal(toExpenseRow({ ...raw, proof_path: null }).has_proof, false);
});
test("nama kategori, akun, vendor, pesanan dari lookup; tanpa lookup → null", () => {
  const raw = { id: "x1", category_id: CID, account_id: AID, vendor_id: VID, order_id: OID, proof_path: null };
  const lookups = {
    categories: new Map([[CID, "Bahan baku"]]),
    accounts: new Map([[AID, "Kas Tunai"]]),
    vendors: new Map([[VID, "Toko Kain Jaya"]]),
    orders: new Map([[OID, { kode_produksi: "K-1", nama_pemesan: "SMP 1" }]]),
  };
  const row = toExpenseRow(raw, lookups);
  assert.deepEqual(
    [row.category_name, row.account_name, row.vendor_name, row.order_kode, row.order_nama],
    ["Bahan baku", "Kas Tunai", "Toko Kain Jaya", "K-1", "SMP 1"],
  );
  const bare = toExpenseRow(raw);
  assert.deepEqual([bare.category_name, bare.vendor_name, bare.order_kode], [null, null, null]);
  // tanpa vendor/pesanan di baris → null walau lookup ada
  const none = toExpenseRow({ ...raw, vendor_id: null, order_id: null }, lookups);
  assert.deepEqual([none.vendor_name, none.order_kode], [null, null]);
});

console.log("pencarian pesanan (sanitizeLookupQuery)");
test("karakter pola dibuang; terlalu pendek → kosong; dibatasi 60 karakter", () => {
  assert.equal(sanitizeLookupQuery("K-10"), "K-10");
  assert.equal(sanitizeLookupQuery("  smp   1  "), "smp 1");
  assert.equal(sanitizeLookupQuery("%_*\\"), "");
  assert.equal(sanitizeLookupQuery("a%"), "");
  assert.equal(sanitizeLookupQuery("ab%cd"), "ab cd");
  assert.equal(sanitizeLookupQuery(null), "");
  assert.equal(sanitizeLookupQuery(undefined), "");
  assert.equal(sanitizeLookupQuery("x".repeat(200)).length, 60);
});

console.log("aturan form pengeluaran (view.ts)");
test("bukti wajib bila nominal mencapai ambang; ambang 0 = tidak pernah wajib", () => {
  assert.equal(expenseProofRequired(499_999, 500_000), false);
  assert.equal(expenseProofRequired(500_000, 500_000), true);
  assert.equal(expenseProofRequired(9_000_000, 0), false);
  assert.equal(expenseProofRequired(1, 0), false);
});
const ef = (over: Partial<Parameters<typeof expenseFormState>[0]> = {}) =>
  expenseFormState({
    amount: 150_000, threshold: 500_000, hasCategory: true, hasAccount: true, hasDate: true,
    description: "Benang jahit", hasFile: false, ...over,
  });
test("Simpan menyala bila semua lengkap; mati bila kurang satu pun", () => {
  assert.equal(ef().canSubmit, true);
  assert.equal(ef({ amount: 0 }).canSubmit, false);
  assert.equal(ef({ hasCategory: false }).canSubmit, false);
  assert.equal(ef({ hasAccount: false }).canSubmit, false);
  assert.equal(ef({ hasDate: false }).canSubmit, false);
  assert.equal(ef({ description: "ab" }).canSubmit, false);
  assert.equal(ef({ description: "  ab  " }).canSubmit, false);
});
test("di atas ambang: butuh file bukti; di bawah ambang tidak", () => {
  assert.deepEqual(ef({ amount: 2_000_000 }), { needProof: true, canSubmit: false });
  assert.deepEqual(ef({ amount: 2_000_000, hasFile: true }), { needProof: true, canSubmit: true });
  assert.deepEqual(ef({ amount: 499_999 }), { needProof: false, canSubmit: true });
  assert.deepEqual(ef({ amount: 2_000_000, threshold: 0 }), { needProof: false, canSubmit: true });
});

console.log("ringkasan pengeluaran (expenseTotals / expensesByCategory)");
const xs = [
  { status: "approved" as const, amount: 1_000_000, category_name: "Bahan baku" },
  { status: "approved" as const, amount: 500_000, category_name: "Bahan baku" },
  { status: "approved" as const, amount: 300_000, category_name: "Operasional" },
  { status: "pending" as const, amount: 250_000, category_name: "Bahan baku" },
  { status: "pending" as const, amount: 50_000, category_name: "Lain-lain" },
  { status: "rejected" as const, amount: 999_999, category_name: "Bahan baku" },
  { status: "void" as const, amount: 888_888, category_name: "Operasional" },
];
test("total disetujui & menunggu; ditolak dan void tidak dihitung", () => {
  assert.deepEqual(expenseTotals(xs), { approved: 1_800_000, pending: 300_000, pendingCount: 2 });
  assert.deepEqual(expenseTotals([]), { approved: 0, pending: 0, pendingCount: 0 });
});
test("per kategori: hanya yang disetujui, terbesar dulu, dibatasi top", () => {
  assert.deepEqual(expensesByCategory(xs), [["Bahan baku", 1_500_000], ["Operasional", 300_000]]);
  assert.deepEqual(expensesByCategory(xs, 1), [["Bahan baku", 1_500_000]]);
  assert.deepEqual(expensesByCategory([{ status: "approved", amount: 5, category_name: null }]), [["Tanpa kategori", 5]]);
  assert.deepEqual(expensesByCategory([]), []);
});

// ─── Ringkasan, Laporan, Panduan, Audit (langkah 6.6) ───────────────────────────
console.log("laporan (report.ts)");
test("semua bucket umur piutang punya label dan urutan; nada: telat lama merah, baru telat kuning", () => {
  assert.equal(AGING_ORDER.length, 5);
  for (const b of AGING_ORDER) assert.ok(BUCKET_LABEL[b].length > 3, b);
  assert.deepEqual(AGING_ORDER.map(bucketTone), ["neutral", "amber", "red", "red", "neutral"]);
});
test("monthLabel & pct", () => {
  assert.match(monthLabel("2026-10"), /Okt\s2026/);
  assert.equal(monthLabel("bukan-bulan"), "bukan-bulan");
  assert.equal(pct(25, 100), "25.0%");
  assert.equal(pct(1, 3), "33.3%");
  assert.equal(pct(5, 0), "-");
  assert.equal(pct(-10, 100), "-10.0%");
});
const ro = (kode: string, total: number, dc: number): ReportOrder => ({
  order_id: kode, kode_produksi: kode, nama_pemesan: "x", tanggal_masuk: "2026-10-01", total, paid: 0, direct_cost: dc, gross: total - dc,
});
test("sortReportOrders: terendah/tertinggi, seri berdasar kode, masukan tidak berubah", () => {
  const list = [ro("K-2", 100, 10), ro("K-1", 100, 10), ro("K-3", 50, 80), ro("K-4", 200, 0)];
  const before = list.map((o) => o.kode_produksi).join();
  assert.deepEqual(sortReportOrders(list, "lowest").map((o) => o.kode_produksi), ["K-3", "K-1", "K-2", "K-4"]);
  assert.deepEqual(sortReportOrders(list, "highest").map((o) => o.kode_produksi), ["K-4", "K-1", "K-2", "K-3"]);
  assert.deepEqual(sortReportOrders(list, "newest").map((o) => o.kode_produksi), ["K-2", "K-1", "K-3", "K-4"]);
  assert.equal(list.map((o) => o.kode_produksi).join(), before);
  assert.equal(lossOrders(list), 1);
  assert.equal(lossOrders([]), 0);
});
test("datePreset: bulan ini, 3 bulan (melewati pergantian tahun), tahun ini", () => {
  const now = new Date(2026, 9, 22); // 22 Okt 2026
  assert.deepEqual(datePreset("month", now), { from: "2026-10-01", to: "2026-10-22" });
  assert.deepEqual(datePreset("3m", now), { from: "2026-08-01", to: "2026-10-22" });
  assert.deepEqual(datePreset("year", now), { from: "2026-01-01", to: "2026-10-22" });
  assert.deepEqual(datePreset("3m", new Date(2026, 0, 15)), { from: "2025-11-01", to: "2026-01-15" });
});
test("isValidRange", () => {
  assert.equal(isValidRange("2026-10-01", "2026-10-31"), true);
  assert.equal(isValidRange("2026-10-01", "2026-10-01"), true);
  assert.equal(isValidRange("2026-10-31", "2026-10-01"), false);
  assert.equal(isValidRange("", "2026-10-01"), false);
});
const tot = (over: Partial<ReportData["totals"]> = {}): ReportData["totals"] => ({
  revenue: 10_000_000, expenses: 4_000_000, profit: 6_000_000, cash_in: 0, cash_out: 4_000_000, cash_net: 0,
  unpaid_billed: 0, expenses_linked: 4_000_000, expenses_unlinked: 0, ...over,
});
test("peringatan kelengkapan: tanpa biaya, biaya belum ditautkan, rugi, dan normal tanpa peringatan", () => {
  assert.deepEqual(reportWarnings(tot()), []);
  const noExp = reportWarnings(tot({ expenses: 0, profit: 10_000_000, expenses_linked: 0 }));
  assert.equal(noExp.length, 1);
  assert.match(noExp[0], /Belum ada pengeluaran disetujui/);
  const unlinked = reportWarnings(tot({ expenses_linked: 1_000_000, expenses_unlinked: 3_000_000 }));
  assert.equal(unlinked.length, 1);
  assert.match(unlinked[0], /Rp3\.000\.000 \(75\.0%\) pengeluaran belum ditautkan/);
  const loss = reportWarnings(tot({ expenses: 12_000_000, profit: -2_000_000, expenses_linked: 12_000_000 }));
  assert.deepEqual(loss, ["Biaya melebihi pendapatan pada periode ini."]);
  assert.equal(reportWarnings(tot({ revenue: 0, expenses: 0, profit: 0, expenses_linked: 0 })).length, 0);
});

console.log("panduan (guideTasks.ts)");
const capsOf = (c: Partial<Record<"view" | "maker" | "approver" | "delete", boolean>>, isSuperAdmin = false) => ({
  view: true, maker: false, approver: false, delete: false, ...c, isSuperAdmin,
});
test("tugas disaring menurut hak: lihat saja, hanya-create, hanya-edit, Super Admin", () => {
  const ids = (c: ReturnType<typeof capsOf>) => tasksFor(c).map((t) => t.id).sort();
  assert.deepEqual(ids(capsOf({})), ["w-aging"]);
  assert.deepEqual(ids(capsOf({ maker: true })), ["d-expense", "d-invoice", "d-payment", "w-aging", "w-complete", "w-unbilled"]);
  assert.deepEqual(ids(capsOf({ approver: true })), ["d-approve", "d-verify", "m-reconcile", "m-report", "w-aging"]);
  assert.equal(ids(capsOf({ maker: true, approver: true, delete: true }, true)).length, TASKS.length);
  assert.equal(canDo(TASKS.find((t) => t.id === "m-audit")!, capsOf({ maker: true, approver: true, delete: true })), false);
  assert.equal(canDo(TASKS.find((t) => t.id === "m-audit")!, capsOf({}, true)), true);
});
test("isi panduan konsisten: id unik, langkah ada, tab tujuan sah, FAQ/aturan/belum-tersedia terisi", () => {
  assert.equal(new Set(TASKS.map((t) => t.id)).size, TASKS.length);
  const targets = ["overview", "invoices", "payments", "verify", "expenses", "report", "audit", "info"];
  for (const t of TASKS) {
    assert.ok(t.steps.length >= 2, t.id);
    assert.ok(t.title && t.why, t.id);
    if (t.go) assert.ok(targets.includes(t.go.tab), `${t.id} -> ${t.go.tab}`);
  }
  assert.ok(RULES.length >= 3 && FAQ.length >= 8 && COMING_SOON.length >= 1);
  for (const f of FAQ) assert.ok(f.q.endsWith("?") || f.q.endsWith("."), f.q);
});
test("periodKey: harian = tanggal, mingguan = Senin minggu itu (juga lintas tahun), bulanan = YYYY-MM", () => {
  assert.equal(periodKey("daily", new Date(2026, 9, 22)), "2026-10-22");
  assert.equal(periodKey("monthly", new Date(2026, 9, 22)), "2026-10");
  assert.equal(periodKey("weekly", new Date(2026, 9, 22)), "2026-10-19"); // Kamis → Senin
  assert.equal(periodKey("weekly", new Date(2026, 9, 25)), "2026-10-19"); // Minggu → Senin sebelumnya
  assert.equal(periodKey("weekly", new Date(2026, 9, 26)), "2026-10-26"); // Senin → dirinya
  assert.equal(periodKey("weekly", new Date(2026, 0, 1)), "2025-12-29"); // 1 Jan 2026 (Kamis)
});
test("pruneDone: centang periode berjalan dipertahankan; periode lama & tugas yang tak berlaku dibuang", () => {
  const caps = capsOf({ maker: true, approver: true });
  const tasks = tasksFor(caps);
  const now = new Date(2026, 9, 22);
  const t = tasks.find((x) => x.id === "d-payment")!;
  const done = {
    [taskKey(t, now)]: true as const,
    "d-payment|2026-10-21": true as const, // kemarin
    "w-aging|2026-10-12": true as const, // minggu lalu
    "tugas-hilang|2026-10-22": true as const,
  };
  assert.deepEqual(pruneDone(done, tasks, now), { [taskKey(t, now)]: true });
  assert.deepEqual(pruneDone({}, tasks, now), {});
});

console.log("kontrak audit: label harus mencakup semua aksi yang ditulis database");
test("setiap aksi di migration & API punya label, dan jenisnya terdaftar di AUDIT_ENTITIES", () => {
  const dir = join(process.cwd(), "supabase", "migrations");
  const sql = readdirSync(dir).filter((f) => f.endsWith(".sql")).map((f) => readFileSync(join(dir, f), "utf8")).join("\n");
  const found = new Set([...sql.matchAll(/'((?:invoice|payment|expense|vendor|export|settings)\.[a-z_]+)'/g)].map((m) => m[1]));
  // Aksi yang ditulis route API lewat fin_audit (p_action: "x.y") — dipindai otomatis supaya tak ada yang terlewat.
  const walk = (d: string): string[] =>
    readdirSync(d).flatMap((f) => {
      const full = join(d, f);
      return statSync(full).isDirectory() ? walk(full) : full.endsWith("route.ts") ? [full] : [];
    });
  const apiActions = walk(join(process.cwd(), "app", "api", "finance"))
    .flatMap((f) => [...readFileSync(f, "utf8").matchAll(/p_action:\s*"([a-z]+\.[a-z_]+)"/g)].map((m) => m[1]));
  for (const a of apiActions) found.add(a);
  assert.ok(apiActions.includes("vendor.create") && apiActions.includes("export.excel") && apiActions.includes("settings.invoice"), `aksi API: ${apiActions}`);
  assert.ok(found.size >= 13, `hanya ${found.size} aksi ditemukan`);
  for (const a of found) assert.ok(AUDIT_ACTION_LABEL[a], `label untuk ${a} belum ada`);
  for (const a of Object.keys(AUDIT_ACTION_LABEL)) {
    assert.ok((AUDIT_ENTITIES as readonly string[]).includes(a.split(".")[0]), `jenis untuk ${a}`);
  }
});

// ─── Invoice, pengaturan invoice, dan ekspor Excel (langkah 6.7) ──────────────────
console.log("pengaturan invoice (invoiceSettings.ts)");
const PNG = "data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNkYPhfDwAChwGA60e6kgAAAABJRU5ErkJggg==";
test("masukan valid diterima dan dirapikan; nama kosong jatuh ke bawaan; rekening kosong diabaikan", () => {
  const r = sanitizeInvoiceSettings({
    store_name: "  Langitan Konveksi  ", store_address: "Widang, Tuban", header_image: PNG,
    accounts: [{ bank: " BCA ", number: "123 456", holder: "PT Contoh" }, { bank: "", number: "", holder: "" }],
    payment_note: "Transfer lalu kirim bukti", show_signature: true, signature_image: PNG, signature_name: "Majid", signature_title: "Direktur",
  });
  assert.equal(r.ok, true);
  if (!r.ok) return;
  assert.equal(r.value.store_name, "Langitan Konveksi");
  assert.deepEqual(r.value.accounts, [{ bank: "BCA", number: "123 456", holder: "PT Contoh" }]);
  assert.equal(r.value.show_signature, true);
  const blank = sanitizeInvoiceSettings({ store_name: "   " });
  assert.equal(blank.ok && blank.value.store_name, DEFAULT_INVOICE_SETTINGS.store_name);
  assert.equal(blank.ok && blank.value.header_image, null);
});
test("gambar: hanya data URL png/jpeg/webp; SVG, URL luar, skrip, dan yang terlalu besar ditolak", () => {
  const bad = [
    "data:image/svg+xml;base64,PHN2Zz48L3N2Zz4=",
    "https://evil.example/x.png",
    "javascript:alert(1)",
    "data:image/png;base64,AAAA<script>",
    "data:text/html;base64,PHNjcmlwdD4=",
    `data:image/png;base64,${"A".repeat(MAX_HEADER_DATAURL)}`,
    123,
  ];
  for (const header_image of bad) assert.equal(sanitizeInvoiceSettings({ header_image }).ok, false, String(header_image).slice(0, 30));
  assert.equal(sanitizeInvoiceSettings({ signature_image: bad[0] }).ok, false);
  assert.equal(sanitizeInvoiceSettings({ header_image: null }).ok, true);
  assert.equal(sanitizeInvoiceSettings({ header_image: "" }).ok, true);
});
test("rekening: maksimal 4, bank & nomor wajib berpasangan, bukan array ditolak", () => {
  const acc = (i: number) => ({ bank: `B${i}`, number: `${i}`.repeat(5), holder: "" });
  assert.equal(sanitizeInvoiceSettings({ accounts: Array.from({ length: MAX_ACCOUNTS }, (_, i) => acc(i)) }).ok, true);
  assert.equal(sanitizeInvoiceSettings({ accounts: Array.from({ length: MAX_ACCOUNTS + 1 }, (_, i) => acc(i)) }).ok, false);
  assert.equal(sanitizeInvoiceSettings({ accounts: [{ bank: "BCA", number: "", holder: "x" }] }).ok, false);
  assert.equal(sanitizeInvoiceSettings({ accounts: [{ bank: "", number: "123", holder: "" }] }).ok, false);
  assert.equal(sanitizeInvoiceSettings({ accounts: "BCA 123" }).ok, false);
  assert.equal(sanitizeInvoiceSettings(null).ok, false);
  assert.equal(sanitizeInvoiceSettings("x").ok, false);
});
test("show_signature hanya true bila benar-benar boolean true; teks panjang dipotong", () => {
  const r = sanitizeInvoiceSettings({ show_signature: "true", payment_note: "x".repeat(900), store_address: "y".repeat(900) });
  assert.equal(r.ok && r.value.show_signature, false);
  assert.equal(r.ok && r.value.payment_note.length, 300);
  assert.equal(r.ok && r.value.store_address.length, 250);
});
test("readInvoiceSettings: data rusak → bawaan lengkap; metadata ikut terbaca", () => {
  assert.deepEqual(readInvoiceSettings(undefined).accounts, []);
  assert.equal(readInvoiceSettings({ header_image: "bukan-gambar" }).header_image, DEFAULT_INVOICE_SETTINGS.header_image);
  const r = readInvoiceSettings({ store_name: "X", updated_by: "Sup", updated_at: "2026-10-22T00:00:00Z" });
  assert.deepEqual([r.store_name, r.updated_by, r.updated_at], ["X", "Sup", "2026-10-22T00:00:00Z"]);
});
test("log audit pengaturan tidak memuat data gambar", () => {
  const sum = summarizeInvoiceSettings({ ...DEFAULT_INVOICE_SETTINGS, header_image: PNG, signature_image: PNG, accounts: [{ bank: "BCA", number: "123", holder: "x" }] });
  const json = JSON.stringify(sum);
  assert.equal(json.includes("base64"), false);
  assert.match(String(sum.header_image), /^ada \(\d+ KB\)$/);
  assert.deepEqual(sum.accounts, ["BCA 123"]);
  assert.equal(formatAccountsText([{ bank: "BCA", number: "123", holder: "PT X" }, { bank: "BRI", number: "9", holder: "" }]), "BCA 123 a.n. PT X\nBRI 9");
});

console.log("model invoice (invoiceDoc.ts)");
const snap = [
  { item_id: "a", jenis_produksi: "seragam_sekolah", nama: "Seragam Sekolah", jumlah: 100, harga_per_pcs: 85_000, subtotal: 8_500_000 },
  { item_id: "b", jenis_produksi: "kaos_polo", nama: "Kaos Polo", jumlah: 50, harga_per_pcs: 60_000, subtotal: 3_000_000 },
];
const invRow = (over: Partial<InvoiceRow> = {}): InvoiceRow => ({
  id: "i1", order_id: "o1", version: 1, status: "active", pricing_snapshot: snap, total_pcs: 150, subtotal: 11_500_000,
  discount: 500_000, total: 11_000_000, reason: null, due_date: "2026-10-24", issued_by_name: "Sup", issued_at: "2026-10-10T03:00:00Z", ...over,
});
const payRow = (over: Partial<PaymentRow> = {}): PaymentRow => ({
  id: "p1", order_id: "o1", invoice_id: "i1", kind: "dp", amount: 4_000_000, paid_at: "2026-10-11", method: "transfer", account_id: "a1",
  reference_no: null, payer_name: null, note: null, status: "verified", has_proof: true, recorded_by_name: "K", recorded_at: "2026-10-11T03:00:00Z",
  verified_by_name: "S", verified_at: "2026-10-11T04:00:00Z", reject_reason: null, void_by_name: null, void_at: null, void_reason: null,
  account_name: "Bank BCA", orders: null, ...over,
});
const finRow = (over: Partial<OrderFinanceRow> = {}): OrderFinanceRow => ({
  order_id: "o1", kode_produksi: "K-10", nama_pemesan: "SMP 1", jenis_produksi: null, jumlah: 150, tanggal_masuk: "2026-10-01", deadline: "2026-11-01",
  order_status: "Produksi", invoice_id: "i1", invoice_version: 1, due_date: "2026-10-24", total: 11_000_000, paid_verified: 4_000_000, paid_pending: 0,
  balance: 7_000_000, overpaid: 0, payment_status: "DP", kategori: "utama", ...over,
});
const det = (over: Partial<OrderFinanceDetail> = {}): OrderFinanceDetail => ({
  finance: finRow(),
  order: { id: "o1", kode_produksi: "K-10", nama_pemesan: "SMP 1", no_hp: " 0812-3456-7890 ", alamat_pemesan: "Tuban", jumlah: 150, jenis_produksi: null, tanggal_masuk: "2026-10-01", kategori: "utama", items: [] },
  invoices: [invRow()], payments: [payRow()], invoice_stale: false, ...over,
});
test("DP: baris dari snapshot beku, angka dari server, hanya pembayaran TERVERIFIKASI yang tampil", () => {
  const m = buildInvoiceModel(det({ payments: [payRow(), payRow({ id: "p2", status: "pending", amount: 1_000_000 }), payRow({ id: "p3", status: "void", amount: 9 })] }))!;
  assert.equal(m.number, "INV-K-10");
  assert.equal(m.revisionNote, null);
  assert.equal(m.lines.length, 2);
  assert.match(m.lines[0].detail, /100 pcs × Rp\s?85\.000/);
  assert.deepEqual([m.subtotal, m.discount, m.total, m.paid, m.balance, m.overpaid], [11_500_000, 500_000, 11_000_000, 4_000_000, 7_000_000, 0]);
  assert.equal(m.payments.length, 1);
  assert.match(m.payments[0].label, /DP · Transfer · Bank BCA/);
  assert.equal(m.isLunas, false);
  assert.equal(m.dueDate, "2026-10-24");
  assert.equal(m.customerPhone, "0812-3456-7890"); // dirapikan
});
test("lunas / kelebihan bayar berstatus LUNAS; refund tampil sebagai pembayaran keluar; revisi ditandai", () => {
  const lunas = buildInvoiceModel(det({ finance: finRow({ payment_status: "Lunas", paid_verified: 11_000_000, balance: 0 }), payments: [payRow({ amount: 11_000_000 })] }))!;
  assert.equal(lunas.isLunas, true);
  assert.equal(lunas.lastPaidAt, "2026-10-11");
  assert.equal(buildInvoiceModel(det({ finance: finRow({ payment_status: "Kelebihan Bayar", overpaid: 500 }) }))!.isLunas, true);
  const refund = buildInvoiceModel(det({ payments: [payRow(), payRow({ id: "r", kind: "refund", amount: 100_000, paid_at: "2026-10-12" })] }))!;
  assert.equal(refund.payments[1].isRefund, true);
  assert.equal(refund.lastPaidAt, "2026-10-12");
  assert.equal(buildInvoiceModel(det({ invoices: [invRow({ version: 3 })] }))!.revisionNote, "Revisi ke-2");
});
test("pembayaran diurutkan menurut tanggal; versi lama (superseded) diabaikan", () => {
  const m = buildInvoiceModel(det({
    payments: [payRow({ id: "b", paid_at: "2026-10-20" }), payRow({ id: "a", paid_at: "2026-10-05" })],
    invoices: [invRow({ id: "lama", version: 1, status: "superseded", total: 1 }), invRow({ id: "baru", version: 2 })],
  }))!;
  assert.deepEqual(m.payments.map((p) => p.date), ["2026-10-05", "2026-10-20"]);
  assert.equal(m.revisionNote, "Revisi ke-1");
});
test("snapshot tidak cocok subtotal / kosong → satu baris ringkas; dokumen tak pernah menampilkan angka beda dari tagihan", () => {
  const wrong = buildInvoiceModel(det({ invoices: [invRow({ pricing_snapshot: [{ ...snap[0], subtotal: 1 }] })] }))!;
  assert.equal(wrong.lines.length, 1);
  assert.equal(wrong.lines[0].subtotal, 11_500_000);
  assert.match(wrong.lines[0].label, /K-10/);
  assert.equal(buildInvoiceModel(det({ invoices: [invRow({ pricing_snapshot: [] })] }))!.lines.length, 1);
  const ok = buildInvoiceModel(det())!;
  assert.equal(ok.lines.reduce((n, l) => n + l.subtotal, 0), ok.subtotal);
});
test("tanpa tagihan aktif → null", () => {
  assert.equal(buildInvoiceModel(det({ invoices: [] })), null);
  assert.equal(buildInvoiceModel(det({ invoices: [invRow({ status: "superseded" })] })), null);
});
test("normalizeWaNumber: 08… / +62 / 62… / 8… → 62…; terlalu pendek atau kosong → null", () => {
  assert.equal(normalizeWaNumber("0812-3456-7890"), "6281234567890");
  assert.equal(normalizeWaNumber("+62 812 3456 7890"), "6281234567890");
  assert.equal(normalizeWaNumber("6281234567890"), "6281234567890");
  assert.equal(normalizeWaNumber("81234567890"), "6281234567890");
  assert.equal(normalizeWaNumber("0812"), null);
  assert.equal(normalizeWaNumber(""), null);
  assert.equal(normalizeWaNumber(null), null);
  assert.equal(normalizeWaNumber("abc"), null);
  assert.equal(normalizeWaNumber("1".repeat(20)), null);
});
test("pesan WhatsApp: belum lunas memuat sisa, jatuh tempo, rekening; lunas berterima kasih tanpa rekening", () => {
  const dp = buildInvoiceModel(det())!;
  const t = buildWaText(dp, "Langitan", "BCA 123 a.n. PT X");
  for (const re of [/Halo SMP 1/, /INV-K-10/, /Total tagihan: Rp\s?11\.000\.000/, /Sudah dibayar: Rp\s?4\.000\.000/, /Sisa yang harus dibayar: Rp\s?7\.000\.000/, /Jatuh tempo/, /BCA 123 a\.n\. PT X/, /bukti transfer/]) assert.match(t, re);
  const lunas = buildInvoiceModel(det({ finance: finRow({ payment_status: "Lunas", paid_verified: 11_000_000, balance: 0 }), payments: [payRow({ amount: 11_000_000 })] }))!;
  const l = buildWaText(lunas, "Langitan", "BCA 123");
  assert.match(l, /LUNAS/);
  assert.doesNotMatch(l, /BCA 123/);
  assert.doesNotMatch(l, /Sisa yang harus dibayar/);
  assert.doesNotMatch(buildWaText(dp, "Langitan", "   "), /Pembayaran ke/);
});
test("tanggal panjang & data contoh pratinjau", () => {
  assert.match(invoiceDateLong("2026-10-22"), /22 Oktober 2026/);
  assert.equal(invoiceDateLong(null), "-");
  assert.equal(invoiceDateLong("bukan"), "-");
  const dp = buildSampleInvoiceModel(false);
  const lunas = buildSampleInvoiceModel(true);
  assert.equal(dp.balance, dp.total - dp.paid);
  assert.equal(lunas.balance, 0);
  assert.equal(lunas.payments.reduce((n, p) => n + p.amount, 0), lunas.total);
  assert.equal(dp.lines.reduce((n, l) => n + l.subtotal, 0), dp.subtotal);
  assert.equal(dp.subtotal - dp.discount, dp.total);
});
test("escapeHtml menetralkan tag dan tanda kutip (judul dokumen cetak)", () => {
  assert.equal(escapeHtml(`</title><script>alert("x")</script>&'`), "&lt;/title&gt;&lt;script&gt;alert(&quot;x&quot;)&lt;/script&gt;&amp;&#39;");
  assert.equal(escapeHtml("Invoice INV-K-1"), "Invoice INV-K-1");
});

console.log("ekspor Excel (excel.ts)");
test("nama lembar & nama file aman", () => {
  assert.equal(sanitizeSheetName("Laba/Rugi: [Okt]*?"), "Laba Rugi Okt");
  assert.equal(sanitizeSheetName("x".repeat(60)).length, 31);
  assert.equal(sanitizeSheetName("///"), "Data");
  assert.equal(exportFileName("Laporan 2026-01-01 sd 2026-10-22", "2026-10-22"), "Keuangan-Laporan-2026-01-01-sd-2026-10-22-2026-10-22.xlsx");
  assert.equal(exportFileName("../../etc/passwd", "2026-10-22"), "Keuangan-etc-passwd-2026-10-22.xlsx");
  assert.equal(exportFileName("???", "2026-10-22"), "Keuangan-Data-2026-10-22.xlsx");
});
test("lembar tagihan/pembayaran/pengeluaran: kolom sesuai header, angka tetap angka, alasan sesuai status", () => {
  const inv = invoicesSheet([finRow()]);
  assert.equal(inv.rows[0].length, inv.header.length);
  assert.equal(inv.rows[0][6], 11_000_000);
  assert.equal(typeof inv.rows[0][6], "number");
  const pay = paymentsSheet([payRow({ status: "rejected", reject_reason: "Bukti buram", orders: { kode_produksi: "K-10", nama_pemesan: "SMP 1" } }), payRow({ kind: "refund", status: "void", void_reason: "salah" })]);
  assert.equal(pay.rows[0].length, pay.header.length);
  assert.equal(pay.rows[0][13], "Bukti buram");
  assert.equal(pay.rows[1][13], "salah");
  assert.equal(pay.rows[1][4], "Keluar (refund)");
  assert.equal(pay.rows[0][4], "Masuk");
  const x: ExpenseRow = {
    id: "x", expense_no: "EXP-2610-00001", category_id: "c", account_id: "a", vendor_id: null, order_id: null, source: "salary", source_ref: null,
    description: "Gaji", amount: 5_000_000, spent_at: "2026-10-10", note: null, status: "approved", has_proof: false, recorded_by_name: "S", recorded_at: "2026-10-10T00:00:00Z",
    approved_by_name: "S", approved_at: "2026-10-10T00:00:00Z", reject_reason: null, void_by_name: null, void_at: null, void_reason: null,
    category_name: "Gaji & upah", account_name: "Kas", vendor_name: null, order_kode: null, order_nama: null,
  };
  const ex = expensesSheet([x]);
  assert.equal(ex.rows[0].length, ex.header.length);
  assert.equal(ex.rows[0][13], "Gaji");
  assert.equal(ex.rows[0][7], 5_000_000);
});
const rpt: ReportData = {
  period: { from: "2026-09-01", to: "2026-10-31" },
  totals: { revenue: 28_000_000, expenses: 2_000_000, profit: 26_000_000, cash_in: 12_300_000, cash_out: 2_000_000, cash_net: 10_300_000, unpaid_billed: 15_700_000, expenses_linked: 600_000, expenses_unlinked: 1_400_000 },
  months: [{ month: "2026-09", revenue: 10_000_000, expenses: 1_000_000, profit: 9_000_000, cash_in: 8_500_000, cash_out: 1_000_000, cash_net: 7_500_000 }],
  by_category: [{ name: "Bahan baku", amount: 1_600_000 }],
  orders: [{ order_id: "o", kode_produksi: "K-A", nama_pemesan: "A", tanggal_masuk: "2026-10-05", total: 10_000_000, paid: 4_000_000, direct_cost: 600_000, gross: 9_400_000 }],
  orders_total: 412,
};
test("laporan: 4 lembar; lembar pesanan memberi catatan bila daftar terpotong", () => {
  const sheets = reportSheets(rpt);
  assert.deepEqual(sheets.map((s) => s.name), ["Ringkasan", "Per bulan", "Per kategori", "Per pesanan"]);
  assert.match(sheets[3].note ?? "", /Menampilkan 1 pesanan terbaru dari 412/);
  assert.equal(reportSheets({ ...rpt, orders_total: 1 })[3].note, undefined);
  assert.equal(sheets[0].rows[0][1], "2026-09-01 s/d 2026-10-31");
  for (const sh of sheets) for (const r of sh.rows) assert.equal(r.length, sh.header.length, sh.name);
});
test("file .xlsx sungguhan: angka bisa dijumlah (format #,##0), teks tetap teks, rumus TIDAK dievaluasi, lembar & lebar benar", () => {
  const evil = "=HYPERLINK(\"http://evil\",\"klik\")";
  const sheets = [
    { ...invoicesSheet([finRow({ nama_pemesan: evil }), finRow({ order_id: "o2", kode_produksi: "K-11", total: 1_000, paid_verified: 0, balance: 1_000 })]), name: "Tagihan" },
    { ...paymentsSheet([payRow()]), name: "tagihan" }, // nama kembar (beda huruf besar) harus dibuat unik
    ...reportSheets(rpt),
  ];
  const wb = buildWorkbook(XLSX, sheets);
  const buf = XLSX.write(wb, { type: "buffer", bookType: "xlsx" }) as Buffer;
  const back = XLSX.read(buf, { type: "buffer", cellNF: true, cellStyles: true }); // baca format angka (.z) dan lebar kolom dari file
  assert.equal(new Set(back.SheetNames.map((n) => n.toLowerCase())).size, back.SheetNames.length);
  assert.equal(back.SheetNames[0], "Tagihan");
  assert.ok(back.SheetNames.includes("Ringkasan") && back.SheetNames.includes("Per pesanan"));

  const ws = back.Sheets["Tagihan"];
  assert.equal(ws["G2"].v, 11_000_000);
  assert.equal(ws["G2"].t, "n");
  assert.equal(ws["G2"].z, "#,##0");
  assert.equal(ws["G3"].v, 1_000);
  // string yang diawali "=" tetap string, tanpa rumus
  assert.equal(ws["B2"].t, "s");
  assert.equal(ws["B2"].f, undefined);
  assert.equal(ws["B2"].v, evil);
  // jumlah kolom nominal bisa dihitung
  assert.equal(XLSX.utils.sheet_to_json<Record<string, number>>(ws).reduce((n, r) => n + Number(r["Tagihan"]), 0), 11_001_000);
  // catatan pada lembar pesanan
  const orders = XLSX.utils.sheet_to_json<unknown[]>(back.Sheets["Per pesanan"], { header: 1 });
  assert.match(String(orders[orders.length - 1][0]), /Menampilkan 1 pesanan terbaru dari 412/);
  // lebar kolom terisi dan dibatasi
  const cols = (ws["!cols"] ?? []) as { wch: number }[];
  assert.ok(cols.length === 11 && cols.every((c) => c.wch >= 3 && c.wch <= 48));
});

console.log(`\n${passed} uji lulus`);
