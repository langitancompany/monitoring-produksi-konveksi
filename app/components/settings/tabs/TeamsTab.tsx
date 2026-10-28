// app/components/settings/tabs/TeamsTab.tsx
// Tab Tim — buat tim produksi dari user yang ada di tab Pengguna (mis. Tim Jahit
// Kaos, Tim Jahit Seragam). Tampil sebagai kartu berisi avatar anggota. Tim
// dipilih saat membuat/mengedit pesanan. Yang dinonaktifkan hilang dari pilihan
// form tapi pesanan lama tetap aman.
"use client";

import React, { useMemo, useState } from "react";
import { Trash2, Pencil, EyeOff, Eye, Search, Check, X, Loader2 } from "lucide-react";
import type { UserData } from "@/types";
import type { TeamData, TeamInput } from "@/types/team";
import { getUserRoles, roleLabel } from "@/lib/roles";
import { TEAM_DESC_MAX, TEAM_NAME_MAX, cleanMemberIds, initialsOf, teamMembers } from "@/lib/teams";
import UserAvatar from "@/app/components/ui/UserAvatar";
import TeamAvatars from "@/app/components/ui/TeamAvatars";
import { inputCls, labelCls } from "@/app/components/settings/settingsShared";

interface Props {
  teams: TeamData[];
  users: UserData[];
  /** pesan bila daftar tim gagal dimuat (mis. migration 006 belum dijalankan) */
  teamsError: string | null;
  /** true = tersimpan (form ditutup); false = gagal (isian tetap ada) */
  onSave: (t: TeamInput) => Promise<boolean>;
  onToggle: (t: TeamData) => void;
  onDelete: (t: TeamData) => void;
}

export default function TeamsTab({ teams, users, teamsError, onSave, onToggle, onDelete }: Props) {
  const [editing, setEditing] = useState<TeamInput | null>(null);
  const [saving, setSaving] = useState(false);
  const [search, setSearch] = useState("");

  const openNew = () => {
    setSearch("");
    setEditing({ name: "", description: "", member_ids: [] });
  };
  const openEdit = (t: TeamData) => {
    setSearch("");
    setEditing({
      id: t.id,
      name: t.name,
      description: t.description ?? "",
      // anggota yang akunnya sudah dihapus tidak ikut terpilih
      member_ids: cleanMemberIds(t.member_ids, users),
    });
  };
  const close = () => {
    if (!saving) setEditing(null);
  };

  const toggleMember = (id: string) =>
    setEditing((e) =>
      e
        ? { ...e, member_ids: e.member_ids.includes(id) ? e.member_ids.filter((m) => m !== id) : [...e.member_ids, id] }
        : e,
    );

  const submit = async (ev: React.FormEvent) => {
    ev.preventDefault();
    if (!editing || saving) return;
    setSaving(true);
    const ok = await onSave(editing);
    setSaving(false);
    if (ok) setEditing(null);
  };

  const filteredUsers = useMemo(() => {
    const q = search.trim().toLowerCase();
    if (!q) return users;
    return users.filter(
      (u) =>
        u.name.toLowerCase().includes(q) ||
        getUserRoles(u).map(roleLabel).join(" ").toLowerCase().includes(q),
    );
  }, [users, search]);

  return (
    <>
      <div className="space-y-4">
        <div className="flex justify-between items-center gap-3 bg-white dark:bg-zinc-950 rounded-xl border border-zinc-200 dark:border-zinc-800 p-5 md:p-6">
          <div>
            <h2 className="text-base font-semibold tracking-tight text-zinc-900 dark:text-zinc-100">Tim Produksi</h2>
            <p className="text-xs text-zinc-500 dark:text-zinc-400 mt-0.5">
              Kelompokkan user jadi tim (mis. Tim Jahit Kaos). Tim dipilih saat membuat pesanan.
            </p>
          </div>
          <button
            onClick={openNew}
            disabled={!!teamsError}
            className="bg-[#124540] hover:bg-[#0d332f] disabled:opacity-50 text-white px-3 py-1.5 rounded-md text-xs font-semibold transition-colors duration-150 shrink-0"
          >
            + Tim Baru
          </button>
        </div>

        {teamsError && (
          <p className="rounded-md border border-red-200 dark:border-red-900/50 bg-red-50 dark:bg-red-950/30 px-4 py-3 text-xs text-red-700 dark:text-red-300">
            {teamsError}
          </p>
        )}

        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 2xl:grid-cols-4 gap-3 md:gap-4">
          {teams.map((t) => {
            const members = teamMembers(t, users);
            return (
              <div
                key={t.id}
                className={`bg-white dark:bg-zinc-950 p-5 rounded-xl border border-zinc-200 dark:border-zinc-800 flex flex-col gap-4 ${t.is_active ? "" : "opacity-60"}`}
              >
                <div className="flex justify-between items-start gap-2">
                  <div className="min-w-0">
                    <div className="font-semibold text-zinc-800 dark:text-zinc-200 text-sm truncate">{t.name}</div>
                    {t.description && (
                      <p className="text-xs text-zinc-500 dark:text-zinc-400 mt-0.5 line-clamp-2">{t.description}</p>
                    )}
                  </div>
                  <div className="flex gap-1 shrink-0 -mr-1 -mt-1">
                    <button
                      onClick={() => openEdit(t)}
                      title="Ubah tim"
                      className="p-1.5 text-zinc-300 dark:text-zinc-600 hover:text-[#124540] dark:hover:text-[#49BFB4] hover:bg-zinc-100 dark:hover:bg-zinc-800 rounded-md transition-colors duration-150"
                    >
                      <Pencil className="w-4 h-4" />
                    </button>
                    <button
                      onClick={() => onToggle(t)}
                      title={t.is_active ? "Nonaktifkan" : "Aktifkan"}
                      className="p-1.5 text-zinc-300 dark:text-zinc-600 hover:text-[#124540] dark:hover:text-[#49BFB4] hover:bg-zinc-100 dark:hover:bg-zinc-800 rounded-md transition-colors duration-150"
                    >
                      {t.is_active ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
                    </button>
                    <button
                      onClick={() => onDelete(t)}
                      title="Hapus"
                      className="p-1.5 text-zinc-300 dark:text-zinc-600 hover:text-red-600 hover:bg-zinc-100 dark:hover:bg-zinc-800 rounded-md transition-colors duration-150"
                    >
                      <Trash2 className="w-4 h-4" />
                    </button>
                  </div>
                </div>

                <TeamAvatars members={members} max={8} />

                <div className="flex items-center justify-between gap-2 mt-auto">
                  <p className="text-[11px] text-zinc-500 dark:text-zinc-400 truncate min-w-0">
                    {members.length > 0 ? members.map((m) => m.name.split(" ")[0]).join(", ") : "—"}
                  </p>
                  <span className="font-mono tabular-nums text-[11px] px-2.5 py-1 rounded-full border border-zinc-300/70 dark:border-zinc-700 bg-white/80 dark:bg-zinc-800/80 text-zinc-700 dark:text-zinc-300 shrink-0">
                    {members.length} anggota{!t.is_active && " · nonaktif"}
                  </span>
                </div>
              </div>
            );
          })}
          {teams.length === 0 && !teamsError && (
            <p className="text-xs text-zinc-400 dark:text-zinc-600 col-span-full text-center py-6 border border-dashed border-zinc-200 dark:border-zinc-800 rounded-xl">
              Belum ada tim. Klik &quot;+ Tim Baru&quot; untuk membuat tim pertama.
            </p>
          )}
        </div>
      </div>

      {editing && (
        <div className="fixed inset-0 bg-black/70 z-99 flex items-center justify-center p-4">
          <form
            onSubmit={submit}
            className="bg-white dark:bg-zinc-950 rounded-xl w-full max-w-lg max-h-[90vh] flex flex-col border border-zinc-200 dark:border-zinc-800"
          >
            <div className="px-5 pt-5 pb-3 flex items-center justify-between">
              <h3 className="text-base font-semibold tracking-tight text-zinc-900 dark:text-zinc-100">
                {editing.id ? "Ubah Tim" : "Tim Baru"}
              </h3>
              <button type="button" onClick={close} className="p-1 text-zinc-400 hover:text-zinc-600 dark:hover:text-zinc-200 transition-colors duration-150">
                <X className="w-4 h-4" />
              </button>
            </div>

            <div className="px-5 pb-2 space-y-4 overflow-y-auto">
              <div>
                <label className={labelCls}>Nama tim *</label>
                <input
                  autoFocus
                  required
                  maxLength={TEAM_NAME_MAX}
                  className={inputCls}
                  value={editing.name}
                  onChange={(e) => setEditing({ ...editing, name: e.target.value })}
                  placeholder="mis. Tim Jahit Kaos"
                />
              </div>
              <div>
                <label className={labelCls}>Deskripsi</label>
                <textarea
                  rows={2}
                  maxLength={TEAM_DESC_MAX}
                  className={inputCls}
                  value={editing.description}
                  onChange={(e) => setEditing({ ...editing, description: e.target.value })}
                  placeholder="Opsional, mis. mengerjakan kaos polos & polo"
                />
              </div>

              <div>
                <div className="flex items-center justify-between mb-1">
                  <label className={`${labelCls} mb-0`}>Anggota</label>
                  <span className="font-mono tabular-nums text-[11px] text-zinc-500 dark:text-zinc-400">
                    {editing.member_ids.length} dipilih
                  </span>
                </div>
                <div className="relative mb-2">
                  <Search className="w-3.5 h-3.5 absolute left-3 top-1/2 -translate-y-1/2 text-zinc-400" />
                  <input
                    className={`${inputCls} pl-8`}
                    value={search}
                    onChange={(e) => setSearch(e.target.value)}
                    placeholder="Cari nama atau role..."
                  />
                </div>
                <ul className="max-h-64 overflow-y-auto rounded-md border border-zinc-200 dark:border-zinc-800 divide-y divide-zinc-100 dark:divide-zinc-900">
                  {filteredUsers.map((u) => {
                    const on = editing.member_ids.includes(u.id);
                    return (
                      <li key={u.id}>
                        <button
                          type="button"
                          onClick={() => toggleMember(u.id)}
                          aria-pressed={on}
                          className={`w-full flex items-center gap-3 px-3 py-2 text-left transition-colors duration-150 ${
                            on ? "bg-zinc-50 dark:bg-zinc-900" : "hover:bg-zinc-50 dark:hover:bg-zinc-900"
                          }`}
                        >
                          <UserAvatar
                            src={u.avatar_url}
                            alt={u.name}
                            fallback={initialsOf(u.name)}
                            className="w-8 h-8 shrink-0 text-[11px] font-semibold bg-zinc-100 dark:bg-zinc-800 text-zinc-500 dark:text-zinc-400 border border-zinc-200 dark:border-zinc-700"
                          />
                          <span className="min-w-0 flex-1">
                            <span className="block text-sm font-semibold text-zinc-900 dark:text-zinc-100 truncate">{u.name}</span>
                            <span className="block text-[10px] font-semibold text-zinc-500 dark:text-zinc-400 uppercase tracking-[0.12em] truncate">
                              {getUserRoles(u).map(roleLabel).join(" + ")}
                            </span>
                          </span>
                          <span
                            className={`w-5 h-5 shrink-0 rounded-md border flex items-center justify-center transition-colors duration-150 ${
                              on ? "bg-[#124540] border-[#124540] text-white" : "border-zinc-300 dark:border-zinc-700"
                            }`}
                          >
                            {on && <Check className="w-3.5 h-3.5" />}
                          </span>
                        </button>
                      </li>
                    );
                  })}
                  {filteredUsers.length === 0 && (
                    <li className="px-3 py-6 text-center text-xs text-zinc-400 dark:text-zinc-600">
                      {users.length === 0 ? "Belum ada user. Tambahkan dulu di tab Pengguna." : "Tidak ada user yang cocok."}
                    </li>
                  )}
                </ul>
              </div>
            </div>

            <div className="flex gap-2 p-5 pt-3">
              <button
                type="button"
                onClick={close}
                disabled={saving}
                className="flex-1 py-2 border border-zinc-200 dark:border-zinc-800 rounded-md font-semibold text-zinc-500 dark:text-zinc-400 hover:bg-zinc-50 dark:hover:bg-zinc-900 transition-colors duration-150 text-sm"
              >
                Batal
              </button>
              <button
                type="submit"
                disabled={saving}
                className="flex-1 py-2 bg-[#124540] hover:bg-[#0d332f] disabled:opacity-60 text-white rounded-md font-semibold transition-colors duration-150 text-sm flex items-center justify-center gap-2"
              >
                {saving && <Loader2 className="w-4 h-4 animate-spin" />}
                {saving ? "Menyimpan..." : "Simpan"}
              </button>
            </div>
          </form>
        </div>
      )}
    </>
  );
}
