// tests/permissionRules.test.ts — aturan pemberian izin (lib/permissionRules.ts)
// Jalankan: npx tsx tests/permissionRules.test.ts
import assert from "node:assert/strict";
import { findPermissionEscalation, holdsPermission, permissionsEqual } from "../lib/permissionRules";
import { resolvePermissions } from "../types";

let passed = 0;
const test = (name: string, fn: () => void) => { fn(); passed++; console.log(`  ✓ ${name}`); };

const caller = { orders: { view: true, create: true, edit: false }, keuangan: { view: true, delete: false } };
const target = { orders: { view: true }, keuangan: { view: false } };

console.log("findPermissionEscalation");
test("menambah izin yang dimiliki pemberi → boleh", () => {
  const next = { orders: { view: true, create: true }, keuangan: { view: true } };
  assert.equal(findPermissionEscalation(next, target, caller), null);
});
test("menambah izin yang TIDAK dimiliki pemberi → ditolak, label izin disebut", () => {
  const next = { orders: { view: true, edit: true } };
  assert.equal(findPermissionEscalation(next, target, caller), "Pesanan · Edit");
  assert.equal(findPermissionEscalation({ keuangan: { delete: true } }, target, caller), "Keuangan · Hapus");
});
test("izin yang sudah dimiliki target dan tidak berubah → tidak dianggap eskalasi", () => {
  const cur = { orders: { edit: true } };
  assert.equal(findPermissionEscalation({ orders: { edit: true } }, cur, caller), null);
});
test("mengurangi izin → boleh walau pemberi tidak punya izin itu", () => {
  const cur = { orders: { edit: true } };
  assert.equal(findPermissionEscalation({ orders: { edit: false } }, cur, caller), null);
});
test("izin baru modul 'view_all' ikut dicek", () => {
  assert.equal(findPermissionEscalation({ orders: { view_all: true } }, {}, caller), "Pesanan · Akses semua pesanan");
});

console.log("permissionsEqual / holdsPermission");
test("sama persis walau modul/aksi false tidak tertulis", () => {
  assert.equal(permissionsEqual({ orders: { view: true, edit: false } }, { orders: { view: true } }), true);
  assert.equal(permissionsEqual({ orders: { view: true } }, { orders: { view: false } }), false);
  assert.equal(permissionsEqual(null, {}), true);
});
test("holdsPermission hanya true murni", () => {
  assert.equal(holdsPermission(caller, "orders", "create"), true);
  assert.equal(holdsPermission(caller, "orders", "edit"), false);
  assert.equal(holdsPermission(null, "orders", "view"), false);
});

console.log("Keuangan: Maker / Approver");
test("Admin yang hanya Maker tidak bisa memberi Approver (dan sebaliknya)", () => {
  const adminMaker = { keuangan: { view: true, maker: true, approver: false } };
  assert.equal(findPermissionEscalation({ keuangan: { approver: true } }, {}, adminMaker), "Keuangan · Approver");
  assert.equal(findPermissionEscalation({ keuangan: { maker: true } }, {}, adminMaker), null);
  const adminAppr = { keuangan: { view: true, approver: true } };
  assert.equal(findPermissionEscalation({ keuangan: { maker: true } }, {}, adminAppr), "Keuangan · Maker");
});
test("resolvePermissions: default Maker/Approver false", () => {
  const r = resolvePermissions({ keuangan: { view: true } });
  assert.deepEqual(r.keuangan, { view: true, maker: false, approver: false, delete: false });
});
test("resolvePermissions: user lama create/edit → maker/approver, kunci lama dibuang", () => {
  const r = resolvePermissions({ keuangan: { view: true, create: true, edit: false, delete: true } });
  assert.deepEqual(r.keuangan, { view: true, maker: true, approver: false, delete: true });
  const r2 = resolvePermissions({ keuangan: { view: true, create: false, edit: true } });
  assert.deepEqual([r2.keuangan.maker, r2.keuangan.approver], [false, true]);
});
test("resolvePermissions: maker/approver yang sudah tertulis tidak ditimpa create/edit lama", () => {
  const r = resolvePermissions({ keuangan: { view: true, maker: false, approver: true, create: true, edit: false } });
  assert.deepEqual([r.keuangan.maker, r.keuangan.approver], [false, true]);
});

console.log(`\n${passed} test lulus`);
