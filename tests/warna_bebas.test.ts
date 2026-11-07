// tests/warna_bebas.test.ts — Varian 2 (warna) isian bebas: hanya "Lainnya" yang dicentang di Pengaturan.
// Jalankan: npx tsx tests/warna_bebas.test.ts
import assert from "node:assert/strict";
import { cleanItems, isFreeTextList, isWarnaFreeText, normalizeRincianVarian, validateItems } from "../lib/orderItems";
import { expectedLines } from "../lib/inventory/sku";

let passed = 0;
function test(name: string, fn: () => void) {
  fn();
  passed += 1;
  console.log(`  ✓ ${name}`);
}

const kaos: any = {
  id: "pt", name: "Kaos Polos", value: "kaos_polos", kategori: "utama", is_active: true,
  ukuran: ["S", "M"], varian: [], varian_warna: ["Lainnya"],
};
const blok = (warna?: string, jumlah = 2): any => ({
  id: `b${Math.random()}`, ...(warna !== undefined ? { warna } : {}), ukuran: [{ ukuran: "S", jumlah }],
});
const item = (rincian: any[]): any => ({ id: "i1", jenis_produksi: "kaos_polos", jumlah: rincian.length, rincian });

test("hanya Lainnya = isian bebas; ada pilihan lain = dropdown", () => {
  assert.equal(isFreeTextList(["Lainnya"]), true);
  assert.equal(isFreeTextList(["Biru", "Lainnya"]), false);
  assert.equal(isFreeTextList([]), false);
  assert.equal(isWarnaFreeText(kaos), true);
  assert.equal(isWarnaFreeText({ ...kaos, varian_warna: ["Biru", "Lainnya"] }), false);
});
test("validasi: warna wajib ditulis; nama apa pun diterima tanpa 'nama warna Lainnya'", () => {
  assert.match(validateItems([item([blok(undefined)])], [kaos]) ?? "", /Tulis warna/);
  assert.equal(validateItems([item([blok("Hitam")])], [kaos]), null);
  assert.equal(validateItems([item([blok("Hitam"), blok("Putih")])], [kaos]), null);
});
test("validasi: warna sama (beda huruf besar/kecil) dua kali ditolak", () => {
  assert.match(validateItems([item([blok("Hitam"), blok(" hitam ")])], [kaos]) ?? "", /dua kali/);
});
test("cleanItems menyimpan warna apa adanya (dipangkas), tanpa 'Lainnya'", () => {
  const out = cleanItems([item([blok("  Hitam ")])]);
  assert.deepEqual([out[0].rincian![0].warna, out[0].rincian![0].warna_lain], ["Hitam", undefined]);
});
test("data lama 'Lainnya' + nama bebas dijadikan nama aslinya saat jenis diatur isian bebas", () => {
  const lama: any = { ...blok("Lainnya"), warna_lain: "Hitam" };
  const baru = normalizeRincianVarian(lama, kaos);
  assert.equal(baru.warna, "Hitam");
  assert.equal("warna_lain" in baru, false);
});
test("stok: warna tertulis 'Hitam' dan kuncinya tidak peduli huruf besar/kecil", () => {
  const [l] = expectedLines([item([blok("Hitam", 3)])], [kaos] as never);
  assert.equal(l.warna, "Hitam");
  assert.equal(l.sku_key, "kaos_polos||hitam|s");
  const lines = expectedLines([item([blok("Hitam", 3)]), item([blok("hitam", 2)])], [kaos] as never);
  assert.equal(lines.length, 1);
  assert.equal(lines[0].expected, 5);
});

console.log(`\n${passed} tes lulus`);
