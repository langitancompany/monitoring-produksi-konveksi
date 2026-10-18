// tests/teams.test.ts — uji logika murni Tim produksi (lib/teams.ts)
// Jalankan: npx tsx tests/teams.test.ts
import assert from "node:assert/strict";
import {
  cleanMemberIds,
  initialsOf,
  normalizeTeam,
  teamErrorMessage,
  teamLabel,
  teamMembers,
  validateTeamInput,
  TEAM_DESC_MAX,
  TEAM_NAME_MAX,
} from "../lib/teams";

let passed = 0;
const test = (name: string, fn: () => void) => {
  fn();
  passed++;
  console.log(`  ✓ ${name}`);
};

const users = [
  { id: "u1", name: "Andi Pratama" },
  { id: "u2", name: "Budi" },
  { id: "u3", name: "Citra Lestari Dewi" },
];
const teams = [
  { id: "t1", name: "Tim Jahit Kaos" },
  { id: "t2", name: "Tim Jahit Seragam" },
];

console.log("validateTeamInput");
test("nama kosong / spasi saja ditolak", () => {
  assert.match(validateTeamInput({ name: "   ", description: "" }, teams)!, /wajib/);
});
test("nama terlalu panjang ditolak", () => {
  assert.match(validateTeamInput({ name: "x".repeat(TEAM_NAME_MAX + 1), description: "" }, teams)!, /maksimal/);
  assert.equal(validateTeamInput({ name: "x".repeat(TEAM_NAME_MAX), description: "" }, teams), null);
});
test("deskripsi terlalu panjang ditolak", () => {
  assert.match(validateTeamInput({ name: "Baru", description: "y".repeat(TEAM_DESC_MAX + 1) }, teams)!, /Deskripsi/);
});
test("nama kembar ditolak walau beda huruf besar & spasi di ujung (sama dengan indeks database)", () => {
  assert.match(validateTeamInput({ name: "  tim JAHIT kaos ", description: "" }, teams)!, /sudah dipakai/);
});
test("mengubah tim tanpa mengganti nama tidak dianggap kembar dengan dirinya sendiri", () => {
  assert.equal(validateTeamInput({ id: "t1", name: "Tim Jahit Kaos", description: "baru" }, teams), null);
});
test("mengganti nama jadi nama tim LAIN ditolak", () => {
  assert.match(validateTeamInput({ id: "t1", name: "Tim Jahit Seragam", description: "" }, teams)!, /sudah dipakai/);
});
test("nama baru yang unik lolos", () => {
  assert.equal(validateTeamInput({ name: "Tim Potong", description: "" }, teams), null);
});

console.log("cleanMemberIds");
test("membuang ID ganda & ID user yang sudah dihapus, urutan dipertahankan", () => {
  assert.deepEqual(cleanMemberIds(["u2", "ghost", "u1", "u2"], users), ["u2", "u1"]);
});
test("daftar kosong tetap kosong", () => {
  assert.deepEqual(cleanMemberIds([], users), []);
});

console.log("teamMembers");
test("anggota mengikuti urutan daftar user, ID yatim dilewati", () => {
  const m = teamMembers({ member_ids: ["u3", "ghost", "u1"] }, users);
  assert.deepEqual(m.map((u) => u.id), ["u1", "u3"]);
});
test("tim kosong / null → array kosong", () => {
  assert.deepEqual(teamMembers({ member_ids: [] }, users), []);
  assert.deepEqual(teamMembers(null, users), []);
  assert.deepEqual(teamMembers(undefined, users), []);
});

console.log("teamLabel");
test("tanpa ID → '-'; ID dikenal → nama; ID tak dikenal → 'Tim dihapus'", () => {
  assert.equal(teamLabel(teams, null), "-");
  assert.equal(teamLabel(teams, undefined), "-");
  assert.equal(teamLabel(teams, "t2"), "Tim Jahit Seragam");
  assert.equal(teamLabel(teams, "zzz"), "Tim dihapus");
});

console.log("initialsOf");
test("inisial maksimal 2 huruf, huruf besar", () => {
  assert.equal(initialsOf("Budi Santoso"), "BS");
  assert.equal(initialsOf("citra lestari dewi"), "CL");
  assert.equal(initialsOf("andi"), "A");
  assert.equal(initialsOf("  "), "?");
  assert.equal(initialsOf("  Dewi   Sri "), "DS");
});

console.log("normalizeTeam");
test("member_ids bukan array → [], is_active default true", () => {
  const t = normalizeTeam({ id: "x", name: "N", member_ids: null });
  assert.deepEqual(t.member_ids, []);
  assert.equal(t.is_active, true);
  assert.equal(normalizeTeam({ id: "x", name: "N", is_active: false, member_ids: ["a"] }).is_active, false);
});

console.log("teamErrorMessage");
test("galat umum diterjemahkan ke bahasa Indonesia yang jelas", () => {
  assert.match(teamErrorMessage({ code: "23505", message: "dup" }), /sudah dipakai/);
  assert.match(teamErrorMessage({ code: "42501", message: "x" }), /izin/);
  assert.match(teamErrorMessage({ message: 'new row violates row-level security policy for table "teams"' }), /izin/);
  assert.match(teamErrorMessage({ code: "PGRST205", message: "Could not find the table in the schema cache" }), /006_teams\.sql/);
  assert.match(teamErrorMessage({ code: "42P01", message: 'relation "teams" does not exist' }), /006_teams\.sql/);
  assert.equal(teamErrorMessage({ message: "lain" }), "lain");
  assert.equal(teamErrorMessage(null), "Terjadi kesalahan tak dikenal.");
});

console.log(`\n${passed} uji lulus`);
