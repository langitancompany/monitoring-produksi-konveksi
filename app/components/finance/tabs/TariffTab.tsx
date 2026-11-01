// app/components/finance/tabs/TariffTab.tsx
//
// Daftar harga: harga jual per KELOMPOK UKURAN untuk tiap jenis produksi, ditambah biaya tambahan menurut
// nama varian (mis. lengan panjang +Rp5.000, rib +Rp3.000). Dipakai saat menerbitkan tagihan: item yang
// punya rincian ukuran dihitung otomatis dari sini; jenis yang belum diisi tetap memakai satu harga per item.
// Semua orang berhak Keuangan boleh melihat; hanya yang berhak menyetujui (approver) boleh mengubah.
// Aturan hitung resmi ada di database (fin_item_lines, migration 021) — layar ini hanya mengatur datanya.
"use client";

import React, { useMemo, useState } from "react";
import { Plus, Trash2 } from "lucide-react";
import { useDialog } from "@/app/components/ui/DialogProvider";
import { errMsg } from "@/hooks/useFinanceApi";
import { useTariff } from "@/hooks/useTariff";
import type { ProductionTypeData } from "@/types/order";
import { parseSizes, sizesText, type Tariff } from "@/lib/finance/tariff";
import { CurrencyInput } from "../CurrencyInput";
import { formatRupiah } from "../utils";
import { cardCls, sectionLabelCls, inputCls, labelCls, PrimaryButton, GhostButton, smallGhostBtnCls } from "../ui";

interface TierDraft {
  key: string;
  varian: string;
  label: string;
  ukuran: string;
  harga: number;
}
interface AddonDraft {
  key: string;
  keyword: string;
  label: string;
  tambahan: number;
}

let seq = 0;
const nextKey = () => `d${++seq}`;

const HURUF_GROUPS: [string, string][] = [
  ["S & M", "S, M"],
  ["L & XL", "L, XL"],
  ["XXL", "XXL"],
  ["3XL", "3XL"],
  ["4XL", "4XL"],
  ["5XL", "5XL"],
];
const ANGKA_GROUPS: [string, string][] = [
  ["21–25", "21-25"],
  ["26–30", "26-30"],
  ["31–35", "31-35"],
  ["36–40", "36-40"],
  ["41–45", "41-45"],
];

function draftsFor(tariff: Tariff, jenis: string): { tiers: TierDraft[]; addons: AddonDraft[] } {
  return {
    tiers: tariff.tiers
      .filter((t) => t.jenis_produksi === jenis)
      .map((t) => ({ key: nextKey(), varian: t.varian ?? "", label: t.label, ukuran: sizesText(t.ukuran), harga: t.harga })),
    addons: tariff.addons
      .filter((a) => a.jenis_produksi === jenis)
      .map((a) => ({ key: nextKey(), keyword: a.keyword, label: a.label, tambahan: a.tambahan })),
  };
}

export default function TariffTab({
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

  const configured = (v: string) => tariff.tiers.some((t) => t.jenis_produksi === v && t.harga > 0);

  return (
    <div className="space-y-4">
      <div className={`${cardCls} p-4 space-y-2`}>
        <p className={sectionLabelCls}>Cara kerja</p>
        <ul className="text-xs text-zinc-600 dark:text-zinc-300 space-y-1 list-disc pl-4 leading-relaxed">
          <li>Harga dibedakan per <b>kelompok ukuran</b> (mis. S &amp; M satu harga, L &amp; XL satu harga, XXL sendiri).</li>
          <li>
            <b>Biaya tambahan</b> ditambahkan ke harga bila <i>nama varian</i> memuat kata kuncinya. Contoh: kata kunci
            &quot;lengan panjang&quot; +Rp5.000 dan &quot;rib&quot; +Rp3.000 → varian &quot;Lengan Panjang Rib&quot; = +Rp8.000.
            Varian dibuat di Pengaturan → Jenis Produksi.
          </li>
          <li>
            Jenis yang belum punya harga terisi tetap ditagih dengan satu harga per item. Setelah harga terisi, ukuran yang
            belum masuk kelompok mana pun akan ditolak saat menerbitkan tagihan.
          </li>
          <li>Tagihan yang sudah terbit tidak berubah; perubahan harga berlaku untuk tagihan/revisi berikutnya.</li>
        </ul>
        {migrationMissing && (
          <p className="text-xs text-amber-600 dark:text-amber-400">
            Tabel daftar harga belum ada. Jalankan migration 021 di SQL Editor Supabase, lalu muat ulang.
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
  const initial = useMemo(() => draftsFor(tariff, type.value), [tariff, type.value]);
  const [tiers, setTiers] = useState<TierDraft[]>(initial.tiers);
  const [addons, setAddons] = useState<AddonDraft[]>(initial.addons);
  const [saving, setSaving] = useState(false);

  const patchTier = (key: string, p: Partial<TierDraft>) => setTiers((l) => l.map((t) => (t.key === key ? { ...t, ...p } : t)));
  const patchAddon = (key: string, p: Partial<AddonDraft>) => setAddons((l) => l.map((a) => (a.key === key ? { ...a, ...p } : a)));

  const ukuranJenis = type.ukuran ?? [];
  const isCelana = type.value === "celana_sekolah" || (ukuranJenis.length > 0 && ukuranJenis.every((u) => /^\d+$/.test(u.trim())));
  const preset = isCelana ? ANGKA_GROUPS : HURUF_GROUPS;

  const fillPreset = () =>
    setTiers((cur) => [
      ...cur,
      ...preset
        .filter(([label]) => !cur.some((t) => !t.varian.trim() && t.label === label))
        .map(([label, ukuran]) => ({ key: nextKey(), varian: "", label, ukuran, harga: 0 })),
    ]);

  // Ukuran jenis ini (Pengaturan → Jenis Produksi) yang belum masuk kelompok umum — pengingat saja.
  const covered = useMemo(() => {
    const s = new Set<string>();
    for (const t of tiers) if (!t.varian.trim()) parseSizes(t.ukuran).forEach((u) => s.add(u));
    return s;
  }, [tiers]);
  const uncovered = (type.ukuran ?? []).filter((u) => !covered.has(u.trim().toUpperCase()));

  const onSave = async () => {
    setSaving(true);
    try {
      await save({
        jenis_produksi: type.value,
        tiers: tiers.map((t) => ({
          varian: t.varian.trim() || null,
          label: t.label.trim(),
          ukuran: parseSizes(t.ukuran),
          harga: t.harga,
        })),
        addons: addons.map((a) => ({ keyword: a.keyword.trim(), label: a.label.trim() || a.keyword.trim(), tambahan: a.tambahan })),
      });
      notify("Daftar harga disimpan.", { type: "success", title: "Berhasil" });
    } catch (e) {
      notify(errMsg(e), { title: "Gagal menyimpan daftar harga" });
    } finally {
      setSaving(false);
    }
  };

  const disabled = !canEdit || saving;

  return (
    <div className="space-y-4">
      <div className={`${cardCls} p-4 space-y-3`}>
        <div className="flex items-center justify-between gap-2">
          <p className={sectionLabelCls}>Harga per kelompok ukuran — {type.name}</p>
          {canEdit && (
            <button type="button" onClick={fillPreset} className={smallGhostBtnCls}>
              + Kelompok {isCelana ? "per kelipatan 5" : "baku (S&M, L&XL, XXL, …)"}
            </button>
          )}
        </div>

        {tiers.length === 0 && <p className="text-xs text-zinc-400">Belum ada kelompok.</p>}

        <div className="space-y-3">
          {tiers.map((t) => (
            <div
              key={t.key}
              className="grid grid-cols-1 sm:grid-cols-[1fr_1.4fr_1fr_1.1fr_auto] gap-2 items-end rounded-md border border-zinc-100 dark:border-zinc-900 p-2.5"
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
                  value={t.varian}
                  disabled={disabled}
                  maxLength={60}
                  placeholder="mis. Panjang"
                  onChange={(e) => patchTier(t.key, { varian: e.target.value })}
                />
              </div>
              <div>
                <span className={labelCls}>Harga / pcs</span>
                <CurrencyInput
                  compact
                  label="Harga per pcs"
                  ariaLabel={`Harga kelompok ${t.label || "baru"}`}
                  value={t.harga}
                  readOnly={disabled}
                  onChange={(v) => patchTier(t.key, { harga: v })}
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
            onClick={() => setTiers((l) => [...l, { key: nextKey(), varian: "", label: "", ukuran: "", harga: 0 }])}
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
          Harga Rp0 = belum diatur. Satu ukuran hanya boleh di satu kelompok. Kelompok khusus varian didahulukan dari kelompok
          umum (misalnya celana panjang vs pendek bila dibuat sebagai varian).
        </p>
      </div>

      <div className={`${cardCls} p-4 space-y-3`}>
        <p className={sectionLabelCls}>Biaya tambahan menurut varian — {type.name}</p>
        {addons.length === 0 && <p className="text-xs text-zinc-400">Tidak ada biaya tambahan.</p>}
        <div className="space-y-3">
          {addons.map((a) => (
            <div
              key={a.key}
              className="grid grid-cols-1 sm:grid-cols-[1.2fr_1.2fr_1.1fr_auto] gap-2 items-end rounded-md border border-zinc-100 dark:border-zinc-900 p-2.5"
            >
              <div>
                <span className={labelCls}>Kata kunci di nama varian</span>
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
        {canEdit && (
          <button
            type="button"
            onClick={() => setAddons((l) => [...l, { key: nextKey(), keyword: "", label: "", tambahan: 0 }])}
            className={smallGhostBtnCls}
          >
            <Plus size={12} /> Tambah biaya
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
            Simpan daftar harga
          </PrimaryButton>
        </div>
      ) : (
        <p className="text-xs text-zinc-500 dark:text-zinc-400">
          Hanya pengguna dengan hak menyetujui di menu Keuangan yang dapat mengubah daftar harga.
        </p>
      )}
    </div>
  );
}
