// lib/teams.ts
//
// Logika murni untuk Tim produksi (tanpa React / Supabase), supaya mudah diuji:
// tests/teams.test.ts. Aturan di sini SAMA dengan aturan di database
// (supabase/migrations/006_teams.sql) — database tetap penjaga terakhir.

import type { TeamData, TeamInput } from "@/types/team";

export const TEAM_NAME_MAX = 60;
export const TEAM_DESC_MAX = 200;

/** Bentuk minimal user yang dibutuhkan helper di bawah (UserData memenuhinya). */
export interface TeamUserLike {
  id: string;
  name: string;
}

/** Kunci pembanding nama tim — sama dengan indeks unik database: lower(btrim(name)). */
export const teamNameKey = (name: string) => name.trim().toLowerCase();

/** Isi jsonb/array dari database → bentuk aman dipakai UI. */
export function normalizeTeam(raw: Record<string, unknown>): TeamData {
  return {
    ...(raw as unknown as TeamData),
    member_ids: Array.isArray(raw?.member_ids) ? (raw.member_ids as string[]) : [],
    is_active: raw?.is_active !== false,
  };
}

/** Pesan galat bila input tim tidak valid; `null` bila aman disimpan. */
export function validateTeamInput(
  input: Pick<TeamInput, "id" | "name" | "description">,
  teams: Pick<TeamData, "id" | "name">[],
): string | null {
  const name = input.name.trim();
  if (!name) return "Nama tim wajib diisi.";
  if (name.length > TEAM_NAME_MAX) return `Nama tim maksimal ${TEAM_NAME_MAX} karakter.`;
  if (input.description.trim().length > TEAM_DESC_MAX) {
    return `Deskripsi maksimal ${TEAM_DESC_MAX} karakter.`;
  }
  const key = teamNameKey(name);
  if (teams.some((t) => t.id !== input.id && teamNameKey(t.name) === key)) {
    return "Nama tim ini sudah dipakai. Gunakan nama lain.";
  }
  return null;
}

/** Buang ID ganda dan ID user yang sudah tidak ada. Urutan pertama dipertahankan. */
export function cleanMemberIds(ids: string[], users: TeamUserLike[]): string[] {
  const known = new Set(users.map((u) => u.id));
  const seen = new Set<string>();
  const out: string[] = [];
  for (const id of ids) {
    if (!known.has(id) || seen.has(id)) continue;
    seen.add(id);
    out.push(id);
  }
  return out;
}

/**
 * Anggota tim sebagai objek user, mengikuti urutan `users` (sudah urut nama).
 * ID yang user-nya sudah dihapus dilewati — jadi tampilan tidak pernah rusak.
 */
export function teamMembers<U extends TeamUserLike>(
  team: Pick<TeamData, "member_ids"> | null | undefined,
  users: U[],
): U[] {
  if (!team) return [];
  const ids = new Set(team.member_ids);
  return users.filter((u) => ids.has(u.id));
}

/** Nama tim dari ID. Tanpa ID → "-"; ID yang timnya sudah tak ada → "Tim dihapus". */
export function teamLabel(
  teams: Pick<TeamData, "id" | "name">[],
  id: string | null | undefined,
): string {
  if (!id) return "-";
  return teams.find((t) => t.id === id)?.name ?? "Tim dihapus";
}

/** Inisial untuk avatar cadangan (maks. 2 huruf): "Budi Santoso" → "BS", "andi" → "A". */
export function initialsOf(name: string): string {
  const words = name.trim().split(/\s+/).filter(Boolean);
  if (words.length === 0) return "?";
  const letters = words.length === 1 ? [words[0]] : [words[0], words[1]];
  return letters.map((w) => w.charAt(0).toUpperCase()).join("");
}

/** Ubah galat Supabase/Postgres menjadi pesan yang dimengerti pemilik. */
export function teamErrorMessage(err: { code?: string; message?: string } | null | undefined): string {
  const code = err?.code ?? "";
  const msg = err?.message ?? "";
  if (code === "42P01" || code === "PGRST205" || (/teams/.test(msg) && /schema cache|does not exist/.test(msg))) {
    return "Tabel tim belum terbaca. Jalankan supabase/migrations/006_teams.sql di SQL Editor Supabase; bila sudah dijalankan, restart PostgREST/Supabase API agar daftar tabel dimuat ulang.";
  }
  if (code === "23505") return "Nama tim ini sudah dipakai. Gunakan nama lain.";
  if (code === "23514") return `Nama tim maksimal ${TEAM_NAME_MAX} karakter dan deskripsi maksimal ${TEAM_DESC_MAX} karakter.`;
  if (code === "42501" || /row-level security/i.test(msg)) {
    return "Anda tidak punya izin untuk mengelola tim (butuh izin Pengaturan).";
  }
  return msg || "Terjadi kesalahan tak dikenal.";
}
