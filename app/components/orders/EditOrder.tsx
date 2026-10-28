// app/components/orders/EditOrder.tsx
// Edit data pesanan (pemesan, tanggal, jumlah, item). Status & tahap TIDAK
// diubah di sini — itu hanya lewat aksi di Detail Pesanan.
"use client";

import React, { useMemo, useState } from "react";
import { ArrowLeft, Loader2 } from "lucide-react";
import type { EditOrderInput, Order, OrderItem, ProductionTypeData } from "@/types/order";
import type { UserData } from "@/types";
import type { TeamData } from "@/types/team";
import { sumItems, validateItems } from "@/lib/orderItems";
import { inputCls, labelCls } from "@/app/components/settings/settingsShared";
import ItemsEditor from "./detail/ItemsEditor";
import TeamPicker from "./TeamPicker";
import PJPicker from "./PJPicker";

interface Props {
  order: Order;
  /** semua jenis produksi (aktif & tidak) — dipilah di sini per kategori */
  productionTypes: ProductionTypeData[];
  /** semua tim (aktif & tidak) — dipilah di sini */
  teams: TeamData[];
  users: UserData[];
  isSubmitting: boolean;
  onCancel: () => void;
  onSubmit: (data: EditOrderInput) => void;
}

export default function EditOrder({ order, productionTypes, teams, users, isSubmitting, onCancel, onSubmit }: Props) {
  const isNon = order.kategori === "non_utama";
  const approvalDone = order.steps.find((s) => s.key === "approval")?.isCompleted === true;
  const editItems = !isNon && approvalDone; // item jadi sumber jumlah

  const [form, setForm] = useState({
    nama_pemesan: order.nama_pemesan,
    no_hp: order.no_hp ?? "",
    alamat_pemesan: order.alamat_pemesan ?? "",
    tanggal_masuk: order.tanggal_masuk,
    deadline: order.deadline,
    catatan_pesanan: order.catatan_pesanan ?? "",
    jumlah: order.jumlah,
    jenis_produksi: order.jenis_produksi ?? "",
  });
  const [items, setItems] = useState<OrderItem[]>(order.items);
  const [mockupFiles, setMockupFiles] = useState<Record<string, File>>({});
  const setMockup = (itemId: string, file: File | null) =>
    setMockupFiles((prev) => {
      const next = { ...prev };
      if (file) next[itemId] = file;
      else delete next[itemId];
      return next;
    });
  const [teamId, setTeamId] = useState<string | null>(order.team_id ?? null);
  const [pjId, setPjId] = useState<string | null>(order.assigned_to ?? null);
  const [error, setError] = useState<string | null>(null);

  const set = <K extends keyof typeof form>(k: K, v: (typeof form)[K]) => setForm((f) => ({ ...f, [k]: v }));

  const utamaTypes = useMemo(() => productionTypes.filter((t) => t.kategori === "utama"), [productionTypes]);
  const nonUtamaOptions = useMemo(
    () => productionTypes.filter((t) => t.kategori === "non_utama" && (t.is_active || t.value === order.jenis_produksi)),
    [productionTypes, order.jenis_produksi],
  );

  // Tim aktif + tim pesanan ini sekarang (walau sudah dinonaktifkan, agar tidak hilang diam-diam)
  const teamOptions = useMemo(
    () => teams.filter((t) => t.is_active || t.id === order.team_id),
    [teams, order.team_id],
  );

  const submit = (e: React.FormEvent) => {
    e.preventDefault();
    if (isSubmitting) return;
    if (!pjId) {
      setError("Penanggung jawab (PJ) wajib dipilih.");
      return;
    }
    if (form.deadline < form.tanggal_masuk) {
      setError("Deadline tidak boleh lebih awal dari tanggal masuk.");
      return;
    }
    if (editItems) {
      const problem = validateItems(items, productionTypes, mockupFiles);
      if (problem) {
        setError(problem);
        return;
      }
    } else if (isNon && (!form.jumlah || form.jumlah < 1)) {
      setError("Jumlah minimal 1 pcs.");
      return;
    }
    setError(null);
    onSubmit({
      ...form,
      jenis_produksi: isNon ? form.jenis_produksi : order.jenis_produksi,
      team_id: teamId,
      assigned_to: pjId,
      ...(editItems ? { items, mockups: mockupFiles } : {}),
    });
  };

  return (
    <div className="w-full space-y-4">
      <button
        onClick={onCancel}
        className="flex items-center gap-1.5 text-xs font-semibold text-zinc-500 dark:text-zinc-400 hover:text-zinc-900 dark:hover:text-zinc-100 transition-colors duration-150"
      >
        <ArrowLeft className="w-4 h-4" /> Kembali ke detail
      </button>

      <form onSubmit={submit} className="w-full bg-white dark:bg-zinc-950 rounded-xl border border-zinc-200 dark:border-zinc-800 p-5 md:p-6 grid grid-cols-1 lg:grid-cols-2 gap-x-6 gap-y-4 items-start">
        <div className="lg:col-span-2">
          <h2 className="text-base font-semibold tracking-tight text-zinc-900 dark:text-zinc-100">Edit Pesanan</h2>
          <p className="text-xs text-zinc-500 dark:text-zinc-400 mt-0.5 font-mono tabular-nums">{order.kode_produksi}</p>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-2 gap-4 lg:col-span-2">
          <div>
            <label className={labelCls}>Nama pemesan *</label>
            <input required className={inputCls} value={form.nama_pemesan} onChange={(e) => set("nama_pemesan", e.target.value)} />
          </div>
          <div>
            <label className={labelCls}>No. HP / WhatsApp</label>
            <input inputMode="tel" className={inputCls} value={form.no_hp} onChange={(e) => set("no_hp", e.target.value)} />
          </div>
        </div>

        <div>
          <label className={labelCls}>Alamat</label>
          <textarea rows={2} className={inputCls} value={form.alamat_pemesan} onChange={(e) => set("alamat_pemesan", e.target.value)} />
        </div>

        <div>
          <label className={labelCls}>Catatan</label>
          <textarea rows={2} className={inputCls} value={form.catatan_pesanan} onChange={(e) => set("catatan_pesanan", e.target.value)} />
        </div>

        {isNon && (
          <div className="lg:col-span-2">
            <label className={labelCls}>Kategori pemesanan *</label>
            <select required className={inputCls} value={form.jenis_produksi} onChange={(e) => set("jenis_produksi", e.target.value)}>
              {nonUtamaOptions.map((t) => (
                <option key={t.id} value={t.value}>{t.name}</option>
              ))}
            </select>
          </div>
        )}

        <PJPicker value={pjId} onChange={setPjId} users={users} disabled={isSubmitting} />

        <TeamPicker value={teamId} onChange={setTeamId} teams={teamOptions} users={users} disabled={isSubmitting} />

        <div className="grid grid-cols-1 md:grid-cols-3 gap-4 lg:col-span-2">
          <div>
            <label className={labelCls}>Jumlah (pcs) *</label>
            {editItems ? (
              <p className="px-3 py-2 text-sm font-mono tabular-nums text-zinc-900 dark:text-zinc-100">{sumItems(items)} <span className="text-[11px] text-zinc-400">(total item)</span></p>
            ) : !isNon ? (
              <p className="px-3 py-2 text-xs text-zinc-400 dark:text-zinc-500 italic">Diisi saat Approval</p>
            ) : (
              <input required type="number" min={1} inputMode="numeric" className={inputCls} value={form.jumlah || ""} onChange={(e) => set("jumlah", parseInt(e.target.value, 10) || 0)} />
            )}
          </div>
          <div>
            <label className={labelCls}>Tanggal masuk *</label>
            <input required type="date" className={inputCls} value={form.tanggal_masuk} onChange={(e) => set("tanggal_masuk", e.target.value)} />
          </div>
          <div>
            <label className={labelCls}>Deadline *</label>
            <input required type="date" min={form.tanggal_masuk} className={inputCls} value={form.deadline} onChange={(e) => set("deadline", e.target.value)} />
          </div>
        </div>

        {editItems && (
          <div className="lg:col-span-2">
            <p className={labelCls}>Item pesanan *</p>
            <ItemsEditor
              items={items}
              types={utamaTypes}
              onChange={setItems}
              disabled={isSubmitting}
              mockupFiles={mockupFiles}
              onMockupChange={setMockup}
            />
            <p className="mt-2 text-[11px] text-zinc-400 dark:text-zinc-500">
              Item dipakai untuk menghitung gaji produksi. Mengubahnya setelah tahap produksi berjalan akan memengaruhi gaji.
            </p>
          </div>
        )}


        {error && (
          <p className="lg:col-span-2 rounded-md border border-red-200 dark:border-red-900/50 bg-red-50 dark:bg-red-950/30 px-3 py-2 text-xs text-red-700 dark:text-red-300">{error}</p>
        )}

        <div className="flex gap-2 pt-2 lg:col-span-2 lg:justify-end">
          <button type="button" onClick={onCancel} className="flex-1 lg:flex-none lg:w-40 py-2 border border-zinc-200 dark:border-zinc-800 rounded-md font-semibold text-zinc-500 dark:text-zinc-400 hover:bg-zinc-50 dark:hover:bg-zinc-900 transition-colors duration-150 text-sm">
            Batal
          </button>
          <button type="submit" disabled={isSubmitting} className="flex-1 lg:flex-none lg:w-56 py-2 bg-[#124540] hover:bg-[#0d332f] disabled:opacity-60 text-white rounded-md font-semibold transition-colors duration-150 text-sm flex items-center justify-center gap-2">
            {isSubmitting && <Loader2 className="w-4 h-4 animate-spin" />}
            {isSubmitting ? "Menyimpan..." : "Simpan Perubahan"}
          </button>
        </div>
      </form>
    </div>
  );
}
