// app/components/finance/InvoiceSettingsCard.tsx
//
// Pengaturan TAMPILAN invoice pelanggan (kop, rekening pembayaran, tanda tangan) + pratinjau langsung.
// Hanya supervisor yang boleh mengubah (server menolak yang lain); perubahan dicatat di log audit tanpa gambar.
// Tidak mengubah aturan uang apa pun — hanya cara dokumen invoice ditampilkan.
"use client";

import React, { useState } from "react";
import { Plus, Trash2, Upload } from "lucide-react";
import { useDialog } from "@/app/components/ui/DialogProvider";
import { errMsg } from "@/hooks/useFinanceApi";
import { useInvoiceSettings } from "@/hooks/useInvoiceSettings";
import { buildSampleInvoiceModel } from "@/lib/finance/invoiceDoc";
import {
  HEADER_SPEC, MAX_ACCOUNTS, MAX_HEADER_DATAURL, MAX_SIGNATURE_DATAURL, SIGNATURE_SPEC,
  type InvoiceBankAccount, type InvoiceSettings,
} from "@/lib/finance/invoiceSettings";
import { fileToDataUrl } from "@/lib/finance/imageUtil";
import InvoiceDocument from "./InvoiceDocument";
import ScaledDoc from "./ScaledDoc";
import { Field, inputCls, PrimaryButton, GhostButton, cardCls, sectionLabelCls } from "./ui";

export default function InvoiceSettingsCard() {
  const { notify } = useDialog();
  const { settings, loaded, error, save } = useInvoiceSettings();
  // null = belum ada perubahan; selama null isi mengikuti data server.
  const [draft, setDraft] = useState<InvoiceSettings | null>(null);
  const [saving, setSaving] = useState(false);
  const [sampleLunas, setSampleLunas] = useState(false);

  const current = draft ?? settings;
  const set = <K extends keyof InvoiceSettings>(key: K, value: InvoiceSettings[K]) => {
    if (current) setDraft({ ...current, [key]: value });
  };

  const setAccount = (i: number, patch: Partial<InvoiceBankAccount>) => {
    if (!current) return;
    set("accounts", current.accounts.map((a, idx) => (idx === i ? { ...a, ...patch } : a)));
  };

  const pickImage = async (file: File | undefined, key: "header_image" | "signature_image") => {
    if (!file) return;
    try {
      const isHeader = key === "header_image";
      set(
        key,
        await fileToDataUrl(file, {
          maxWidth: isHeader ? HEADER_SPEC.pxW : SIGNATURE_SPEC.pxW,
          maxChars: isHeader ? MAX_HEADER_DATAURL : MAX_SIGNATURE_DATAURL,
        }),
      );
    } catch (e) {
      notify(errMsg(e), { title: "Gambar tidak dapat dipakai" });
    }
  };

  const onSave = async () => {
    if (!draft) return;
    setSaving(true);
    try {
      await save(draft);
      setDraft(null);
      notify("Pengaturan invoice disimpan.", { type: "success", title: "Berhasil" });
    } catch (e) {
      notify(errMsg(e), { title: "Gagal menyimpan" });
    } finally {
      setSaving(false);
    }
  };

  if (!current) return <div className={`${cardCls} p-4 md:col-span-2 text-xs text-zinc-500`}>Memuat pengaturan invoice…</div>;

  const fileBtn =
    "inline-flex items-center gap-1.5 text-[11px] font-semibold px-2.5 py-1.5 rounded-md border border-zinc-200 dark:border-zinc-800 text-zinc-700 dark:text-zinc-300 hover:bg-zinc-50 dark:hover:bg-zinc-900 cursor-pointer transition-colors duration-150";

  return (
    <div className={`${cardCls} p-4 md:p-5 md:col-span-2 space-y-5`}>
      <div>
        <p className={sectionLabelCls}>Tampilan invoice pelanggan</p>
        <p className="text-[11px] text-zinc-500 dark:text-zinc-400 mt-1">
          Kop, rekening pembayaran, dan tanda tangan pada invoice yang dikirim ke pelanggan (tombol Invoice di rincian
          pesanan). Perubahan tercatat di log audit.
        </p>
      </div>

      {error && <p className="text-xs text-red-600 dark:text-red-400">{error} — menampilkan nilai bawaan; simpan dinonaktifkan.</p>}

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-5">
        <div className="space-y-4">
          <Field label="Nama usaha" required>
            <input value={current.store_name} onChange={(e) => set("store_name", e.target.value)} maxLength={120} className={inputCls} />
          </Field>
          <Field label="Alamat" hint="Tampil di kop teks bila gambar kop belum diunggah.">
            <input value={current.store_address} onChange={(e) => set("store_address", e.target.value)} maxLength={250} className={inputCls} />
          </Field>

          <Field
            label="Gambar kop (opsional)"
            hint={`Memanjang, sekitar ${HEADER_SPEC.widthMm}×${HEADER_SPEC.heightMm} mm. PNG, JPG, atau WebP; dikecilkan otomatis.`}
          >
            <div className="flex flex-wrap items-center gap-2">
              <label className={fileBtn}>
                <Upload className="w-3.5 h-3.5" /> {current.header_image ? "Ganti kop" : "Unggah kop"}
                <input type="file" accept="image/png,image/jpeg,image/webp" className="hidden" onChange={(e) => { void pickImage(e.target.files?.[0], "header_image"); e.target.value = ""; }} />
              </label>
              {current.header_image && <GhostButton type="button" onClick={() => set("header_image", null)}>Hapus kop</GhostButton>}
            </div>
          </Field>

          <div className="space-y-2">
            <p className="text-[10px] font-semibold text-zinc-500 dark:text-zinc-400 uppercase tracking-[0.12em]">Rekening pembayaran</p>
            {current.accounts.length === 0 && <p className="text-[11px] text-zinc-400">Belum ada rekening. Invoice yang belum lunas tidak akan memuat cara pembayaran.</p>}
            {current.accounts.map((a, i) => (
              <div key={i} className="grid grid-cols-[1fr_1fr_auto] gap-2 items-start">
                <input value={a.bank} onChange={(e) => setAccount(i, { bank: e.target.value })} maxLength={60} className={inputCls} placeholder="Bank / e-wallet" aria-label={`Bank ${i + 1}`} />
                <input value={a.number} onChange={(e) => setAccount(i, { number: e.target.value })} maxLength={40} className={`${inputCls} font-mono`} placeholder="Nomor rekening" aria-label={`Nomor rekening ${i + 1}`} />
                <button type="button" onClick={() => set("accounts", current.accounts.filter((_, idx) => idx !== i))} aria-label={`Hapus rekening ${i + 1}`} className="p-2 text-zinc-400 hover:text-red-600 transition-colors duration-150">
                  <Trash2 className="w-4 h-4" />
                </button>
                <input value={a.holder} onChange={(e) => setAccount(i, { holder: e.target.value })} maxLength={120} className={`${inputCls} col-span-2`} placeholder="Atas nama" aria-label={`Atas nama ${i + 1}`} />
              </div>
            ))}
            {current.accounts.length < MAX_ACCOUNTS && (
              <GhostButton type="button" onClick={() => set("accounts", [...current.accounts, { bank: "", number: "", holder: "" }])}>
                <span className="flex items-center gap-1.5"><Plus className="w-3.5 h-3.5" /> Tambah rekening</span>
              </GhostButton>
            )}
          </div>

          <Field label="Catatan pembayaran">
            <input value={current.payment_note} onChange={(e) => set("payment_note", e.target.value)} maxLength={300} className={inputCls} />
          </Field>

          <div className="space-y-3 pt-1">
            <label className="flex items-center gap-2 text-xs text-zinc-700 dark:text-zinc-300">
              <input type="checkbox" checked={current.show_signature} onChange={(e) => set("show_signature", e.target.checked)} />
              Tampilkan tanda tangan di invoice
            </label>
            {current.show_signature && (
              <div className="space-y-3 pl-6">
                <div className="grid grid-cols-2 gap-2">
                  <input value={current.signature_name} onChange={(e) => set("signature_name", e.target.value)} maxLength={100} className={inputCls} placeholder="Nama penandatangan" aria-label="Nama penandatangan" />
                  <input value={current.signature_title} onChange={(e) => set("signature_title", e.target.value)} maxLength={100} className={inputCls} placeholder="Jabatan" aria-label="Jabatan" />
                </div>
                <div className="flex flex-wrap items-center gap-2">
                  <label className={fileBtn}>
                    <Upload className="w-3.5 h-3.5" /> {current.signature_image ? "Ganti tanda tangan" : "Unggah tanda tangan"}
                    <input type="file" accept="image/png,image/jpeg,image/webp" className="hidden" onChange={(e) => { void pickImage(e.target.files?.[0], "signature_image"); e.target.value = ""; }} />
                  </label>
                  {current.signature_image && <GhostButton type="button" onClick={() => set("signature_image", null)}>Hapus</GhostButton>}
                  <span className="text-[10px] text-zinc-400">PNG transparan paling rapi (±{SIGNATURE_SPEC.widthMm}×{SIGNATURE_SPEC.heightMm} mm)</span>
                </div>
              </div>
            )}
          </div>
        </div>

        <div className="space-y-3">
          <div className="flex items-center justify-between">
            <p className="text-[10px] font-semibold text-zinc-500 dark:text-zinc-400 uppercase tracking-[0.12em]">Pratinjau (data contoh)</p>
            <div className="flex gap-1.5">
              {[false, true].map((l) => (
                <button
                  key={String(l)}
                  type="button"
                  onClick={() => setSampleLunas(l)}
                  className={`text-[10px] font-semibold px-2.5 py-1 rounded-full border transition-colors duration-150 ${
                    sampleLunas === l ? "bg-[#124540] text-white border-[#124540]" : "border-zinc-200 dark:border-zinc-800 text-zinc-500"
                  }`}
                >
                  {l ? "Lunas" : "DP"}
                </button>
              ))}
            </div>
          </div>
          <ScaledDoc>
            <InvoiceDocument model={buildSampleInvoiceModel(sampleLunas)} settings={current} headerUrl={current.header_image} />
          </ScaledDoc>
        </div>
      </div>

      <div className="flex items-center justify-end gap-2 pt-1 border-t border-zinc-100 dark:border-zinc-800">
        {draft && <GhostButton type="button" onClick={() => setDraft(null)}>Batalkan perubahan</GhostButton>}
        <PrimaryButton onClick={onSave} loading={saving} disabled={!draft || !loaded || current.store_name.trim().length === 0}>
          Simpan
        </PrimaryButton>
      </div>
    </div>
  );
}
