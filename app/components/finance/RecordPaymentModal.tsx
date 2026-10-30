// app/components/finance/RecordPaymentModal.tsx
//
// Catat pembayaran (atau refund) untuk satu pesanan. Kirim multipart ke POST /api/finance/payments.
// Jenis DP/cicilan/pelunasan TIDAK dipilih di sini — ditentukan database dari sisa tagihan.
// Aturan tombol Simpan ada di lib/finance/view.ts (paymentFormState); database memeriksa ulang semuanya.
"use client";

import React, { useMemo, useState } from "react";
import { Upload } from "lucide-react";
import imageCompression from "browser-image-compression";
import { useDialog } from "@/app/components/ui/DialogProvider";
import { finFetch, errMsg } from "@/hooks/useFinanceApi";
import { PAYMENT_METHOD_LABEL, type FinanceMeta, type PaymentMethod } from "@/lib/finance/types";
import { MAX_PROOF_BYTES } from "@/lib/finance/validate";
import { paymentFormState } from "@/lib/finance/view";
import { CurrencyInput } from "./CurrencyInput";
import { ModalShell, Field, inputCls, PrimaryButton, GhostButton } from "./ui";
import { formatRupiah, todayYmd } from "./utils";

export interface RecordTarget {
  order_id: string;
  kode_produksi: string;
  nama_pemesan: string;
  total: number;
  balance: number;
  paid_verified: number;
  paid_pending: number;
}

export default function RecordPaymentModal({
  target,
  meta,
  onClose,
  onDone,
}: {
  target: RecordTarget;
  /** akun, pengaturan, dan hak pengguna (dari GET /api/finance/meta) */
  meta: FinanceMeta;
  onClose: () => void;
  onDone: () => void;
}) {
  const { notify } = useDialog();
  const canRefund = meta.caps.maker;

  const [isRefund, setIsRefund] = useState(false);
  const [amount, setAmount] = useState(Math.max(0, target.balance - target.paid_pending));
  const [method, setMethod] = useState<PaymentMethod>("transfer");
  const [pickedAccount, setPickedAccount] = useState("");
  const [paidAt, setPaidAt] = useState(todayYmd());
  const [reference, setReference] = useState("");
  const [payer, setPayer] = useState("");
  const [note, setNote] = useState("");
  const [file, setFile] = useState<File | null>(null);
  const [saving, setSaving] = useState(false);

  // Akun bawaan menurut metode (tunai → kas, lainnya → bank/e-wallet) selama belum dipilih sendiri.
  const accountId = useMemo(() => {
    if (pickedAccount && meta.accounts.some((a) => a.id === pickedAccount)) return pickedAccount;
    const preferCash = method === "tunai";
    const match = meta.accounts.find((a) => (a.type === "cash") === preferCash);
    return (match ?? meta.accounts[0])?.id ?? "";
  }, [pickedAccount, method, meta.accounts]);

  const form = paymentFormState({
    amount,
    balance: target.balance,
    paidPending: target.paid_pending,
    paidVerified: target.paid_verified,
    isRefund,
    allowOverpayment: meta.settings.allow_overpayment,
    method,
    requireProofNonCash: meta.settings.require_proof_non_cash,
    hasAccount: !!accountId,
    hasDate: !!paidAt,
    hasFile: !!file,
  });

  const pickFile = async (f: File | null) => {
    if (!f) return setFile(null);
    try {
      // Foto dikompres di browser; PDF dikirim apa adanya. Server tetap memvalidasi isi file.
      const out: Blob = f.type.startsWith("image/")
        ? await imageCompression(f, { maxSizeMB: 1, maxWidthOrHeight: 1800, useWebWorker: true })
        : f;
      const result = out instanceof File ? out : new File([out], f.name, { type: out.type || f.type });
      if (result.size > MAX_PROOF_BYTES) {
        notify("Ukuran bukti maksimal 4 MB. Kecilkan file lalu pilih lagi.", { title: "File terlalu besar" });
        return setFile(null);
      }
      setFile(result);
    } catch {
      if (f.size > MAX_PROOF_BYTES) {
        notify("Ukuran bukti maksimal 4 MB. Kecilkan file lalu pilih lagi.", { title: "File terlalu besar" });
        return setFile(null);
      }
      setFile(f);
    }
  };

  const submit = async () => {
    setSaving(true);
    try {
      const fd = new FormData();
      fd.append("order_id", target.order_id);
      fd.append("amount", String(amount));
      fd.append("method", method);
      fd.append("account_id", accountId);
      fd.append("paid_at", paidAt);
      if (isRefund) fd.append("kind", "refund");
      if (reference.trim()) fd.append("reference_no", reference.trim());
      if (payer.trim()) fd.append("payer_name", payer.trim());
      if (note.trim()) fd.append("note", note.trim());
      if (file) fd.append("proof", file);

      const r = await finFetch<{ status: string; kind: string | null }>("/api/finance/payments", {
        method: "POST",
        body: fd,
      });
      notify(
        r.status === "verified"
          ? "Pembayaran tercatat dan terverifikasi."
          : "Pembayaran tercatat, menunggu verifikasi.",
        { type: "success", title: "Berhasil" },
      );
      onDone();
      onClose();
    } catch (e) {
      notify(errMsg(e), { title: "Gagal mencatat pembayaran" });
    } finally {
      setSaving(false);
    }
  };

  const closedByPending = !isRefund && target.balance > 0 && target.balance - target.paid_pending <= 0;

  return (
    <ModalShell
      title={isRefund ? "Catat refund" : "Catat pembayaran"}
      subtitle={`${target.kode_produksi} · ${target.nama_pemesan}`}
      onClose={onClose}
    >
      <div className="space-y-4">
        <div className="grid grid-cols-3 gap-2 text-center">
          {(
            [
              ["Tagihan", target.total],
              ["Terbayar", target.paid_verified],
              ["Sisa", target.balance],
            ] as const
          ).map(([l, v]) => (
            <div key={l} className="rounded-md bg-zinc-50 dark:bg-zinc-900 py-2">
              <p className="text-[10px] font-semibold text-zinc-500 dark:text-zinc-400 uppercase tracking-[0.12em]">{l}</p>
              <p className="text-xs font-semibold font-mono tabular-nums text-zinc-900 dark:text-zinc-100">
                {formatRupiah(v)}
              </p>
            </div>
          ))}
        </div>

        {target.paid_pending > 0 && (
          <p className="text-[11px] text-amber-700 dark:text-amber-400 bg-amber-50 dark:bg-amber-950/30 border border-amber-200 dark:border-amber-900/50 rounded-md px-3 py-2">
            {formatRupiah(target.paid_pending)} masih menunggu verifikasi dan ikut dihitung terhadap sisa tagihan.
          </p>
        )}
        {closedByPending && (
          <p className="text-[11px] text-zinc-600 dark:text-zinc-300 bg-zinc-50 dark:bg-zinc-900 rounded-md px-3 py-2">
            Sisa tagihan sudah tertutup oleh pembayaran yang menunggu verifikasi. Verifikasi dulu, atau batalkan (void) bila salah.
          </p>
        )}

        {canRefund && (
          <label className="flex items-center gap-2 text-xs text-zinc-600 dark:text-zinc-300">
            <input
              type="checkbox"
              checked={isRefund}
              onChange={(e) => {
                setIsRefund(e.target.checked);
                setAmount(0);
              }}
            />
            Ini refund (uang dikembalikan ke pelanggan)
          </label>
        )}

        <CurrencyInput key={isRefund ? "r" : "p"} label="Nominal" value={amount} onChange={setAmount} required />
        {form.overLimit && (
          <p className="text-[11px] text-red-600 dark:text-red-400 -mt-2">
            Melebihi {isRefund ? "total yang sudah terverifikasi" : "sisa tagihan"} ({formatRupiah(form.maxAmount)}).
          </p>
        )}
        {!isRefund && (
          <p className="text-[10px] text-zinc-400 dark:text-zinc-500 -mt-2">
            Jenis (DP / cicilan / pelunasan) ditentukan otomatis dari sisa tagihan.
          </p>
        )}

        <div className="grid grid-cols-2 gap-3">
          <Field label="Metode" required>
            <select value={method} onChange={(e) => setMethod(e.target.value as PaymentMethod)} className={inputCls}>
              {(Object.keys(PAYMENT_METHOD_LABEL) as PaymentMethod[]).map((m) => (
                <option key={m} value={m}>
                  {PAYMENT_METHOD_LABEL[m]}
                </option>
              ))}
            </select>
          </Field>
          <Field label="Akun kas/bank" required>
            <select value={accountId} onChange={(e) => setPickedAccount(e.target.value)} className={inputCls}>
              {meta.accounts.length === 0 && <option value="">Belum ada akun</option>}
              {meta.accounts.map((a) => (
                <option key={a.id} value={a.id}>
                  {a.name}
                </option>
              ))}
            </select>
          </Field>
        </div>

        <Field label="Tanggal diterima" required>
          <input
            type="date"
            value={paidAt}
            max={todayYmd()}
            onChange={(e) => setPaidAt(e.target.value)}
            className={inputCls}
          />
        </Field>

        <div className="grid grid-cols-2 gap-3">
          <Field label="No. referensi">
            <input
              value={reference}
              onChange={(e) => setReference(e.target.value)}
              maxLength={100}
              className={inputCls}
              placeholder="No. transaksi"
            />
          </Field>
          <Field label="Nama pengirim">
            <input value={payer} onChange={(e) => setPayer(e.target.value)} maxLength={100} className={inputCls} />
          </Field>
        </div>

        <Field
          label="Bukti pembayaran"
          required={form.needProof}
          hint={
            form.needProof
              ? "Wajib untuk transfer/QRIS. JPG, PNG, WEBP, atau PDF (maks 4 MB)."
              : "Opsional. JPG, PNG, WEBP, atau PDF (maks 4 MB)."
          }
        >
          <span className="flex items-center gap-2 cursor-pointer border border-dashed border-zinc-300 dark:border-zinc-700 rounded-md px-3 py-3 text-xs text-zinc-500 hover:bg-zinc-50 dark:hover:bg-zinc-900 transition-colors duration-150">
            <Upload className="w-4 h-4 shrink-0" />
            <span className="truncate">{file ? file.name : "Pilih file…"}</span>
            <input
              type="file"
              accept="image/jpeg,image/png,image/webp,application/pdf"
              className="hidden"
              onChange={(e) => void pickFile(e.target.files?.[0] ?? null)}
            />
          </span>
        </Field>

        <Field label="Catatan">
          <input value={note} onChange={(e) => setNote(e.target.value)} maxLength={500} className={inputCls} />
        </Field>

        <div className="flex gap-2 pt-1">
          <GhostButton onClick={onClose} className="flex-1">
            Batal
          </GhostButton>
          <PrimaryButton onClick={submit} loading={saving} disabled={!form.canSubmit} className="flex-1">
            Simpan
          </PrimaryButton>
        </div>
      </div>
    </ModalShell>
  );
}
