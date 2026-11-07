// Jalankan: npx tsx tests/inventory.test.ts
import assert from "node:assert/strict";
import type { OrderItem, ProductionTypeData } from "../types/order";
import { expectedLines, skuKey, skuLabel } from "../lib/inventory/sku";
import { invError, stripInvPrefix, validateVerification } from "../lib/inventory/validate";
import { resolveInventoryCaps } from "../lib/inventory/caps";
import { buildInitialSteps, currentPhase, deriveStatus, isStokOrder, STEP_TEMPLATES } from "../lib/steps";
import { DEFAULT_PERMISSIONS, resolvePermissions } from "../types";
import { grantModules, MODULE_DEFS, revokeModule } from "../lib/permissionModules";
import { findPermissionEscalation } from "../lib/permissionRules";

let passed = 0;
function test(name: string, fn: () => void) {
  try {
    fn();
    passed++;
    console.log(`  ✓ ${name}`);
  } catch (e) {
    console.log(`  ✗ ${name}`);
    throw e;
  }
}

const types = [
  { value: "kaos_polo", name: "Kaos Polo", ukuran: ["S", "M", "L", "XL"], sort_order: 2 },
  { value: "celana_pendek", name: "Celana Pendek", ukuran: ["25", "26", "27"], sort_order: 1 },
];
const item = (over: Partial<OrderItem> & Pick<OrderItem, "jenis_produksi">): OrderItem => ({ id: "i1", jumlah: 0, ...over });

console.log("skuKey");
test("huruf kecil, spasi dirapikan, dua bagian kosong tetap ber-pemisah", () => {
  assert.equal(skuKey({ jenis_produksi: "kaos_polo", varian: " Lengan  Panjang ", warna: "Abu-abu", ukuran: "L" }), "kaos_polo|lengan panjang|abu-abu|l");
  assert.equal(skuKey({ jenis_produksi: "kaos_polos", ukuran: "M" }), "kaos_polos|||m");
});
test("tanda | di nilai diganti spasi (tidak menggeser bagian lain)", () => {
  assert.equal(skuKey({ jenis_produksi: "x", varian: "a|b", warna: "", ukuran: "S" }), "x|a b||s");
});

console.log("expectedLines");
test("satu baris per varian × ukuran dengan jumlah > 0; ukuran 0 diabaikan", () => {
  const lines = expectedLines(
    [item({ jenis_produksi: "kaos_polo", jumlah: 60, rincian: [{ id: "r", varian: "Lengan Panjang", warna: "Abu-abu", ukuran: [{ ukuran: "M", jumlah: 20 }, { ukuran: "L", jumlah: 25 }, { ukuran: "XL", jumlah: 15 }, { ukuran: "S", jumlah: 0 }] }] })],
    types as never,
  );
  assert.deepEqual(lines.map((l) => [l.ukuran, l.expected]), [["M", 20], ["L", 25], ["XL", 15]]);
  assert.equal(lines[0].sku_key, "kaos_polo|lengan panjang|abu-abu|m");
  assert.equal(lines[0].jenis_name, "Kaos Polo");
  assert.equal(skuLabel(lines[0]), "Kaos Polo · Lengan Panjang · Abu-abu · M");
});
test("baris dengan sku_key sama dari dua item digabung", () => {
  const rin = (n: number) => [{ id: "r", varian: "Pendek", ukuran: [{ ukuran: "L", jumlah: n }] }];
  const lines = expectedLines([item({ id: "a", jenis_produksi: "kaos_polo", rincian: rin(5) }), item({ id: "b", jenis_produksi: "kaos_polo", rincian: rin(7) })], types as never);
  assert.equal(lines.length, 1);
  assert.equal(lines[0].expected, 12);
});
test("item tanpa rincian jadi satu baris memakai jumlah; jumlah 0 tidak menghasilkan baris", () => {
  assert.deepEqual(expectedLines([item({ jenis_produksi: "kaos_polo", jumlah: 30 })], types as never).map((l) => [l.sku_key, l.expected]), [["kaos_polo|||", 30]]);
  assert.equal(expectedLines([item({ jenis_produksi: "kaos_polo", jumlah: 0 })], types as never).length, 0);
  assert.equal(expectedLines(undefined).length, 0);
});
test("varian/warna \"Lainnya\" memakai teks bebas sebagai kunci; label tetap \"Lainnya: ...\"", () => {
  const [l] = expectedLines([item({ jenis_produksi: "kaos_polo", rincian: [{ id: "r", varian: "Lainnya", varian_lain: "Hijau Botol", warna: "Lainnya", warna_lain: "Merah", ukuran: [{ ukuran: "M", jumlah: 3 }] }] })], types as never);
  assert.equal(l.sku_key, "kaos_polo|hijau botol|merah|m");
  assert.equal(l.varian, "Lainnya: Hijau Botol");
  assert.equal(l.warna, "Lainnya: Merah");
});
test("urutan: jenis (urutan master) → varian → warna → ukuran mengikuti daftar jenisnya", () => {
  const lines = expectedLines(
    [
      item({ id: "a", jenis_produksi: "kaos_polo", rincian: [{ id: "r", varian: "Pendek", ukuran: [{ ukuran: "XL", jumlah: 1 }, { ukuran: "S", jumlah: 1 }, { ukuran: "L", jumlah: 1 }] }] }),
      item({ id: "b", jenis_produksi: "celana_pendek", rincian: [{ id: "r2", ukuran: [{ ukuran: "27", jumlah: 1 }, { ukuran: "25", jumlah: 1 }] }] }),
    ],
    types as never,
  );
  assert.deepEqual(lines.map((l) => `${l.jenis_produksi}:${l.ukuran}`), ["celana_pendek:25", "celana_pendek:27", "kaos_polo:S", "kaos_polo:L", "kaos_polo:XL"]);
});

console.log("validateVerification");
const exp = expectedLines(
  [item({ jenis_produksi: "kaos_polo", rincian: [{ id: "r", varian: "Lengan Panjang", warna: "Abu-abu", ukuran: [{ ukuran: "M", jumlah: 20 }, { ukuran: "L", jumlah: 25 }, { ukuran: "XL", jumlah: 15 }] }] })],
  types as never,
);
const keyOf = (u: string) => exp.find((l) => l.ukuran === u)!.sku_key;
const all = (over: Record<string, number> = {}) => exp.map((l) => ({ sku_key: l.sku_key, counted: over[l.ukuran] ?? l.expected }));

test("semua sama tanpa alasan diterima", () => {
  const r = validateVerification(exp, all(), "");
  assert.ok(r.ok && !r.has_diff && r.total_counted === 60 && r.total_expected === 60);
});
test("selisih tanpa alasan ditolak; dengan alasan diterima (contoh PRD §8.2: 58 dari 60)", () => {
  assert.equal(validateVerification(exp, all({ L: 23 }), "  ").ok, false);
  assert.equal(validateVerification(exp, all({ L: 23 }), "ab").ok, false);
  const r = validateVerification(exp, all({ L: 23 }), "2 pcs cacat jahitan, dipisah");
  assert.ok(r.ok && r.has_diff && r.total_counted === 58);
  if (r.ok) assert.equal(r.lines.find((l) => l.ukuran === "L")!.counted, 23);
});
test("hitungan negatif, pecahan, teks, atau kosong ditolak; nol dengan alasan diterima", () => {
  for (const bad of [-1, 1.5, "5", null, NaN, Infinity, 2_000_000]) {
    const counts = all(); counts[0] = { sku_key: counts[0].sku_key, counted: bad as never };
    assert.equal(validateVerification(exp, counts, "alasan").ok, false, String(bad));
  }
  assert.ok(validateVerification(exp, all({ M: 0, L: 0, XL: 0 }), "semua rusak").ok);
});
test("sku_key asing, ganda, atau kurang ditolak (expected tidak pernah dari klien)", () => {
  assert.equal(validateVerification(exp, [...all(), { sku_key: "x|||", counted: 1 }], "a b c").ok, false);
  assert.equal(validateVerification(exp, [...all(), { sku_key: keyOf("M"), counted: 20 }], "").ok, false);
  assert.equal(validateVerification(exp, all().slice(1), "").ok, false);
  const forged = all().map((c) => ({ ...c, expected: 999 }));
  const r = validateVerification(exp, forged, "");
  assert.ok(r.ok && r.total_expected === 60);
});
test("rincian kosong, bukan array, dan alasan terlalu panjang ditolak", () => {
  assert.equal(validateVerification([], [], "").ok, false);
  assert.equal(validateVerification(exp, "x", "").ok, false);
  assert.equal(validateVerification(exp, all(), "a".repeat(501)).ok, false);
});
test("galat database: INV:/FIN: ditampilkan, lainnya disamarkan", () => {
  assert.deepEqual(invError({ message: "INV: Catatan ini sudah diverifikasi" }), { status: 422, message: "Catatan ini sudah diverifikasi", expected: true });
  assert.equal(invError({ message: "FIN: Pesanan stok tidak ditagih" }).expected, true);
  assert.equal(invError({ message: "relation x does not exist" }).status, 500);
  assert.equal(stripInvPrefix("INV: Stok pesanan ini sudah diverifikasi"), "Stok pesanan ini sudah diverifikasi");
});

console.log("Template tahap stok");
test("pesanan stok punya empat tahap dan berhenti di QC; pesanan biasa tidak berubah", () => {
  assert.deepEqual(buildInitialSteps("utama", [], "A", "stok").map((s) => s.key), ["approval", "potong_kain", "produksi_massal", "qc"]);
  assert.equal(buildInitialSteps("utama").length, STEP_TEMPLATES.utama.length);
  assert.equal(buildInitialSteps("utama", [], "A", "pelanggan").length, 7);
  assert.equal(buildInitialSteps("non_utama", ["detail"], "A", "stok").length, STEP_TEMPLATES.non_utama.length);
});
test("deriveStatus = Selesai begitu QC selesai; currentPhase tidak pernah Kirim", () => {
  const done = (keys: string[]) => buildInitialSteps("utama", keys, "A", "stok");
  assert.equal(deriveStatus({ kategori: "utama", tujuan: "stok", steps: done(["approval", "potong_kain", "produksi_massal", "qc"]), kendala: [] }), "Selesai");
  assert.equal(deriveStatus({ kategori: "utama", tujuan: "stok", steps: done(["approval", "potong_kain", "produksi_massal"]), kendala: [] }), "Finishing");
  for (const keys of [[], ["approval"], ["approval", "potong_kain"], ["approval", "potong_kain", "produksi_massal"], ["approval", "potong_kain", "produksi_massal", "qc"]]) {
    assert.notEqual(currentPhase({ kategori: "utama", tujuan: "stok", steps: done(keys) }), "Kirim");
  }
  assert.ok(isStokOrder({ kategori: "utama", tujuan: "stok" }));
  assert.ok(!isStokOrder({ kategori: "non_utama", tujuan: "stok" }));
  assert.ok(!isStokOrder({ kategori: "utama" }));
});

console.log("Izin inventori");
test("modul inventori default mati dan user lama dapat default", () => {
  assert.deepEqual(DEFAULT_PERMISSIONS.inventori, { view: false, edit: false });
  assert.deepEqual(resolvePermissions({ orders: { view: true } }).inventori, { view: false, edit: false });
});
test("hak: edit otomatis bisa melihat; view saja tidak bisa verifikasi; Super Admin penuh", () => {
  assert.deepEqual(resolveInventoryCaps({ role: "qc" }, { view: true, edit: false }), { view: true, verify: false, isSuperAdmin: false });
  assert.deepEqual(resolveInventoryCaps({ role: "qc" }, { edit: true }), { view: true, verify: true, isSuperAdmin: false });
  assert.deepEqual(resolveInventoryCaps({ role: "qc" }, undefined), { view: false, verify: false, isSuperAdmin: false });
  assert.equal(resolveInventoryCaps({ role: "admin", roles: ["super_admin"] }, null).verify, true);
});
test("grantModules hanya menyalakan modul ini; Admin tidak bisa memberi izin yang tidak ia punya", () => {
  let p = DEFAULT_PERMISSIONS;
  for (const d of MODULE_DEFS) p = revokeModule(p, d.key);
  const next = grantModules(p, ["inventori"], { create: false, edit: true, delete: false, maker: false, approver: false });
  assert.deepEqual(next.inventori, { view: true, edit: true });
  assert.deepEqual(next.orders, p.orders);
  // pemanggil (Admin) tanpa izin inventori tidak boleh menambahkannya; yang punya boleh
  assert.ok(findPermissionEscalation(next, p, p));
  assert.equal(findPermissionEscalation(next, p, next), null);
});

console.log(`\n${passed} uji lulus`);
