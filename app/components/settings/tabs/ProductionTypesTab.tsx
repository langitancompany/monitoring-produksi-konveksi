// app/components/settings/tabs/ProductionTypesTab.tsx
// Tab Jenis Produksi — master data jenis jahitan (utama) dan kategori pesanan
// non-utama. Bisa ditambah kapan saja; yang dinonaktifkan hilang dari pilihan
// form tapi pesanan lama tetap aman.
"use client";

import React, { useState } from "react";
import { Trash2, Pencil, EyeOff, Eye } from "lucide-react";
import type { OrderKategori, ProductionTypeData } from "@/types/order";
import { inputCls, labelCls } from "@/app/components/settings/settingsShared";
import {
  formatList,
  isFreeTextList,
  parseList,
  splitLegacyVarian,
  VARIAN_LAINNYA,
  VARIAN_MODEL_CATALOG,
  VARIAN_WARNA_CATALOG,
} from "@/lib/orderItems";
import type { BagianUkuran } from "@/types/order";

interface Props {
  productionTypes: ProductionTypeData[];
  onSave: (t: {
    id?: string;
    name: string;
    kategori: OrderKategori;
    varian?: string[];
    varian_warna?: string[];
    ukuran?: string[];
    is_custom?: boolean;
    bagian?: BagianUkuran[];
  }) => void;
  onToggle: (t: ProductionTypeData) => void;
  onDelete: (id: string) => void;
}

const DEFAULT_BAGIAN = [
  { nama: "Atasan", ukuranText: "S, M, L, XL, XXL, 3XL" },
  { nama: "Bawahan", ukuranText: "21-41" },
];

const SECTIONS: { kategori: OrderKategori; title: string; desc: string }[] = [
  {
    kategori: "utama",
    title: "Jenis Jahitan Utama",
    desc: "Dipilih admin saat membuat Approval pesanan utama",
  },
  {
    kategori: "non_utama",
    title: "Kategori Pesanan Non-Utama",
    desc: "Dipilih saat membuat pesanan non-utama (selempang, permak, dst.)",
  },
];

/** Satu kelompok varian: dicentang untuk dipakai, lalu pilihannya muncul sebagai kotak centang. */
function VarianGroup({
  title,
  hint,
  catalog,
  enabled,
  options,
  onChange,
  freeTextHint,
}: {
  title: string;
  hint: string;
  /** Tampil bila hanya "Lainnya" yang dicentang (mis. Varian 2: warna diketik langsung). */
  freeTextHint?: string;
  catalog: string[];
  enabled: boolean;
  options: string[];
  onChange: (enabled: boolean, options: string[]) => void;
}) {
  const [draft, setDraft] = useState("");
  const custom = options.filter(
    (o) => !catalog.includes(o) && o !== VARIAN_LAINNYA,
  );
  const toggle = (name: string, on: boolean) =>
    onChange(
      true,
      on
        ? options.includes(name)
          ? options
          : [...options, name]
        : options.filter((o) => o !== name),
    );
  const add = () => {
    const v = draft.trim();
    if (!v) return;
    if (!options.some((o) => o.toLowerCase() === v.toLowerCase()))
      onChange(true, [...options, v]);
    setDraft("");
  };
  return (
    <div className="rounded-md border border-zinc-200 dark:border-zinc-800 p-3 space-y-2">
      <label className="flex items-start gap-2 text-xs text-zinc-700 dark:text-zinc-200">
        <input
          type="checkbox"
          className="mt-0.5"
          checked={enabled}
          onChange={(e) =>
            onChange(
              e.target.checked,
              e.target.checked && options.length === 0 ? [...catalog] : options,
            )
          }
        />
        <span>
          <span className="font-semibold">{title}</span>
          <span className="block text-[11px] text-zinc-400 dark:text-zinc-500">
            {hint}
          </span>
        </span>
      </label>
      {enabled && (
        <div className="space-y-2 pl-6">
          <div className="flex flex-wrap gap-x-4 gap-y-1.5">
            {catalog.map((c) => (
              <label
                key={c}
                className="flex items-center gap-1.5 text-xs text-zinc-600 dark:text-zinc-300"
              >
                <input
                  type="checkbox"
                  checked={options.includes(c)}
                  onChange={(e) => toggle(c, e.target.checked)}
                />
                {c}
              </label>
            ))}
            {custom.map((c) => (
              <label
                key={c}
                className="flex items-center gap-1.5 text-xs text-zinc-600 dark:text-zinc-300"
              >
                <input
                  type="checkbox"
                  checked
                  onChange={() => toggle(c, false)}
                />
                {c}
              </label>
            ))}
          </div>
          <div className="flex gap-2">
            <input
              className={inputCls}
              value={draft}
              maxLength={40}
              placeholder="Tambah pilihan lain…"
              onChange={(e) => setDraft(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === "Enter") {
                  e.preventDefault();
                  add();
                }
              }}
            />
            <button
              type="button"
              onClick={add}
              className="text-xs font-semibold text-[#124540] dark:text-[#49BFB4] shrink-0 px-2"
            >
              + Tambah
            </button>
          </div>
          <label className="flex items-center gap-1.5 text-[11px] text-zinc-500 dark:text-zinc-400">
            <input
              type="checkbox"
              checked={options.includes(VARIAN_LAINNYA)}
              onChange={(e) => toggle(VARIAN_LAINNYA, e.target.checked)}
            />
            Admin boleh mengetik pilihan sendiri (&quot;{VARIAN_LAINNYA}&quot;)
          </label>
          {freeTextHint && isFreeTextList(options) && (
            <p className="text-[11px] text-[#124540] dark:text-[#49BFB4]">
              {freeTextHint}
            </p>
          )}
        </div>
      )}
    </div>
  );
}

export default function ProductionTypesTab({
  productionTypes,
  onSave,
  onToggle,
  onDelete,
}: Props) {
  const [editing, setEditing] = useState<{
    id?: string;
    name: string;
    kategori: OrderKategori;
    /** Varian 1 (model: Panjang/Pendek/1/3) dipakai? — daftar pilihannya disimpan walau dimatikan, supaya bisa dinyalakan lagi */
    modelOn: boolean;
    modelOpts: string[];
    /** Varian 2 (warna) */
    warnaOn: boolean;
    warnaOpts: string[];
    ukuranText: string;
    /** pesanan umum: desain khusus per pesanan, ukuran ditentukan bagian */
    isCustom: boolean;
    bagianRows: { nama: string; ukuranText: string }[];
  } | null>(null);

  const submit = (e: React.FormEvent) => {
    e.preventDefault();
    if (editing) {
      const {
        modelOn,
        modelOpts,
        warnaOn,
        warnaOpts,
        ukuranText,
        bagianRows,
        isCustom,
        ...rest
      } = editing;
      if (editing.kategori === "utama" && isCustom) {
        const bagian = bagianRows
          .map((b) => ({
            nama: b.nama.trim(),
            ukuran: parseList(b.ukuranText),
          }))
          .filter((b) => b.nama);
        onSave({
          ...rest,
          is_custom: true,
          bagian,
          varian: [],
          varian_warna: [],
          ukuran: [],
        });
      } else {
        onSave(
          editing.kategori === "utama"
            ? {
                ...rest,
                varian: modelOn ? modelOpts : [],
                varian_warna: warnaOn ? warnaOpts : [],
                ukuran: parseList(ukuranText),
              }
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
                  <h2 className="text-base font-semibold tracking-tight text-zinc-900 dark:text-zinc-100">
                    {title}
                  </h2>
                  <p className="text-xs text-zinc-500 dark:text-zinc-400 mt-0.5">
                    {desc}
                  </p>
                </div>
                <button
                  onClick={() =>
                    setEditing({
                      name: "",
                      kategori,
                      modelOn: false,
                      modelOpts: [...VARIAN_MODEL_CATALOG],
                      warnaOn: false,
                      warnaOpts: [...VARIAN_WARNA_CATALOG],
                      ukuranText: "",
                      isCustom: false,
                      bagianRows: DEFAULT_BAGIAN,
                    })
                  }
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
                      <div className="font-semibold text-zinc-800 dark:text-zinc-200 text-sm truncate">
                        {pt.name}
                      </div>
                      <div className="font-mono tabular-nums text-[11px] px-2.5 py-1 rounded-full border border-zinc-300/70 dark:border-zinc-700 bg-white/80 dark:bg-zinc-800/80 text-zinc-700 dark:text-zinc-300 mt-1 w-fit">
                        {pt.value}
                        {!pt.is_active && " · nonaktif"}
                      </div>
                      {pt.kategori === "utama" && (
                        <p className="text-[11px] text-zinc-500 dark:text-zinc-400 mt-1.5">
                          {pt.is_custom
                            ? `Pesanan umum · ${(pt.bagian ?? []).map((b) => `${b.nama}: ${formatList(b.ukuran)}`).join(" · ") || "bagian belum diatur"}`
                            : (pt.ukuran?.length ?? 0) > 0
                              ? `Ukuran: ${formatList(pt.ukuran)}`
                              : "Ukuran belum diatur"}
                          {!pt.is_custom &&
                            (pt.varian?.length ?? 0) > 0 &&
                            ` · Varian: ${formatList(pt.varian)}`}
                          {!pt.is_custom &&
                            (pt.varian_warna?.length ?? 0) > 0 &&
                            ` · Warna: ${isFreeTextList(pt.varian_warna) ? "ketik bebas" : formatList(pt.varian_warna)}`}
                        </p>
                      )}
                    </div>
                    <div className="flex gap-1 shrink-0">
                      <button
                        onClick={() => {
                          // data lama menyimpan warna di daftar varian; pisahkan ke Varian 1 / Varian 2
                          const split = splitLegacyVarian(
                            pt.varian,
                            pt.varian_warna,
                          );
                          setEditing({
                            id: pt.id,
                            name: pt.name,
                            kategori: pt.kategori,
                            modelOn: split.model.length > 0,
                            modelOpts:
                              split.model.length > 0
                                ? split.model
                                : [...VARIAN_MODEL_CATALOG],
                            warnaOn: split.warna.length > 0,
                            warnaOpts:
                              split.warna.length > 0
                                ? split.warna
                                : [...VARIAN_WARNA_CATALOG],
                            ukuranText: formatList(pt.ukuran),
                            isCustom: pt.is_custom === true,
                            bagianRows: (pt.bagian ?? []).map((b) => ({
                              nama: b.nama,
                              ukuranText: formatList(b.ukuran),
                            })),
                          });
                        }}
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
                        {pt.is_active ? (
                          <EyeOff className="w-4 h-4" />
                        ) : (
                          <Eye className="w-4 h-4" />
                        )}
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
              {editing.id ? "Ubah" : "Tambah"}{" "}
              {editing.kategori === "utama"
                ? "Jenis Jahitan"
                : "Kategori Non-Utama"}
            </h3>
            <form onSubmit={submit} className="space-y-4">
              <div>
                <label className={labelCls}>Nama</label>
                <input
                  autoFocus
                  required
                  className={inputCls}
                  value={editing.name}
                  onChange={(e) =>
                    setEditing({ ...editing, name: e.target.value })
                  }
                  placeholder={
                    editing.kategori === "utama"
                      ? "mis. Rok Sekolah"
                      : "mis. Jahit Gorden"
                  }
                />
              </div>
              {editing.kategori === "utama" && !editing.id && (
                <label className="flex items-start gap-2 text-xs text-zinc-600 dark:text-zinc-300">
                  <input
                    type="checkbox"
                    className="mt-0.5"
                    checked={editing.isCustom}
                    onChange={(e) =>
                      setEditing({ ...editing, isCustom: e.target.checked })
                    }
                  />
                  <span>
                    <span className="font-semibold">Pesanan umum</span> — desain
                    khusus (tender, instansi). Tiap pesanan punya nama model,
                    bagian, dan mockup sendiri.
                  </span>
                </label>
              )}
              {editing.kategori === "utama" && editing.isCustom && (
                <div>
                  <label className={labelCls}>Bagian &amp; ukurannya</label>
                  <div className="space-y-2">
                    {editing.bagianRows.map((b, i) => (
                      <div
                        key={i}
                        className="grid grid-cols-[7rem_1fr_auto] gap-2 items-start"
                      >
                        <input
                          className={inputCls}
                          value={b.nama}
                          placeholder="mis. Atasan"
                          onChange={(e) =>
                            setEditing({
                              ...editing,
                              bagianRows: editing.bagianRows.map((r, j) =>
                                j === i ? { ...r, nama: e.target.value } : r,
                              ),
                            })
                          }
                        />
                        <input
                          className={`${inputCls} font-mono`}
                          value={b.ukuranText}
                          placeholder="mis. S, M, L, XL  atau  21-41"
                          onChange={(e) =>
                            setEditing({
                              ...editing,
                              bagianRows: editing.bagianRows.map((r, j) =>
                                j === i
                                  ? { ...r, ukuranText: e.target.value }
                                  : r,
                              ),
                            })
                          }
                        />
                        <button
                          type="button"
                          title="Hapus bagian"
                          disabled={editing.bagianRows.length <= 1}
                          onClick={() =>
                            setEditing({
                              ...editing,
                              bagianRows: editing.bagianRows.filter(
                                (_, j) => j !== i,
                              ),
                            })
                          }
                          className="p-2 text-zinc-400 hover:text-red-600 disabled:opacity-30 disabled:hover:text-zinc-400 transition-colors duration-150"
                        >
                          <Trash2 className="w-4 h-4" />
                        </button>
                      </div>
                    ))}
                  </div>
                  <button
                    type="button"
                    onClick={() =>
                      setEditing({
                        ...editing,
                        bagianRows: [
                          ...editing.bagianRows,
                          { nama: "", ukuranText: "" },
                        ],
                      })
                    }
                    className="mt-2 text-xs font-semibold text-[#124540] dark:text-[#49BFB4]"
                  >
                    + Tambah bagian
                  </button>
                  <p className="mt-1 text-[11px] text-zinc-400 dark:text-zinc-500">
                    Bagian yang dipilih admin menentukan daftar ukuran. Rentang
                    angka boleh ditulis 21-41. Perubahan tidak memengaruhi
                    pesanan yang sudah dibuat.
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
                      onChange={(e) =>
                        setEditing({ ...editing, ukuranText: e.target.value })
                      }
                      placeholder="mis. 25-43  atau  S, M, L, XL"
                    />
                    <p className="mt-1 text-[11px] text-zinc-400 dark:text-zinc-500">
                      Pisahkan dengan koma. Rentang angka boleh ditulis 25-43.
                      Kosongkan bila jumlah cukup satu angka.
                    </p>
                  </div>
                  <div className="space-y-2">
                    <label className={labelCls}>Varian (opsional)</label>
                    <VarianGroup
                      title="Varian 1 — Lengan Panjang / Lengan Panjang Rib / Pendek / 1/3"
                      hint="Memengaruhi harga: Lengan Panjang Rib otomatis = tambahan lengan panjang + tambahan rib di Config Harga. Nama lain (mis. Panjang untuk celana) bisa ditambah lewat kolom di bawah."
                      catalog={VARIAN_MODEL_CATALOG}
                      enabled={editing.modelOn}
                      options={editing.modelOpts}
                      onChange={(on, opts) =>
                        setEditing({ ...editing, modelOn: on, modelOpts: opts })
                      }
                    />
                    <VarianGroup
                      title="Varian 2 — Warna"
                      hint="Abu-abu, Coklat, Biru, Putih, Pramuka. Tidak memengaruhi harga."
                      catalog={VARIAN_WARNA_CATALOG}
                      enabled={editing.warnaOn}
                      options={editing.warnaOpts}
                      freeTextHint="Hanya ini yang dicentang: di form pesanan, admin langsung mengetik nama warna (tersimpan apa adanya, mis. Hitam)."
                      onChange={(on, opts) =>
                        setEditing({ ...editing, warnaOn: on, warnaOpts: opts })
                      }
                    />
                    <p className="text-[11px] text-zinc-400 dark:text-zinc-500">
                      Centang Varian 1 dan/atau Varian 2, lalu pilih yang
                      tersedia untuk jenis ini. Saat membuat Approval, admin
                      memilih dari daftar ini. Perubahan tidak memengaruhi
                      pesanan yang sudah dibuat.
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
