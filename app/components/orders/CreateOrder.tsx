// app/components/orders/CreateOrder.tsx
// Form "Pesanan baru" (close order). Utama: data pemesan saja — jenis produksi
// dipilih nanti di tahap Approval. Non-utama: kategori pesanan dipilih di sini.
"use client";

import React, { useState } from "react";
import { ArrowLeft, Loader2 } from "lucide-react";
import type { NewOrderInput, OrderKategori, ProductionTypeData } from "@/types/order";
import type { UserData } from "@/types";
import type { TeamData } from "@/types/team";
import { toLocalISODate } from "@/lib/utils";
import { inputCls, labelCls } from "@/app/components/settings/settingsShared";
import TeamPicker from "./TeamPicker";
import PJPicker from "./PJPicker";

interface Props {
  kategori: OrderKategori;
  /** pilihan kategori pesanan (hanya dipakai untuk non_utama) */
  nonUtamaTypes: ProductionTypeData[];
  /** tim aktif yang bisa dipilih (Pengaturan → Tim) */
  teams: TeamData[];
  /** semua user — untuk menampilkan avatar anggota tim yang dipilih */
  users: UserData[];
  isSubmitting: boolean;
  onCancel: () => void;
  onSubmit: (data: NewOrderInput) => void;
}

export default function CreateOrder({ kategori, nonUtamaTypes, teams, users, isSubmitting, onCancel, onSubmit }: Props) {
  const isNon = kategori === "non_utama";
  const [form, setForm] = useState<NewOrderInput>({
    kategori,
    nama_pemesan: "",
    no_hp: "",
    alamat_pemesan: "",
    jumlah: 0,
    tanggal_masuk: toLocalISODate(),
    deadline: "",
    catatan_pesanan: "",
    jenis_produksi: isNon ? nonUtamaTypes[0]?.value ?? "" : undefined,
    team_id: null,
    assigned_to: null,
  });
  const [error, setError] = useState<string | null>(null);
  const set = <K extends keyof NewOrderInput>(k: K, v: NewOrderInput[K]) => setForm((f) => ({ ...f, [k]: v }));

  const submit = (e: React.FormEvent) => {
    e.preventDefault();
    if (isSubmitting) return;
    if (!form.assigned_to) {
      setError("Penanggung jawab (PJ) wajib dipilih.");
      return;
    }
    if (isNon && (!form.jumlah || form.jumlah < 1)) {
      setError("Jumlah minimal 1 pcs.");
      return;
    }
    setError(null);
    // Pesanan utama: jumlah belum ada, baru terisi dari rincian di tahap Approval.
    onSubmit({ ...form, jumlah: isNon ? form.jumlah : 0 });
  };

  return (
    <div className="w-full space-y-4">
      <button
        onClick={onCancel}
        className="flex items-center gap-1.5 text-xs font-semibold text-zinc-500 dark:text-zinc-400 hover:text-zinc-900 dark:hover:text-zinc-100 transition-colors duration-150"
      >
        <ArrowLeft className="w-4 h-4" /> Kembali
      </button>

      <form onSubmit={submit} className="w-full bg-white dark:bg-zinc-950 rounded-xl border border-zinc-200 dark:border-zinc-800 p-5 md:p-6 grid grid-cols-1 lg:grid-cols-2 gap-x-6 gap-y-4 items-start">
        <div className="lg:col-span-2">
          <h2 className="text-base font-semibold tracking-tight text-zinc-900 dark:text-zinc-100">
            Pesanan {isNon ? "Non-Utama" : "Utama"} Baru
          </h2>
          <p className="text-xs text-zinc-500 dark:text-zinc-400 mt-0.5">
            {isNon
              ? "Isi detail pemesan, jumlah, dan kategori pemesanan."
              : "Isi data pemesan. Jenis jahitan, varian, ukuran, dan jumlah diisi admin saat membuat Approval."}
          </p>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-2 gap-4 lg:col-span-2">
          <div>
            <label className={labelCls}>Nama pemesan *</label>
            <input required className={inputCls} value={form.nama_pemesan} onChange={(e) => set("nama_pemesan", e.target.value)} placeholder="Nama pemesan / instansi" />
          </div>
          <div>
            <label className={labelCls}>No. HP / WhatsApp</label>
            <input inputMode="tel" className={inputCls} value={form.no_hp} onChange={(e) => set("no_hp", e.target.value)} placeholder="08xxxxxxxxxx" />
          </div>
        </div>

        <div>
          <label className={labelCls}>Alamat</label>
          <textarea rows={2} className={inputCls} value={form.alamat_pemesan} onChange={(e) => set("alamat_pemesan", e.target.value)} placeholder="Alamat pengiriman (opsional)" />
        </div>

        <div>
          <label className={labelCls}>Catatan</label>
          <textarea rows={2} className={inputCls} value={form.catatan_pesanan} onChange={(e) => set("catatan_pesanan", e.target.value)} placeholder="Catatan tambahan (opsional)" />
        </div>

        {isNon && (
          <div className="lg:col-span-2">
            <label className={labelCls}>Kategori pemesanan *</label>
            <select required className={inputCls} value={form.jenis_produksi ?? ""} onChange={(e) => set("jenis_produksi", e.target.value)}>
              {nonUtamaTypes.length === 0 && <option value="">Belum ada kategori — tambah di Pengaturan</option>}
              {nonUtamaTypes.map((t) => (
                <option key={t.id} value={t.value}>{t.name}</option>
              ))}
            </select>
          </div>
        )}

        <PJPicker value={form.assigned_to ?? null} onChange={(id) => set("assigned_to", id)} users={users} disabled={isSubmitting} />

        <TeamPicker value={form.team_id ?? null} onChange={(id) => set("team_id", id)} teams={teams} users={users} disabled={isSubmitting} />

        <div className={`grid grid-cols-1 gap-4 lg:col-span-2 ${isNon ? "md:grid-cols-3" : "md:grid-cols-2"}`}>
          {isNon && (
            <div>
              <label className={labelCls}>Jumlah (pcs) *</label>
              <input required type="number" min={1} inputMode="numeric" className={inputCls} value={form.jumlah || ""} onChange={(e) => set("jumlah", parseInt(e.target.value, 10) || 0)} />
            </div>
          )}
          <div>
            <label className={labelCls}>Tanggal masuk *</label>
            <input required type="date" className={inputCls} value={form.tanggal_masuk} onChange={(e) => set("tanggal_masuk", e.target.value)} />
          </div>
          <div>
            <label className={labelCls}>Deadline *</label>
            <input required type="date" min={form.tanggal_masuk} className={inputCls} value={form.deadline} onChange={(e) => set("deadline", e.target.value)} />
          </div>
        </div>


        {error && (
          <p className="lg:col-span-2 rounded-md border border-red-200 dark:border-red-900/50 bg-red-50 dark:bg-red-950/30 px-3 py-2 text-xs text-red-700 dark:text-red-300">{error}</p>
        )}

        <div className="flex gap-2 pt-2 lg:col-span-2 lg:justify-end">
          <button type="button" onClick={onCancel} className="flex-1 lg:flex-none lg:w-40 py-2 border border-zinc-200 dark:border-zinc-800 rounded-md font-semibold text-zinc-500 dark:text-zinc-400 hover:bg-zinc-50 dark:hover:bg-zinc-900 transition-colors duration-150 text-sm">
            Batal
          </button>
          <button
            type="submit"
            disabled={isSubmitting || (isNon && !form.jenis_produksi)}
            className="flex-1 lg:flex-none lg:w-56 py-2 bg-[#124540] hover:bg-[#0d332f] disabled:opacity-60 text-white rounded-md font-semibold transition-colors duration-150 text-sm flex items-center justify-center gap-2"
          >
            {isSubmitting && <Loader2 className="w-4 h-4 animate-spin" />}
            {isSubmitting ? "Menyimpan..." : "Simpan Pesanan"}
          </button>
        </div>
      </form>
    </div>
  );
}
