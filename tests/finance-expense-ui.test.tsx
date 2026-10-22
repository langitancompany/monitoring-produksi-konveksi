// tests/finance-expense-ui.test.tsx — uji asap (smoke) layar Pengeluaran: dirender di server tanpa galat
// dan memuat teks/tombol kunci sesuai hak & status. Bukan pengganti uji klik di browser.
// Jalankan: npx tsx tests/finance-expense-ui.test.tsx
import assert from "node:assert/strict";
import React from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { DialogProvider } from "../app/components/ui/DialogProvider";
import RecordExpenseModal from "../app/components/finance/RecordExpenseModal";
import { ExpenseRow } from "../app/components/finance/ExpenseRow";
import { ExpenseStatusBadge } from "../app/components/finance/StatusBadge";
import { resolveFinanceCaps } from "../lib/finance/caps";
import type { ExpenseRow as Exp, FinanceMeta } from "../lib/finance/types";

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

const meta = (over: Partial<FinanceMeta> = {}, createCap = true): FinanceMeta => ({
  accounts: [
    { id: "a1", code: "KAS", name: "Kas Tunai", type: "cash" },
    { id: "a2", code: "BANK", name: "Rekening Bank", type: "bank" },
  ],
  categories: [
    { id: "c1", code: "BAHAN", name: "Bahan baku" },
    { id: "c2", code: "OPERASIONAL", name: "Operasional" },
  ],
  settings: {
    require_proof_non_cash: true, require_separate_verifier: false, allow_overpayment: false,
    auto_verify_own_payment: false, auto_approve_own_expense: false, expense_proof_required_above: 500_000,
    salary_default_account_code: "KAS",
  },
  caps: { view: true, create: createCap, edit: true, delete: true, isSupervisor: false },
  pending_count: 0,
  pending_expense_count: 0,
  user_id: "u1",
  ...over,
});

const exp = (over: Partial<Exp> = {}): Exp => ({
  id: "x1", expense_no: "EXP-2610-00001", category_id: "c1", account_id: "a1", vendor_id: "v1", order_id: "o1",
  source: "manual", source_ref: null, description: "Benang jahit 10 cone", amount: 150_000, spent_at: "2026-10-19",
  note: null, status: "pending", has_proof: true, recorded_by_name: "Kasir", recorded_at: "2026-10-19T04:00:00Z",
  approved_by_name: null, approved_at: null, reject_reason: null, void_by_name: null, void_at: null, void_reason: null,
  category_name: "Bahan baku", account_name: "Kas Tunai", vendor_name: "Toko Kain Jaya", order_kode: "K-10",
  order_nama: "SMP 1", ...over,
});
const actions = {
  busyId: null, approve: async () => true, openProof: async () => {}, reject: () => {}, voidExpense: () => {}, node: null,
} as unknown as React.ComponentProps<typeof ExpenseRow>["actions"];
const noop = () => {};
const sup = resolveFinanceCaps({ role: "supervisor" }, null);

console.log("form pengeluaran (RecordExpenseModal)");
test("menampilkan kategori, akun, ambang bukti, dan tombol tambah vendor bila boleh membuat", () => {
  const out = html(<RecordExpenseModal meta={meta()} vendors={[{ id: "v1", name: "Toko Kain Jaya", phone: null }]} onVendorAdded={noop} onClose={noop} onDone={noop} />);
  for (const t of ["Catat pengeluaran", "Bahan baku", "Operasional", "Kas Tunai", "Rekening Bank", "Toko Kain Jaya", "Biaya langsung untuk pesanan"]) {
    assert.match(out, new RegExp(t));
  }
  assert.match(out, /Opsional di bawah Rp\s?500\.000/);
  assert.match(out, /Tambah vendor baru/);
});
test("tanpa hak create: tidak ada tombol tambah vendor", () => {
  const out = html(<RecordExpenseModal meta={meta({}, false)} vendors={[]} onVendorAdded={noop} onClose={noop} onDone={noop} />);
  assert.doesNotMatch(out, /Tambah vendor baru/);
});
test("ambang 0: bukti selalu opsional", () => {
  const m = meta();
  m.settings.expense_proof_required_above = 0;
  const out = html(<RecordExpenseModal meta={m} vendors={[]} onVendorAdded={noop} onClose={noop} onDone={noop} />);
  assert.doesNotMatch(out, /Opsional di bawah/);
  assert.match(out, /Opsional\./);
});

console.log("baris pengeluaran (ExpenseRow)");
test("pending + berhak: Setujui, Tolak, Void, Lihat bukti; kode pesanan & vendor tampil", () => {
  const out = html(<ExpenseRow x={exp()} caps={sup} actions={actions} />);
  for (const t of ["Setujui", "Tolak", "Void", "Lihat bukti", "K-10", "Toko Kain Jaya", "EXP-2610-00001", "Menunggu persetujuan"]) {
    assert.match(out, new RegExp(t));
  }
});
test("tanpa hak edit/hapus: tidak ada tombol Setujui/Tolak/Void", () => {
  const caps = resolveFinanceCaps({ role: "admin" }, { view: true });
  const out = html(<ExpenseRow x={exp()} caps={caps} actions={actions} />);
  assert.doesNotMatch(out, />\s*Setujui/);
  assert.doesNotMatch(out, /Tolak/);
  assert.doesNotMatch(out, /Void/);
  assert.match(out, /Lihat bukti/);
});
test("disetujui hanya boleh di-void; ditolak/void tanpa aksi, alasan tampil", () => {
  const approved = html(<ExpenseRow x={exp({ status: "approved", approved_at: "2026-10-20T01:00:00Z", approved_by_name: "Sup" })} caps={sup} actions={actions} />);
  assert.doesNotMatch(approved, />\s*Tolak/);
  assert.match(approved, /Void/);
  assert.match(approved, /Disetujui Sup/);
  const rejected = html(<ExpenseRow x={exp({ status: "rejected", reject_reason: "Nota buram" })} caps={sup} actions={actions} />);
  assert.match(rejected, /Ditolak: Nota buram/);
  assert.doesNotMatch(rejected, /Void/);
  const voided = html(<ExpenseRow x={exp({ status: "void", void_reason: "salah input", void_by_name: "Sup" })} caps={sup} actions={actions} />);
  assert.match(voided, /Dibatalkan Sup · salah input/);
});
test("pengeluaran gaji tidak punya tombol Void (hanya lewat Batal lunas) dan menandai sumbernya", () => {
  const out = html(<ExpenseRow x={exp({ source: "salary", status: "approved", has_proof: false })} caps={sup} actions={actions} />);
  assert.doesNotMatch(out, /Void/);
  assert.match(out, /Sumber: Gaji/);
});
test("tanpa bukti: tidak ada tombol Lihat bukti; path bukti tak bocor", () => {
  const out = html(<ExpenseRow x={exp({ has_proof: false })} caps={sup} actions={actions} />);
  assert.doesNotMatch(out, /Lihat bukti/);
  assert.doesNotMatch(out, /proof_path|finance-proofs|expenses\//);
});

console.log("lencana status");
test("semua status pengeluaran dapat dirender dengan labelnya", () => {
  for (const [s, label] of [["pending", "Menunggu persetujuan"], ["approved", "Disetujui"], ["rejected", "Ditolak"], ["void", "Dibatalkan"]] as const) {
    assert.match(html(<ExpenseStatusBadge status={s} />), new RegExp(label));
  }
});

console.log(`\n${passed} uji lulus`);
