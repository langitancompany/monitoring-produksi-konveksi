// app/components/settings/tabs/ProductionTypesTab.tsx
// Tab Jenis Produksi — master data jenis jahitan (utama) dan kategori pesanan
// non-utama. Bisa ditambah kapan saja; yang dinonaktifkan hilang dari pilihan
// form tapi pesanan lama tetap aman.
"use client";

import React, { useState } from "react";
import { Trash2, Pencil, EyeOff, Eye } from "lucide-react";
import type { OrderKategori, ProductionTypeData } from "@/types/order";
import { inputCls, labelCls } from "@/app/components/settings/settingsShared";
import { formatList, parseList } from "@/lib/orderItems";
import type { BagianUkuran } from "@/types/order";

interface Props {
  productionTypes: ProductionTypeData[];
  onSave: (t: { id?: string; name: string; kategori: OrderKategori; varian?: string[]; ukuran?: string[]; is_custom?: boolean; bagian?: BagianUkuran[] }) => void;
  onToggle: (t: ProductionTypeData) => void;
  onDelete: (id: string) => void;
}

const DEFAULT_BAGIAN = [
  { nama: "Atasan", ukuranText: "S, M, L, XL, XXL, 3XL" },
  { nama: "Bawahan", ukuranText: "21-41" },
];

const SECTIONS: { kategori: OrderKategori; title: string; desc: string }[] = [
  { kategori: "utama", title: "Jenis Jahitan Utama", desc: "Dipilih admin saat membuat Approval pesanan utama" },
  { kategori: "non_utama", title: "Kategori Pesanan Non-Utama", desc: "Dipilih saat membuat pesanan non-utama (selempang, permak, dst.)" },
];

export default function ProductionTypesTab({ productionTypes, onSave, onToggle, onDelete }: Props) {
  const [editing, setEditing] = useState<{
    id?: string;
    name: string;
    kategori: OrderKategori;
    varianText: string;
    ukuranText: string;
    /** pesanan umum: desain khusus per pesanan, ukuran ditentukan bagian */
    isCustom: boolean;
    bagianRows: { nama: string; ukuranText: string }[];
  } | null>(null);

  const submit = (e: React.FormEvent) => {
    e.preventDefault();
    if (editing) {
      const { varianText, ukuranText, bagianRows, isCustom, ...rest } = editing;
      if (editing.kategori === "utama" && isCustom) {
        const bagian = bagianRows
          .map((b) => ({ nama: b.nama.trim(), ukuran: parseList(b.ukuranText) }))
          .filter((b) => b.nama);
        onSave({ ...rest, is_custom: true, bagian, varian: [], ukuran: [] });
      } else {
        onSave(
          editing.kategori === "utama"
            ? { ...rest, varian: parseList(varianText), ukuran: parseList(ukuranText) }
            : rest,
        );
      }
    }
    setEditing(null);
  };

  return (
    <>
      <div className="space-y-6">
        {SECTIONS.map(({ kategori, title, desc }) => {
          const list = productionTypes.filter((t) => t.kategori === kategori);
          return (
            <div key={kategori} className="space-y-3">
              <div className="flex justify-between items-center bg-white dark:bg-zinc-950 rounded-xl border border-zinc-200 dark:border-zinc-800 p-5 md:p-6">
                <div>
                  <h2 className="text-base font-semibold tracking-tight text-zinc-900 dark:text-zinc-100">{title}</h2>
                  <p className="text-xs text-zinc-500 dark:text-zinc-400 mt-0.5">{desc}</p>
                </div>
                <button
                  onClick={() => setEditing({ name: "", kategori, varianText: "", ukuranText: "", isCustom: false, bagianRows: DEFAULT_BAGIAN })}
                  className="bg-[#124540] hover:bg-[#0d332f] text-white px-3 py-1.5 rounded-md text-xs font-semibold transition-colors duration-150 shrink-0"
                >
                  + Tambah
                </button>
              </div>

              <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 2xl:grid-cols-4 gap-3 md:gap-4">
                {list.map((pt) => (
                  <div
                    key={pt.id}
                    className={`bg-white dark:bg-zinc-950 p-5 rounded-xl border border-zinc-200 dark:border-zinc-800 flex justify-between items-center gap-2 ${pt.is_active ? "" : "opacity-60"}`}
                  >
                    <div className="min-w-0">
                      <div className="font-semibold text-zinc-800 dark:text-zinc-200 text-sm truncate">{pt.name}</div>
                      <div className="font-mono tabular-nums text-[11px] px-2.5 py-1 rounded-full border border-zinc-300/70 dark:border-zinc-700 bg-white/80 dark:bg-zinc-800/80 text-zinc-700 dark:text-zinc-300 mt-1 w-fit">
                        {pt.value}
                        {!pt.is_active && " · nonaktif"}
                      </div>
                      {pt.kategori === "utama" && (
                        <p className="text-[11px] text-zinc-500 dark:text-zinc-400 mt-1.5">
                          {pt.is_custom
                            ? `Pesanan umum · ${(pt.bagian ?? []).map((b) => `${b.nama}: ${formatList(b.ukuran)}`).join(" · ") || "bagian belum diatur"}`
                            : (pt.ukuran?.length ?? 0) > 0 ? `Ukuran: ${formatList(pt.ukuran)}` : "Ukuran belum diatur"}
                          {!pt.is_custom && (pt.varian?.length ?? 0) > 0 && ` · Varian: ${formatList(pt.varian)}`}
                        </p>
                      )}
                    </div>
                    <div className="flex gap-1 shrink-0">
                      <button
                        onClick={() => setEditing({
                          id: pt.id,
                          name: pt.name,
                          kategori: pt.kategori,
                          varianText: formatList(pt.varian),
                          ukuranText: formatList(pt.ukuran),
                          isCustom: pt.is_custom === true,
                          bagianRows: (pt.bagian ?? []).map((b) => ({ nama: b.nama, ukuranText: formatList(b.ukuran) })),
                        })}
                        title="Ubah"
                        className="p-1.5 text-zinc-300 dark:text-zinc-600 hover:text-[#124540] dark:hover:text-[#49BFB4] hover:bg-zinc-100 dark:hover:bg-zinc-800 rounded-md transition-colors duration-150"
                      >
                        <Pencil className="w-4 h-4" />
                      </button>
                      <button
                        onClick={() => onToggle(pt)}
                        title={pt.is_active ? "Nonaktifkan" : "Aktifkan"}
                        className="p-1.5 text-zinc-300 dark:text-zinc-600 hover:text-[#124540] dark:hover:text-[#49BFB4] hover:bg-zinc-100 dark:hover:bg-zinc-800 rounded-md transition-colors duration-150"
                      >
                        {pt.is_active ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
                      </button>
                      <button
                        onClick={() => onDelete(pt.id)}
                        title="Hapus"
                        className="p-1.5 text-zinc-300 dark:text-zinc-600 hover:text-red-600 hover:bg-zinc-100 dark:hover:bg-zinc-800 rounded-md transition-colors duration-150"
                      >
                        <Trash2 className="w-4 h-4" />
                      </button>
                    </div>
                  </div>
                ))}
                {list.length === 0 && (
                  <p className="text-xs text-zinc-400 dark:text-zinc-600 col-span-full text-center py-6 border border-dashed border-zinc-200 dark:border-zinc-800 rounded-xl">
                    Belum ada data
                  </p>
                )}
              </div>
            </div>
          );
        })}
      </div>

      {editing && (
        <div className="fixed inset-0 bg-black/70 z-99 flex items-center justify-center p-4">
          <div className="bg-white dark:bg-zinc-950 p-6 rounded-xl w-full max-w-sm border border-zinc-200 dark:border-zinc-800">
            <h3 className="text-base font-semibold tracking-tight mb-4 text-zinc-900 dark:text-zinc-100">
              {editing.id ? "Ubah" : "Tambah"} {editing.kategori === "utama" ? "Jenis Jahitan" : "Kategori Non-Utama"}
            </h3>
            <form onSubmit={submit} className="space-y-4">
              <div>
                <label className={labelCls}>Nama</label>
                <input
                  autoFocus
                  required
                  className={inputCls}
                  value={editing.name}
                  onChange={(e) => setEditing({ ...editing, name: e.target.value })}
                  placeholder={editing.kategori === "utama" ? "mis. Rok Sekolah" : "mis. Jahit Gorden"}
                />
              </div>
              {editing.kategori === "utama" && !editing.id && (
                <label className="flex items-start gap-2 text-xs text-zinc-600 dark:text-zinc-300">
                  <input
                    type="checkbox"
                    className="mt-0.5"
                    checked={editing.isCustom}
                    onChange={(e) => setEditing({ ...editing, isCustom: e.target.checked })}
                  />
                  <span>
                    <span className="font-semibold">Pesanan umum</span> — desain khusus (tender, instansi). Tiap pesanan
                    punya nama model, bagian, dan mockup sendiri.
                  </span>
                </label>
              )}
              {editing.kategori === "utama" && editing.isCustom && (
                <div>
                  <label className={labelCls}>Bagian &amp; ukurannya</label>
                  <div className="space-y-2">
                    {editing.bagianRows.map((b, i) => (
                      <div key={i} className="grid grid-cols-[7rem_1fr_auto] gap-2 items-start">
                        <input
                          className={inputCls}
                          value={b.nama}
                          placeholder="mis. Atasan"
                          onChange={(e) =>
                            setEditing({ ...editing, bagianRows: editing.bagianRows.map((r, j) => (j === i ? { ...r, nama: e.target.value } : r)) })
                          }
                        />
                        <input
                          className={`${inputCls} font-mono`}
                          value={b.ukuranText}
                          placeholder="mis. S, M, L, XL  atau  21-41"
                          onChange={(e) =>
                            setEditing({ ...editing, bagianRows: editing.bagianRows.map((r, j) => (j === i ? { ...r, ukuranText: e.target.value } : r)) })
                          }
                        />
                        <button
                          type="button"
                          title="Hapus bagian"
                          disabled={editing.bagianRows.length <= 1}
                          onClick={() => setEditing({ ...editing, bagianRows: editing.bagianRows.filter((_, j) => j !== i) })}
                          className="p-2 text-zinc-400 hover:text-red-600 disabled:opacity-30 disabled:hover:text-zinc-400 transition-colors duration-150"
                        >
                          <Trash2 className="w-4 h-4" />
                        </button>
                      </div>
                    ))}
                  </div>
                  <button
                    type="button"
                    onClick={() => setEditing({ ...editing, bagianRows: [...editing.bagianRows, { nama: "", ukuranText: "" }] })}
                    className="mt-2 text-xs font-semibold text-[#124540] dark:text-[#49BFB4]"
                  >
                    + Tambah bagian
                  </button>
                  <p className="mt-1 text-[11px] text-zinc-400 dark:text-zinc-500">
                    Bagian yang dipilih admin menentukan daftar ukuran. Rentang angka boleh ditulis 21-41. Perubahan tidak
                    memengaruhi pesanan yang sudah dibuat.
                  </p>
                </div>
              )}
              {editing.kategori === "utama" && !editing.isCustom && (
                <>
                  <div>
                    <label className={labelCls}>Daftar ukuran</label>
                    <textarea
                      rows={2}
                      className={`${inputCls} font-mono`}
                      value={editing.ukuranText}
                      onChange={(e) => setEditing({ ...editing, ukuranText: e.target.value })}
                      placeholder="mis. 25-43  atau  S, M, L, XL"
                    />
                    <p className="mt-1 text-[11px] text-zinc-400 dark:text-zinc-500">
                      Pisahkan dengan koma. Rentang angka boleh ditulis 25-43. Kosongkan bila jumlah cukup satu angka.
                    </p>
                  </div>
                  <div>
                    <label className={labelCls}>Varian (opsional)</label>
                    <textarea
                      rows={2}
                      className={inputCls}
                      value={editing.varianText}
                      onChange={(e) => setEditing({ ...editing, varianText: e.target.value })}
                      placeholder="mis. Abu-abu, Pramuka, Biru, Lainnya"
                    />
                    <p className="mt-1 text-[11px] text-zinc-400 dark:text-zinc-500">
                      Tulis &quot;Lainnya&quot; bila admin boleh mengetik nama varian sendiri.
                    </p>
                  </div>
                </>
              )}
              <div className="flex gap-2 pt-2">
                <button
                  type="button"
                  onClick={() => setEditing(null)}
                  className="flex-1 py-2 border border-zinc-200 dark:border-zinc-800 rounded-md font-semibold text-zinc-500 dark:text-zinc-400 hover:bg-zinc-50 dark:hover:bg-zinc-900 transition-colors duration-150 text-sm"
                >
                  Batal
                </button>
                <button
                  type="submit"
                  className="flex-1 py-2 bg-[#124540] hover:bg-[#0d332f] text-white rounded-md font-semibold transition-colors duration-150 text-sm"
                >
                  Simpan
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </>
  );
}
