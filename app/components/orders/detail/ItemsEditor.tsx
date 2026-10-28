// app/components/orders/detail/ItemsEditor.tsx
// Daftar item pesanan. Dipakai form Approval dan Edit Pesanan.
//  - jenis tanpa daftar ukuran : satu isian jumlah (seperti sebelumnya)
//  - jenis berukuran           : jumlah per ukuran (mis. celana 25–43, seragam S–XXL)
//  - jenis bervarian           : blok per varian (mis. celana Abu-abu / Pramuka / Biru / Lainnya),
//                                tiap blok punya isian ukuran sendiri
//  - pesanan umum (tender/instansi): tiap desain = satu item dengan nama model, bagian
//                                (atasan/bawahan → menentukan daftar ukuran), dan mockup wajib
// Jenis biasa hanya boleh sekali; pesanan umum boleh berkali-kali. `jumlah` item selalu
// total seluruh ukuran.
"use client";

import React, { useEffect, useMemo } from "react";
import { ImagePlus, Plus, Trash2 } from "lucide-react";
import type { ItemRincian, OrderItem, ProductionTypeData } from "@/types/order";
import {
  VARIAN_LAINNYA,
  alignRincian,
  emptyRincian,
  hasUkuran,
  hasVarian,
  isCustomType,
  newItemId,
  ukuranList,
  sumItems,
  sumRincian,
  sumUkuran,
} from "@/lib/orderItems";
import { inputCls, labelCls } from "@/app/components/settings/settingsShared";

interface Props {
  items: OrderItem[];
  /** jenis produksi kategori utama (yang aktif + yang sudah terpakai di item) */
  types: ProductionTypeData[];
  onChange: (items: OrderItem[]) => void;
  disabled?: boolean;
  /** mockup pesanan umum yang baru dipilih (belum diupload), kunci = item.id */
  mockupFiles?: Record<string, File>;
  onMockupChange?: (itemId: string, file: File | null) => void;
}

const pcs = (n: number) => n.toLocaleString("id-ID");

export default function ItemsEditor({ items, types, onChange, disabled, mockupFiles = {}, onMockupChange }: Props) {
  const typeOf = (value: string) => types.find((t) => t.value === value);

  const usedByOthers = (idx: number) =>
    new Set(items.filter((_, i) => i !== idx).map((it) => it.jenis_produksi));

  const optionsFor = (idx: number) =>
    types.filter(
      (t) =>
        (t.is_active || t.value === items[idx].jenis_produksi) &&
        (isCustomType(t) || !usedByOthers(idx).has(t.value)),
    );

  const replace = (idx: number, next: OrderItem) =>
    onChange(items.map((it, i) => (i === idx ? next : it)));

  /** Ubah rincian satu item dan hitung ulang jumlah totalnya. */
  const setRincian = (idx: number, rincian: ItemRincian[]) =>
    replace(idx, { ...items[idx], rincian, jumlah: sumRincian(rincian) });

  const pickJenis = (idx: number, value: string) => {
    const type = typeOf(value);
    const base: OrderItem = { id: items[idx].id, jenis_produksi: value, jumlah: 0, catatan: items[idx].catatan };
    onMockupChange?.(items[idx].id, null);
    if (isCustomType(type)) {
      // pesanan umum: ukuran baru muncul setelah bagian dipilih; bila hanya ada satu bagian, langsung dipilih
      const only = type?.bagian?.length === 1 ? type.bagian[0] : null;
      replace(idx, only
        ? { ...base, nama_model: "", bagian: only.nama, rincian: [emptyRincian(type, undefined, only.ukuran)] }
        : { ...base, nama_model: "" });
      return;
    }
    replace(idx, hasUkuran(type) ? { ...base, rincian: [emptyRincian(type)] } : base);
  };

  const pickBagian = (idx: number, nama: string) => {
    const it = items[idx];
    const next: OrderItem = { ...it, bagian: nama || undefined, rincian: undefined, jumlah: 0 };
    const ukuran = ukuranList(typeOf(it.jenis_produksi), next);
    replace(idx, ukuran.length > 0 ? { ...next, rincian: [emptyRincian(typeOf(it.jenis_produksi), undefined, ukuran)] } : next);
  };

  const removeItem = (idx: number) => {
    onMockupChange?.(items[idx].id, null);
    onChange(items.filter((_, i) => i !== idx));
  };

  const allUsed =
    !types.some((t) => t.is_active && isCustomType(t)) &&
    types.filter((t) => t.is_active).every((t) => items.some((it) => it.jenis_produksi === t.value));

  return (
    <div className="space-y-3">
      {items.map((it, idx) => {
        const type = typeOf(it.jenis_produksi);
        const rincian = it.rincian ?? [];
        const custom = isCustomType(type);
        // Item lama (tanpa rincian, sudah punya total) tetap tampil sebagai satu angka.
        const gridMode = hasUkuran(type, it) && (rincian.length > 0 || !(it.jumlah > 0));
        const legacyHasUkuran = hasUkuran(type, it) && !gridMode;
        const total = it.rincian && it.rincian.length > 0 ? sumRincian(it.rincian) : it.jumlah || 0;

        return (
          <div
            key={it.id}
            className="rounded-md border border-zinc-200 dark:border-zinc-800 bg-white dark:bg-zinc-950 p-3 space-y-3"
          >
            <div className="grid grid-cols-[1fr_auto] gap-2 items-end">
              <div>
                <label className={labelCls}>Jenis produksi</label>
                <select
                  disabled={disabled}
                  className={inputCls}
                  value={it.jenis_produksi}
                  onChange={(e) => pickJenis(idx, e.target.value)}
                >
                  <option value="">Pilih jenis…</option>
                  {optionsFor(idx).map((t) => (
                    <option key={t.id} value={t.value}>
                      {t.name}
                    </option>
                  ))}
                </select>
              </div>
              <button
                type="button"
                disabled={disabled || items.length <= 1}
                onClick={() => removeItem(idx)}
                className="p-2 mb-0.5 rounded-md text-zinc-400 hover:text-red-600 dark:hover:text-red-400 disabled:opacity-30 disabled:hover:text-zinc-400 transition-colors duration-150"
                aria-label="Hapus jenis produksi"
                title="Hapus jenis produksi"
              >
                <Trash2 className="w-4 h-4" />
              </button>
            </div>

            {/* ── Pesanan umum: nama model, bagian, mockup ── */}
            {it.jenis_produksi && custom && (
              <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                <div>
                  <label className={labelCls}>Nama model / desain *</label>
                  <input
                    disabled={disabled}
                    className={inputCls}
                    value={it.nama_model ?? ""}
                    onChange={(e) => replace(idx, { ...it, nama_model: e.target.value })}
                    placeholder="mis. Baju Dinas Harian"
                  />
                </div>
                <div>
                  <label className={labelCls}>Bagian *</label>
                  <select
                    disabled={disabled}
                    className={inputCls}
                    value={it.bagian ?? ""}
                    onChange={(e) => pickBagian(idx, e.target.value)}
                  >
                    <option value="">Pilih bagian…</option>
                    {(type?.bagian ?? []).map((b) => (
                      <option key={b.nama} value={b.nama}>
                        {b.nama}
                      </option>
                    ))}
                  </select>
                </div>
                <div className="md:col-span-2">
                  <MockupField
                    disabled={disabled}
                    existingUrl={it.mockup_url}
                    file={mockupFiles[it.id] ?? null}
                    onChange={(f) => onMockupChange?.(it.id, f)}
                  />
                </div>
              </div>
            )}

            {/* ── Jenis berukuran: jumlah per ukuran (per varian bila ada) ── */}
            {it.jenis_produksi && gridMode && (
              <RincianBlocks
                type={type}
                rincian={alignRincian(rincian, type, it)}
                disabled={disabled}
                onChange={(r) => setRincian(idx, r)}
              />
            )}

            {/* ── Jenis tanpa ukuran, atau item lama: satu angka ── */}
            {it.jenis_produksi && !gridMode && !(custom && !hasUkuran(type, it)) && (
              <div className="grid grid-cols-[6rem_1fr] gap-2 items-end">
                <div>
                  <label className={labelCls}>Jumlah</label>
                  <input
                    disabled={disabled}
                    type="number"
                    min={1}
                    inputMode="numeric"
                    className={`${inputCls} font-mono tabular-nums`}
                    value={it.jumlah || ""}
                    onChange={(e) => replace(idx, { ...it, jumlah: parseInt(e.target.value, 10) || 0 })}
                  />
                </div>
                {legacyHasUkuran && (
                  <div className="pb-2">
                    <button
                      type="button"
                      disabled={disabled}
                      onClick={() => replace(idx, { ...it, jumlah: 0, rincian: [emptyRincian(type, undefined, ukuranList(type, it))] })}
                      className="text-xs font-semibold text-[#124540] dark:text-[#49BFB4] disabled:opacity-40"
                    >
                      Rinci per ukuran
                    </button>
                  </div>
                )}
              </div>
            )}

            {it.jenis_produksi && (
              <div className="grid grid-cols-[1fr_auto] gap-3 items-end">
                <div>
                  <label className={labelCls}>Catatan item</label>
                  <input
                    disabled={disabled}
                    className={inputCls}
                    value={it.catatan ?? ""}
                    onChange={(e) => replace(idx, { ...it, catatan: e.target.value })}
                    placeholder={custom ? "Bahan, warna, bordir, dst. (opsional)" : "Warna, bahan, dst. (opsional)"}
                  />
                </div>
                <p className="pb-2 text-xs text-zinc-500 dark:text-zinc-400 whitespace-nowrap">
                  Subtotal:{" "}
                  <span className="font-mono tabular-nums font-semibold text-zinc-900 dark:text-zinc-100">{pcs(total)}</span> pcs
                </p>
              </div>
            )}
          </div>
        );
      })}

      <div className="flex items-center justify-between pt-1">
        <button
          type="button"
          disabled={disabled || allUsed}
          onClick={() => onChange([...items, { id: newItemId(), jenis_produksi: "", jumlah: 0 }])}
          className="flex items-center gap-1.5 text-xs font-semibold text-[#124540] dark:text-[#49BFB4] disabled:opacity-40 transition-colors duration-150"
        >
          <Plus className="w-3.5 h-3.5" /> {types.some((t) => t.is_active && isCustomType(t)) ? "Tambah jenis / pesanan umum" : "Tambah jenis produksi"}
        </button>
        <p className="text-xs text-zinc-500 dark:text-zinc-400">
          Total pesanan: <span className="font-mono tabular-nums font-semibold text-zinc-900 dark:text-zinc-100">{pcs(sumItems(items))}</span> pcs
        </p>
      </div>
    </div>
  );
}

// ─── Blok varian × ukuran ─────────────────────────────────────────────────────

function RincianBlocks({
  type,
  rincian,
  disabled,
  onChange,
}: {
  type: ProductionTypeData | undefined;
  rincian: ItemRincian[];
  disabled?: boolean;
  onChange: (r: ItemRincian[]) => void;
}) {
  const withVarian = hasVarian(type);
  const varianList = type?.varian ?? [];

  const patch = (idx: number, p: Partial<ItemRincian>) =>
    onChange(rincian.map((r, i) => (i === idx ? { ...r, ...p } : r)));

  const setQty = (idx: number, ukuran: string, jumlah: number) =>
    onChange(
      rincian.map((r, i) =>
        i === idx ? { ...r, ukuran: r.ukuran.map((u) => (u.ukuran === ukuran ? { ...u, jumlah } : u)) } : r,
      ),
    );

  // Varian biasa hanya boleh dipakai satu blok; "Lainnya" boleh berkali-kali (nama bebas).
  const takenElsewhere = (idx: number) =>
    new Set(rincian.filter((_, i) => i !== idx).map((r) => r.varian).filter((v) => v && v !== VARIAN_LAINNYA));
  const allVarianUsed = varianList.every(
    (v) => v === VARIAN_LAINNYA ? false : rincian.some((r) => r.varian === v),
  ) && !varianList.includes(VARIAN_LAINNYA);

  return (
    <div className="space-y-3">
      {rincian.map((r, idx) => (
        <div
          key={r.id}
          className="rounded-md border border-zinc-200 dark:border-zinc-800 bg-zinc-50 dark:bg-zinc-900/40 p-3 space-y-3"
        >
          {withVarian && (
            <div className="grid grid-cols-[1fr_auto] gap-2 items-end">
              <div className={`grid gap-2 ${r.varian === VARIAN_LAINNYA ? "grid-cols-1 sm:grid-cols-2" : "grid-cols-1"}`}>
                <div>
                  <label className={labelCls}>Varian</label>
                  <select
                    disabled={disabled}
                    className={inputCls}
                    value={r.varian ?? ""}
                    onChange={(e) => patch(idx, { varian: e.target.value || undefined, varian_lain: undefined })}
                  >
                    <option value="">Pilih varian…</option>
                    {varianList
                      .filter((v) => v === VARIAN_LAINNYA || !takenElsewhere(idx).has(v))
                      .map((v) => (
                        <option key={v} value={v}>
                          {v}
                        </option>
                      ))}
                  </select>
                </div>
                {r.varian === VARIAN_LAINNYA && (
                  <div>
                    <label className={labelCls}>Nama varian</label>
                    <input
                      disabled={disabled}
                      className={inputCls}
                      value={r.varian_lain ?? ""}
                      onChange={(e) => patch(idx, { varian_lain: e.target.value })}
                      placeholder="mis. Hijau, Cokelat"
                    />
                  </div>
                )}
              </div>
              <button
                type="button"
                disabled={disabled || rincian.length <= 1}
                onClick={() => onChange(rincian.filter((_, i) => i !== idx))}
                className="p-2 mb-0.5 rounded-md text-zinc-400 hover:text-red-600 dark:hover:text-red-400 disabled:opacity-30 disabled:hover:text-zinc-400 transition-colors duration-150"
                aria-label="Hapus varian"
                title="Hapus varian"
              >
                <Trash2 className="w-4 h-4" />
              </button>
            </div>
          )}

          <div>
            <div className="flex items-center justify-between mb-1.5">
              <p className={`${labelCls} mb-0`}>Jumlah per ukuran</p>
              <p className="text-[11px] text-zinc-500 dark:text-zinc-400">
                {withVarian ? "Total varian: " : "Total: "}
                <span className="font-mono tabular-nums font-semibold text-zinc-900 dark:text-zinc-100">{pcs(sumUkuran(r.ukuran))}</span> pcs
              </p>
            </div>
            <div className="grid grid-cols-4 sm:grid-cols-6 md:grid-cols-8 lg:grid-cols-10 gap-2">
              {r.ukuran.map((u) => (
                <label key={u.ukuran} className="block">
                  <span className="block text-center text-[11px] font-mono tabular-nums font-semibold text-zinc-600 dark:text-zinc-300 mb-0.5">
                    {u.ukuran}
                  </span>
                  <input
                    disabled={disabled}
                    type="number"
                    min={0}
                    inputMode="numeric"
                    aria-label={`Jumlah ukuran ${u.ukuran}`}
                    className={`${inputCls} px-1.5 text-center font-mono tabular-nums`}
                    value={u.jumlah || ""}
                    onChange={(e) => setQty(idx, u.ukuran, Math.max(0, parseInt(e.target.value, 10) || 0))}
                  />
                </label>
              ))}
            </div>
          </div>
        </div>
      ))}

      {withVarian && (
        <button
          type="button"
          disabled={disabled || allVarianUsed}
          onClick={() => onChange([...rincian, emptyRincian(type)])}
          className="flex items-center gap-1.5 text-xs font-semibold text-[#124540] dark:text-[#49BFB4] disabled:opacity-40 transition-colors duration-150"
        >
          <Plus className="w-3.5 h-3.5" /> Tambah varian
        </button>
      )}
    </div>
  );
}

// ─── Mockup pesanan umum ──────────────────────────────────────────────────────

function MockupField({
  existingUrl,
  file,
  onChange,
  disabled,
}: {
  existingUrl?: string;
  file: File | null;
  onChange: (f: File | null) => void;
  disabled?: boolean;
}) {
  const preview = useMemo(() => (file ? URL.createObjectURL(file) : null), [file]);
  useEffect(() => () => { if (preview) URL.revokeObjectURL(preview); }, [preview]);
  const src = preview ?? existingUrl ?? null;

  return (
    <div>
      <label className={labelCls}>Mockup desain *</label>
      <div className="flex items-start gap-3">
        <div className="w-28 h-28 shrink-0 rounded-md border border-dashed border-zinc-300 dark:border-zinc-700 bg-zinc-50 dark:bg-zinc-900/40 flex items-center justify-center overflow-hidden">
          {src ? (
            // eslint-disable-next-line @next/next/no-img-element
            <img src={src} alt="Mockup" className="max-w-full max-h-full object-contain" />
          ) : (
            <ImagePlus className="w-6 h-6 text-zinc-300 dark:text-zinc-600" />
          )}
        </div>
        <div className="min-w-0 space-y-1.5">
          <input
            type="file"
            accept="image/*"
            disabled={disabled}
            onChange={(e) => onChange(e.target.files?.[0] ?? null)}
            className="block w-full text-xs text-zinc-600 dark:text-zinc-300 file:mr-3 file:rounded-md file:border-0 file:bg-[#124540] file:px-3 file:py-2 file:text-xs file:font-semibold file:text-white hover:file:bg-[#0d332f]"
          />
          <p className="text-[11px] text-zinc-400 dark:text-zinc-500">
            Gambar JPG/PNG. Otomatis dikecilkan saat diupload (tetap tajam untuk cetak). Dilihat tim produksi dan tampil di Form Approval.
            {existingUrl && !file ? " Pilih gambar baru untuk mengganti." : ""}
          </p>
        </div>
      </div>
    </div>
  );
}
