// app/components/apps/ConfigTariffPanel.tsx
//
// Tab "Harga" di menu Config Harga. Mengatur KELOMPOK UKURAN tiap jenis produksi (mis. S & M, L & XL, XXL) dan
// BIAYA TAMBAHAN menurut nama varian (mis. lengan panjang +Rp5.000, rib +Rp3.000).
// HARGA kelompok TIDAK diisi di sini: harga bisa beda tiap pesanan, jadi diisi saat menerbitkan tagihan
// (Keuangan → Tagihan). Biaya tambahan tetap dari sini dan ditambahkan otomatis ke harga yang diisi di tagihan.
// Hak akses mengikuti menu Config Harga: Lihat = melihat pengaturan, Edit = mengubahnya.
// Aturan hitung resmi ada di database (fin_item_lines, migration 022) — layar ini hanya mengatur datanya.
"use client";

import React, { useMemo, useState } from "react";
import { Plus, Trash2 } from "lucide-react";
import { useDialog } from "@/app/components/ui/DialogProvider";
import { errMsg } from "@/hooks/useFinanceApi";
import { useTariff } from "@/hooks/useTariff";
import type { ProductionTypeData } from "@/types/order";
import {
  deriveAddonKeywords, keywordMatchesVarian, parseSizes, sizesText, suggestTiers, type Tariff,
} from "@/lib/finance/tariff";
import { CurrencyInput } from "@/app/components/finance/CurrencyInput";
import { formatRupiah } from "@/app/components/finance/utils";
import {
  cardCls, sectionLabelCls, inputCls, labelCls, PrimaryButton, GhostButton, smallGhostBtnCls,
} from "@/app/components/finance/ui";

interface TierDraft {
  key: string;
  varian: string;
  label: string;
  ukuran: string;
}
interface AddonDraft {
  key: string;
  keyword: string;
  label: string;
  tambahan: number;
  /** baris ini ditambahkan otomatis dari varian jenis produksi dan belum disimpan */
  auto?: boolean;
}

let seq = 0;
const nextKey = () => `d${++seq}`;

function draftsFor(tariff: Tariff, type: ProductionTypeData): { tiers: TierDraft[]; addons: AddonDraft[]; fromJenis: boolean } {
  const savedAddons = tariff.addons.filter((a) => a.jenis_produksi === type.value);
  // Setiap varian jenis ini otomatis punya baris biaya tambahan (nominal 0 sampai Anda isi).
  const derived = deriveAddonKeywords(type.varian ?? [], savedAddons.map((a) => a.keyword));
  const jenis = type.value;
  // Jenis yang belum pernah diatur: kelompok langsung diusulkan dari ukuran di Pengaturan → Jenis Produksi (belum tersimpan).
  const saved = tariff.tiers.some((t) => t.jenis_produksi === jenis);
  const fromJenis = !saved && (type.ukuran?.length ?? 0) > 0;
  return {
    fromJenis,
    tiers: fromJenis
      ? suggestTiers(type.ukuran ?? []).map((g) => ({ key: nextKey(), varian: "", label: g.label, ukuran: sizesText(g.ukuran) }))
      : tariff.tiers
      .filter((t) => t.jenis_produksi === jenis)
      .map((t) => ({ key: nextKey(), varian: t.varian ?? "", label: t.label, ukuran: sizesText(t.ukuran) })),
    addons: [
      ...savedAddons.map((a) => ({ key: nextKey(), keyword: a.keyword, label: a.label, tambahan: a.tambahan })),
      ...derived.map((d) => ({ key: nextKey(), keyword: d.keyword, label: d.label, tambahan: 0, auto: true })),
    ],
  };
}

export default function ConfigTariffPanel({
  productionTypes,
  canEdit,
}: {
  productionTypes: ProductionTypeData[];
  canEdit: boolean;
}) {
  const { tariff, error, migrationMissing, save } = useTariff();
  const jenisList = useMemo(
    () => productionTypes.filter((p) => p.kategori === "utama" && !p.is_custom && p.is_active !== false),
    [productionTypes],
  );
  const [jenis, setJenis] = useState<string>("");
  const selected = jenis || jenisList[0]?.value || "";

  if (error) return <p className="text-xs text-red-600 dark:text-red-400">{error}</p>;
  if (!tariff) return <p className="text-xs text-zinc-500 dark:text-zinc-400">Memuat…</p>;

  const configured = (v: string) => tariff.tiers.some((t) => t.jenis_produksi === v);

  return (
    <div className="space-y-4">
      <div className={`${cardCls} p-4 space-y-2`}>
        <p className={sectionLabelCls}>Cara kerja</p>
        <ul className="text-xs text-zinc-600 dark:text-zinc-300 space-y-1 list-disc pl-4 leading-relaxed">
          <li>
            Di sini hanya mengatur <b>kelompok ukuran</b> (mis. S &amp; M, L &amp; XL, XXL) dan <b>biaya tambahan</b> varian.
            <b> Harga tidak diisi di sini</b> — harga tiap kelompok diisi saat <b>menerbitkan tagihan</b>, jadi setiap pesanan
            boleh berbeda harga walau kelompok ukurannya sama.
          </li>
          <li>
            <b>Biaya tambahan</b> ditambahkan ke harga yang diisi di tagihan bila <i>nama varian</i> memuat kata kuncinya. Contoh:
            kata kunci &quot;lengan panjang&quot; +Rp5.000 dan &quot;rib&quot; +Rp3.000 → varian &quot;Lengan Panjang Rib&quot; = +Rp8.000.
            Yang dihitung hanya <b>Varian 1</b> (Panjang, Pendek, 1/3, dst.) dari Pengaturan → Jenis Produksi; <b>warna</b> tidak memengaruhi harga.
          </li>
          <li>
            Setiap jenis produksi utama yang Anda buat di Pengaturan → Jenis Produksi otomatis muncul di sini; ukuran dan
            variannya terbaca langsung, dan kelompok awalnya diusulkan dari ukuran tersebut.
          </li>
          <li>
            Jenis yang belum punya kelompok tetap ditagih dengan satu harga per item. Setelah kelompok dibuat, ukuran yang
            belum masuk kelompok mana pun akan ditolak saat menerbitkan tagihan.
          </li>
          <li>Tagihan yang sudah terbit tidak berubah; perubahan kelompok atau biaya tambahan berlaku untuk tagihan/revisi berikutnya.</li>
        </ul>
        {migrationMissing && (
          <p className="text-xs text-amber-600 dark:text-amber-400">
            Tabel pengaturan harga belum ada atau belum diperbarui. Jalankan migration 021 lalu 022 di SQL Editor Supabase, lalu muat ulang.
          </p>
        )}
      </div>

      <div className="flex gap-2 overflow-x-auto [scrollbar-width:none] [&::-webkit-scrollbar]:hidden">
        {jenisList.map((p) => (
          <button
            key={p.value}
            type="button"
            onClick={() => setJenis(p.value)}
            className={`text-xs font-semibold px-3 py-1.5 rounded-full border whitespace-nowrap transition-colors duration-150 ${
              selected === p.value
                ? "bg-[#124540] text-white border-[#124540]"
                : "bg-white dark:bg-zinc-950 border-zinc-200 dark:border-zinc-800 text-zinc-600 dark:text-zinc-400 hover:border-zinc-400 dark:hover:border-zinc-600"
            }`}
          >
            {p.name}
            <span className={`ml-1.5 text-[10px] ${configured(p.value) ? "opacity-80" : "opacity-50"}`}>
              {configured(p.value) ? "✓" : "belum diatur"}
            </span>
          </button>
        ))}
      </div>

      {selected && (
        <JenisEditor
          key={selected}
          type={jenisList.find((p) => p.value === selected)!}
          tariff={tariff}
          canEdit={canEdit}
          save={save}
        />
      )}
    </div>
  );
}

function JenisEditor({
  type,
  tariff,
  canEdit,
  save,
}: {
  type: ProductionTypeData;
  tariff: Tariff;
  canEdit: boolean;
  save: ReturnType<typeof useTariff>["save"];
}) {
  const { notify } = useDialog();
  const initial = useMemo(() => draftsFor(tariff, type), [tariff, type.value]);
  const [tiers, setTiers] = useState<TierDraft[]>(initial.tiers);
  const [addons, setAddons] = useState<AddonDraft[]>(initial.addons);
  const [saving, setSaving] = useState(false);

  const patchTier = (key: string, p: Partial<TierDraft>) => setTiers((l) => l.map((t) => (t.key === key ? { ...t, ...p } : t)));
  const patchAddon = (key: string, p: Partial<AddonDraft>) => setAddons((l) => l.map((a) => (a.key === key ? { ...a, ...p } : a)));

  const ukuranJenis = type.ukuran ?? [];
  const varianJenis = (type.varian ?? []).filter((v) => v.trim());

  // Ukuran jenis ini (Pengaturan → Jenis Produksi) yang belum masuk kelompok umum — pengingat saja.
  const covered = useMemo(() => {
    const s = new Set<string>();
    for (const t of tiers) if (!t.varian.trim()) parseSizes(t.ukuran).forEach((u) => s.add(u));
    return s;
  }, [tiers]);
  const uncovered = (type.ukuran ?? []).filter((u) => !covered.has(u.trim().toUpperCase()));

  // Sinkron dengan Pengaturan → Jenis Produksi: tambahkan kelompok untuk ukuran yang belum tercakup.
  const syncSizes = () =>
    setTiers((cur) => [
      ...cur,
      ...suggestTiers(uncovered).map((g) => ({ key: nextKey(), varian: "", label: g.label, ukuran: sizesText(g.ukuran) })),
    ]);

  const onSave = async () => {
    setSaving(true);
    try {
      await save({
        jenis_produksi: type.value,
        tiers: tiers.map((t) => ({
          varian: t.varian.trim() || null,
          label: t.label.trim(),
          ukuran: parseSizes(t.ukuran),
        })),
        addons: addons.map((a) => ({ keyword: a.keyword.trim(), label: a.label.trim() || a.keyword.trim(), tambahan: a.tambahan })),
      });
      notify("Pengaturan kelompok & biaya tambahan disimpan.", { type: "success", title: "Berhasil" });
    } catch (e) {
      notify(errMsg(e), { title: "Gagal menyimpan pengaturan" });
    } finally {
      setSaving(false);
    }
  };

  const disabled = !canEdit || saving;

  return (
    <div className="space-y-4">
      <div className={`${cardCls} p-4 space-y-3`}>
        <div className="flex items-center justify-between gap-2">
          <p className={sectionLabelCls}>Kelompok ukuran — {type.name}</p>
          {canEdit && uncovered.length > 0 && (
            <button type="button" onClick={syncSizes} className={smallGhostBtnCls}>
              + Sinkronkan {uncovered.length} ukuran dari Jenis Produksi
            </button>
          )}
        </div>

        <p className="text-[11px] text-zinc-500 dark:text-zinc-400 leading-relaxed">
          Dari Pengaturan → Jenis Produksi — Ukuran: {ukuranJenis.length ? ukuranJenis.join(", ") : "belum diisi"}
          {varianJenis.length > 0 && <> · Varian 1: {varianJenis.join(", ")}</>}
          {(type.varian_warna ?? []).length > 0 && <> · Warna: {(type.varian_warna ?? []).join(", ")} (tidak memengaruhi harga)</>}
        </p>
        {initial.fromJenis && tiers.length > 0 && (
          <p className="text-[11px] text-emerald-700 dark:text-emerald-400">
            Kelompok di bawah diusulkan otomatis dari ukuran jenis ini. Periksa, ubah bila perlu, lalu simpan.
          </p>
        )}
        {tiers.length === 0 && <p className="text-xs text-zinc-400">Belum ada kelompok.</p>}

        <datalist id={`varian-${type.value}`}>
          {varianJenis.map((v) => (
            <option key={v} value={v} />
          ))}
        </datalist>

        <div className="space-y-3">
          {tiers.map((t) => (
            <div
              key={t.key}
              className="grid grid-cols-1 sm:grid-cols-[1fr_1.4fr_1fr_auto] gap-2 items-end rounded-md border border-zinc-100 dark:border-zinc-900 p-2.5"
            >
              <div>
                <span className={labelCls}>Kelompok</span>
                <input
                  className={inputCls}
                  value={t.label}
                  disabled={disabled}
                  maxLength={40}
                  placeholder="mis. S & M"
                  onChange={(e) => patchTier(t.key, { label: e.target.value })}
                />
              </div>
              <div>
                <span className={labelCls}>Ukuran</span>
                <input
                  className={inputCls}
                  value={t.ukuran}
                  disabled={disabled}
                  placeholder="S, M  atau  21-25"
                  onChange={(e) => patchTier(t.key, { ukuran: e.target.value })}
                />
              </div>
              <div>
                <span className={labelCls}>Hanya varian (opsional)</span>
                <input
                  className={inputCls}
                  list={`varian-${type.value}`}
                  value={t.varian}
                  disabled={disabled}
                  maxLength={60}
                  placeholder={varianJenis[0] ? `mis. ${varianJenis[0]}` : "mis. Panjang"}
                  onChange={(e) => patchTier(t.key, { varian: e.target.value })}
                />
              </div>
              {canEdit && (
                <button
                  type="button"
                  aria-label={`Hapus kelompok ${t.label}`}
                  onClick={() => setTiers((l) => l.filter((x) => x.key !== t.key))}
                  className="p-2 text-zinc-400 hover:text-red-600 transition-colors duration-150"
                >
                  <Trash2 size={15} />
                </button>
              )}
            </div>
          ))}
        </div>

        {canEdit && (
          <button
            type="button"
            onClick={() => setTiers((l) => [...l, { key: nextKey(), varian: "", label: "", ukuran: "" }])}
            className={smallGhostBtnCls}
          >
            <Plus size={12} /> Tambah kelompok
          </button>
        )}

        {uncovered.length > 0 && tiers.length > 0 && (
          <p className="text-[11px] text-amber-600 dark:text-amber-400">
            Ukuran {uncovered.join(", ")} (dari Pengaturan → Jenis Produksi) belum masuk kelompok umum. Bila dipesan, tagihan
            akan ditolak sampai kelompoknya dibuat.
          </p>
        )}
        <p className="text-[10px] text-zinc-400">
          Satu ukuran hanya boleh di satu kelompok. Kelompok khusus varian didahulukan dari kelompok umum (misalnya celana
          panjang vs pendek bila dibuat sebagai varian). Harga tiap kelompok diisi di form tagihan.
        </p>
      </div>

      <div className={`${cardCls} p-4 space-y-3`}>
        <p className={sectionLabelCls}>Biaya tambahan menurut varian (harga tetap) — {type.name}</p>
        {addons.length === 0 && <p className="text-xs text-zinc-400">Tidak ada biaya tambahan.</p>}
        <div className="space-y-3">
          {addons.map((a) => (
            <div
              key={a.key}
              className="grid grid-cols-1 sm:grid-cols-[1.2fr_1.2fr_1.1fr_auto] gap-2 items-end rounded-md border border-zinc-100 dark:border-zinc-900 p-2.5"
            >
              <div>
                <span className={labelCls}>
                  Kata kunci di nama varian
                  {a.auto && <span className="ml-1.5 normal-case tracking-normal text-emerald-700 dark:text-emerald-400">· dari varian</span>}
                </span>
                <input
                  className={inputCls}
                  value={a.keyword}
                  disabled={disabled}
                  maxLength={40}
                  placeholder="mis. lengan panjang"
                  onChange={(e) => patchAddon(a.key, { keyword: e.target.value })}
                />
              </div>
              <div>
                <span className={labelCls}>Nama biaya</span>
                <input
                  className={inputCls}
                  value={a.label}
                  disabled={disabled}
                  maxLength={40}
                  placeholder="mis. Lengan panjang"
                  onChange={(e) => patchAddon(a.key, { label: e.target.value })}
                />
              </div>
              <div>
                <span className={labelCls}>Tambahan / pcs (semua ukuran)</span>
                <CurrencyInput
                  compact
                  label="Tambahan per pcs"
                  ariaLabel={`Tambahan ${a.label || "baru"}`}
                  value={a.tambahan}
                  readOnly={disabled}
                  onChange={(v) => patchAddon(a.key, { tambahan: v })}
                />
              </div>
              {canEdit && (
                <button
                  type="button"
                  aria-label={`Hapus biaya ${a.label}`}
                  onClick={() => setAddons((l) => l.filter((x) => x.key !== a.key))}
                  className="p-2 text-zinc-400 hover:text-red-600 transition-colors duration-150"
                >
                  <Trash2 size={15} />
                </button>
              )}
            </div>
          ))}
        </div>
        {varianJenis.length > 0 && addons.some((a) => a.keyword.trim() && !keywordMatchesVarian(a.keyword, varianJenis)) && (
          <p className="text-[11px] text-amber-600 dark:text-amber-400">
            Kata kunci {addons.filter((a) => a.keyword.trim() && !keywordMatchesVarian(a.keyword, varianJenis)).map((a) => `"${a.keyword.trim()}"`).join(", ")}{" "}
            tidak cocok dengan varian mana pun di Jenis Produksi ({varianJenis.join(", ")}), jadi tambahannya tidak akan pernah terpakai.
            Samakan dengan nama varian.
          </p>
        )}
        {addons.some((a) => a.auto) && (
          <p className="text-[11px] text-emerald-700 dark:text-emerald-400">
            Baris bertanda &quot;dari varian&quot; ditambahkan otomatis dari varian jenis ini (Pengaturan → Jenis Produksi). Isi nominalnya
            (0 bila tidak ada tambahan), lalu simpan.
          </p>
        )}
        {canEdit && (
          <button
            type="button"
            onClick={() => setAddons((l) => [...l, { key: nextKey(), keyword: "", label: "", tambahan: 0 }])}
            className={smallGhostBtnCls}
          >
            <Plus size={12} /> Tambah biaya lain
          </button>
        )}
        {addons.some((a) => a.keyword.trim() && a.tambahan > 0) && (
          <p className="text-[10px] text-zinc-400">
            Contoh: varian yang namanya memuat{" "}
            {addons
              .filter((a) => a.keyword.trim() && a.tambahan > 0)
              .map((a) => `"${a.keyword.trim()}" (+${formatRupiah(a.tambahan)})`)
              .join(" dan ")}{" "}
            dikenai tambahan tersebut; bila memuat lebih dari satu kata kunci, tambahannya dijumlahkan.
          </p>
        )}
      </div>

      {canEdit ? (
        <div className="flex gap-2">
          <GhostButton onClick={() => { setTiers(initial.tiers); setAddons(initial.addons); }} disabled={saving}>
            Batalkan perubahan
          </GhostButton>
          <PrimaryButton onClick={onSave} loading={saving}>
            Simpan pengaturan
          </PrimaryButton>
        </div>
      ) : (
        <p className="text-xs text-zinc-500 dark:text-zinc-400">
          Anda hanya bisa melihat pengaturan ini (tanpa izin edit di Config Harga).
        </p>
      )}
    </div>
  );
}
