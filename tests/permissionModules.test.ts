// Jalankan: npx tsx tests/permissionModules.test.ts
import assert from "node:assert/strict";
import { DEFAULT_PERMISSIONS, resolvePermissions, type UserPermissions } from "../types";
import {
  MODULE_DEFS,
  getField,
  grantModules,
  grantedModules,
  moduleHasAccess,
  revokeModule,
  setField,
  summarizeAccess,
} from "../lib/permissionModules";
import { sanitizePermissions } from "../lib/userAdmin";

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

const NONE = { create: false, edit: false, delete: false, maker: false, approver: false };
const ALL3 = { ...NONE, create: true, edit: true, delete: true };
const empty = (): UserPermissions => {
  let p = DEFAULT_PERMISSIONS;
  for (const d of MODULE_DEFS) p = revokeModule(p, d.key);
  return p;
};

console.log("Modul & akses");
test("modul tanpa izin aktif tidak muncul; yang punya view muncul", () => {
  const p = empty();
  assert.equal(grantedModules(p).length, 0);
  const q = setField(p, "logs", "view", true);
  assert.deepEqual(grantedModules(q).map((d) => d.key), ["logs"]);
});

test("grantModules: view menyala + izin awal sesuai kolom modul", () => {
  const p = grantModules(empty(), ["orders", "trash"], ALL3);
  assert.equal(getField(p, "orders", "view"), true);
  assert.equal(getField(p, "orders", "create") && getField(p, "orders", "edit") && getField(p, "orders", "delete"), true);
  // trash hanya punya kolom Hapus
  assert.equal(getField(p, "trash", "delete"), true);
  assert.equal(getField(p, "trash", "view"), true);
});

test("grantModules: kolom yang tidak ada di modul tidak dinyalakan (Pengaturan→ trash tidak dapat create)", () => {
  const p = grantModules(empty(), ["trash", "config_harga"], ALL3);
  assert.equal(getField(p, "trash", "edit"), false);
  assert.equal(getField(p, "config_harga", "create"), false);
  assert.equal(getField(p, "config_harga", "edit"), true);
});

console.log("Keuangan: Maker / Approver satu baris");
test("Keuangan tidak memakai Buat/Ubah; Buat/Ubah awal TIDAK menyalakan maker/approver", () => {
  const p = grantModules(empty(), ["keuangan"], ALL3);
  assert.equal(getField(p, "keuangan", "view"), true);
  assert.equal(getField(p, "keuangan", "delete"), true);
  assert.equal(getField(p, "keuangan", "maker"), false);
  assert.equal(getField(p, "keuangan", "approver"), false);
  assert.equal("create" in (p.keuangan as object) && (p.keuangan as any).create === true, false);
});

test("Maker dan Approver dipilih terpisah di izin awal", () => {
  const a = grantModules(empty(), ["keuangan"], { ...NONE, maker: true });
  assert.deepEqual([getField(a, "keuangan", "maker"), getField(a, "keuangan", "approver")], [true, false]);
  const b = grantModules(empty(), ["keuangan"], { ...NONE, approver: true });
  assert.deepEqual([getField(b, "keuangan", "maker"), getField(b, "keuangan", "approver")], [false, true]);
});

test("maker/approver hanya berlaku untuk Keuangan (modul lain mengabaikannya)", () => {
  const p = grantModules(empty(), ["orders"], { ...NONE, maker: true, approver: true });
  assert.equal((p.orders as any).maker, undefined);
});

test("menyalakan Maker otomatis menyalakan Lihat", () => {
  const p = setField(empty(), "keuangan", "maker", true);
  assert.equal(getField(p, "keuangan", "view"), true);
  assert.equal(moduleHasAccess(p, "keuangan"), true);
});

test("mematikan izin tidak mengubah Lihat; baris tidak hilang", () => {
  let p = grantModules(empty(), ["keuangan"], { ...NONE, maker: true });
  p = setField(p, "keuangan", "maker", false);
  assert.equal(getField(p, "keuangan", "view"), true);
  assert.equal(grantedModules(p).some((d) => d.key === "keuangan"), true);
});

test("ringkasan daftar user menampilkan Keuangan · Maker / Approver", () => {
  const p = grantModules(empty(), ["keuangan"], { ...NONE, maker: true, approver: true });
  const labels = summarizeAccess(p).map((c) => c.label);
  assert.deepEqual(labels, ["Keuangan", "Keuangan · Maker", "Keuangan · Approver"]);
});

console.log("Cabut modul");
test("revokeModule menyetel semua izin modul false dan bentuk objek tetap", () => {
  let p = grantModules(empty(), ["keuangan"], { ...NONE, maker: true, approver: true, delete: true });
  p = revokeModule(p, "keuangan");
  assert.equal(moduleHasAccess(p, "keuangan"), false);
  assert.deepEqual(Object.keys(p.keuangan).sort(), Object.keys(DEFAULT_PERMISSIONS.keuangan).sort());
});

console.log("Pembatas pemberi izin (canGrant)");
test("Admin tanpa izin Approver tidak bisa memberi Approver, tapi Maker boleh", () => {
  const canGrant = (k: string, f: string) => k === "keuangan" && (f === "view" || f === "maker");
  const p = grantModules(empty(), ["keuangan"], { ...NONE, maker: true, approver: true }, canGrant as any);
  assert.deepEqual([getField(p, "keuangan", "maker"), getField(p, "keuangan", "approver")], [true, false]);
});
test("modul yang Lihat-nya tidak boleh diberikan dilewati seluruhnya", () => {
  const canGrant = (k: string) => k !== "salary";
  const p = grantModules(empty(), ["salary", "logs"], ALL3, canGrant as any);
  assert.equal(moduleHasAccess(p, "salary"), false);
  assert.equal(moduleHasAccess(p, "logs"), true);
});
test("setField tidak menyalakan Lihat bila Lihat tidak boleh diberikan", () => {
  const canGrant = (_k: string, f: string) => f !== "view";
  const p = setField(empty(), "keuangan", "maker", true, canGrant as any);
  assert.equal(getField(p, "keuangan", "view"), false);
});

console.log("Data lama (create/edit → maker/approver)");
test("sanitizePermissions (server) membaca create/edit lama sama seperti resolvePermissions (UI)", () => {
  const raw = { keuangan: { view: true, create: true, edit: false, delete: true } };
  const s = sanitizePermissions(raw).keuangan as any;
  const r = resolvePermissions(raw as any).keuangan as any;
  assert.deepEqual([s.maker, s.approver, s.delete], [true, false, true]);
  assert.deepEqual([r.maker, r.approver, r.delete], [true, false, true]);
});
test("sanitizePermissions: maker/approver yang sudah tertulis menang", () => {
  const s = sanitizePermissions({ keuangan: { view: true, maker: false, approver: true, create: true, edit: false } }).keuangan as any;
  assert.deepEqual([s.maker, s.approver], [false, true]);
});

console.log(`\n${passed} test lulus`);
