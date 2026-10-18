// app/components/orders/detail/StepCard.tsx
// Satu tahap produksi di Detail Pesanan: status (selesai / sedang dikerjakan /
// menunggu) + aksi sesuai `type` tahap dan hak akses pengguna.
"use client";

import React, { useState } from "react";
import { Camera, Check, CheckCircle2, ExternalLink, Loader2, Lock, RotateCcw, XCircle } from "lucide-react";
import type { ApprovalInput, Order, ProductionStep, ProductionTypeData } from "@/types/order";
import type { UserData } from "@/types";
import { STEPS_WITH_WORKER_PICKER } from "@/lib/steps";
import { formatDateTime } from "@/lib/utils";
import { inputCls } from "@/app/components/settings/settingsShared";
import ApprovalForm from "./ApprovalForm";

interface Props {
  order: Order;
  step: ProductionStep;
  index: number;
  position: "done" | "active" | "locked";
  /** boleh mengerjakan tahap ini (izin) */
  canWork: boolean;
  /** boleh membatalkan tahap ini (izin + tahap sesudahnya belum selesai) */
  canUndo: boolean;
  /** aksi untuk tahap ini sedang diproses */
  busy: boolean;
  /** ada penyimpanan/upload lain yang sedang berjalan → semua tombol nonaktif */
  disabled: boolean;
  users: UserData[];
  currentUserId: string;
  utamaTypes: ProductionTypeData[];
  nameOf: (userId: string) => string;
  onComplete: (stepKey: string, workerIds: string[]) => void;
  onUpload: (stepKey: string, file: File) => void;
  onApproval: (data: ApprovalInput) => void;
  onQC: (passed: boolean, notes: string) => void;
  onUndo: (stepKey: string) => void;
}

const isImageUrl = (url: string) => /\.(jpe?g|png|webp|gif)$/i.test(url.split("?")[0]);

const btnPrimary =
  "flex items-center justify-center gap-2 bg-[#124540] hover:bg-[#0d332f] disabled:opacity-60 text-white px-4 py-2 rounded-md text-xs font-semibold transition-colors duration-150";

export default function StepCard(props: Props) {
  const {
    order, step, index, position, canWork, canUndo, busy, disabled,
    users, currentUserId, utamaTypes, nameOf,
    onComplete, onUpload, onApproval, onQC, onUndo,
  } = props;

  const [workers, setWorkers] = useState<string[]>([currentUserId]);
  const [qcNote, setQcNote] = useState("");
  const [showApproval, setShowApproval] = useState(false);

  const done = position === "done";
  const active = position === "active";
  const picker = STEPS_WITH_WORKER_PICKER.includes(step.key);

  // QC gagal sebelumnya → tampil di kartu Produksi Massal (perlu diperbaiki)
  const qcStep = order.steps.find((s) => s.key === "qc");
  const revisiNote =
    step.key === "produksi_massal" && active && qcStep?.qc?.passed === false ? qcStep.qc.notes : null;

  const toggleWorker = (id: string) =>
    setWorkers((w) => (w.includes(id) ? w.filter((x) => x !== id) : [...w, id]));

  const statusChip = done ? (
    <span className="text-[10px] font-semibold px-2 py-0.5 rounded-full border bg-emerald-100 text-emerald-800 border-emerald-300 dark:bg-emerald-900/40 dark:text-emerald-300 dark:border-emerald-800">Selesai</span>
  ) : active ? (
    <span className="text-[10px] font-semibold px-2 py-0.5 rounded-full border bg-blue-100 text-blue-800 border-blue-300 dark:bg-blue-900/40 dark:text-blue-300 dark:border-blue-800">Sedang dikerjakan</span>
  ) : (
    <span className="text-[10px] font-semibold px-2 py-0.5 rounded-full border bg-gray-100 text-gray-600 border-gray-300 dark:bg-zinc-800 dark:text-zinc-400 dark:border-zinc-700">Menunggu</span>
  );

  return (
    <li className="flex items-start gap-3">
      <span
        className={`mt-0.5 w-6 h-6 rounded-full flex items-center justify-center shrink-0 ${
          done
            ? "bg-[#124540] text-white"
            : active
              ? "border-2 border-[#124540] dark:border-[#49BFB4] text-[#124540] dark:text-[#49BFB4]"
              : "border border-zinc-300 dark:border-zinc-700 text-zinc-400"
        }`}
      >
        {done ? <Check className="w-3.5 h-3.5" /> : position === "locked" ? <Lock className="w-3 h-3" /> : <span className="text-[10px] font-semibold">{index + 1}</span>}
      </span>

      <div className="min-w-0 flex-1">
        <div className="flex flex-wrap items-center gap-2">
          <p className={`text-sm font-semibold ${position === "locked" ? "text-zinc-400 dark:text-zinc-500" : "text-zinc-900 dark:text-zinc-100"}`}>
            {index + 1}. {step.name}
          </p>
          {statusChip}
        </div>

        {/* ── Info tahap selesai ── */}
        {done && (
          <div className="mt-1 space-y-1">
            <p className="text-[11px] text-zinc-400 dark:text-zinc-500">
              {formatDateTime(step.completedAt)}
              {step.uploadedBy ? ` · ${step.uploadedBy}` : ""}
            </p>
            {picker && step.doneBy && step.doneBy.length > 0 && (
              <p className="text-[11px] text-zinc-500 dark:text-zinc-400">
                Dikerjakan: {step.doneBy.map(nameOf).join(", ")}
              </p>
            )}
            {step.key === "qc" && step.qc?.notes && (
              <p className="text-[11px] text-emerald-700 dark:text-emerald-400">
                {step.qc.notes}{step.qc.checkedBy ? ` — ${step.qc.checkedBy}` : ""}
              </p>
            )}
            {step.note && <p className="text-xs text-zinc-600 dark:text-zinc-300">Catatan: {step.note}</p>}
            {step.fileUrl &&
              (isImageUrl(step.fileUrl) ? (
                <a href={step.fileUrl} target="_blank" rel="noreferrer" className="inline-block">
                  {/* eslint-disable-next-line @next/next/no-img-element */}
                  <img
                    src={step.fileUrl}
                    alt={`Bukti ${step.name}`}
                    loading="lazy"
                    className="h-20 w-auto rounded-md border border-zinc-200 dark:border-zinc-800 object-cover"
                  />
                </a>
              ) : (
                <a href={step.fileUrl} target="_blank" rel="noreferrer" className="inline-flex items-center gap-1 text-xs font-semibold text-[#124540] dark:text-[#49BFB4] underline underline-offset-2">
                  <ExternalLink className="w-3 h-3" /> Buka file / link
                </a>
              ))}
            {canUndo && (
              <button
                onClick={() => onUndo(step.key)}
                disabled={disabled}
                className="flex items-center gap-1 text-[11px] font-semibold text-zinc-400 hover:text-red-600 dark:hover:text-red-400 disabled:opacity-50 transition-colors duration-150"
              >
                <RotateCcw className="w-3 h-3" /> Batalkan tahap
              </button>
            )}
          </div>
        )}

        {position === "locked" && (
          <p className="mt-0.5 text-[11px] text-zinc-400 dark:text-zinc-500">Menunggu tahap sebelumnya selesai.</p>
        )}

        {/* ── Aksi tahap aktif ── */}
        {active && (
          <div className="mt-2">
            {revisiNote && (
              <div className="mb-3 rounded-md border border-yellow-300 dark:border-yellow-800 bg-yellow-50 dark:bg-yellow-900/20 px-3 py-2 text-xs text-yellow-800 dark:text-yellow-300">
                <span className="font-semibold">Revisi dari QC:</span> {revisiNote}
              </div>
            )}

            {!canWork ? (
              <p className="text-[11px] text-zinc-400 dark:text-zinc-500">
                Menunggu dikerjakan oleh yang berwenang.
              </p>
            ) : step.type === "form" && step.key === "approval" ? (
              showApproval ? (
                <ApprovalForm
                  initialJumlah={order.jumlah}
                  utamaTypes={utamaTypes}
                  isSubmitting={busy || disabled}
                  onCancel={() => setShowApproval(false)}
                  onSubmit={onApproval}
                />
              ) : (
                <button onClick={() => setShowApproval(true)} disabled={disabled} className={btnPrimary}>
                  Buat Approval
                </button>
              )
            ) : step.type === "form" ? (
              <p className="text-[11px] text-zinc-400 dark:text-zinc-500">Tahap ini terisi otomatis saat pesanan disimpan.</p>
            ) : step.type === "status_update" ? (
              <div className="space-y-2">
                {picker && (
                  <div>
                    <p className="text-[10px] font-semibold text-zinc-500 dark:text-zinc-400 uppercase tracking-[0.12em] mb-1">Dikerjakan oleh</p>
                    <div className="flex flex-wrap gap-1.5">
                      {users.map((u) => {
                        const on = workers.includes(u.id);
                        return (
                          <button
                            key={u.id}
                            type="button"
                            onClick={() => toggleWorker(u.id)}
                            disabled={disabled}
                            className={`px-2.5 py-1 rounded-md text-xs font-semibold border transition-colors duration-150 ${
                              on
                                ? "bg-[#124540] text-white border-[#124540]"
                                : "bg-white dark:bg-zinc-950 text-zinc-500 dark:text-zinc-400 border-zinc-200 dark:border-zinc-800 hover:bg-zinc-50 dark:hover:bg-zinc-900"
                            }`}
                          >
                            {u.name}
                          </button>
                        );
                      })}
                    </div>
                  </div>
                )}
                <button
                  onClick={() => onComplete(step.key, picker ? workers : [currentUserId])}
                  disabled={disabled || (picker && workers.length === 0)}
                  className={btnPrimary}
                >
                  {busy ? <Loader2 className="w-4 h-4 animate-spin" /> : <CheckCircle2 className="w-4 h-4" />}
                  {step.actionLabel ?? "Tandai selesai"}
                </button>
              </div>
            ) : step.type === "upload_image" ? (
              <label
                className={`${btnPrimary} w-fit cursor-pointer ${disabled ? "opacity-60 pointer-events-none" : ""}`}
              >
                {busy ? <Loader2 className="w-4 h-4 animate-spin" /> : <Camera className="w-4 h-4" />}
                {busy ? "Mengupload…" : "Pilih foto & upload"}
                <input
                  type="file"
                  accept="image/*"
                  className="hidden"
                  disabled={disabled}
                  onChange={(e) => {
                    const f = e.target.files?.[0];
                    e.target.value = ""; // supaya foto yang sama bisa dipilih lagi
                    if (f) onUpload(step.key, f);
                  }}
                />
              </label>
            ) : step.type === "qc" ? (
              <div className="space-y-2">
                <textarea
                  rows={2}
                  disabled={disabled}
                  className={inputCls}
                  value={qcNote}
                  onChange={(e) => setQcNote(e.target.value)}
                  placeholder="Catatan QC (wajib bila gagal)"
                />
                <div className="flex gap-2">
                  <button onClick={() => onQC(true, qcNote)} disabled={disabled} className={btnPrimary}>
                    <CheckCircle2 className="w-4 h-4" /> Lolos QC
                  </button>
                  <button
                    onClick={() => onQC(false, qcNote)}
                    disabled={disabled}
                    className="flex items-center justify-center gap-2 bg-red-600 hover:bg-red-700 disabled:opacity-60 text-white px-4 py-2 rounded-md text-xs font-semibold transition-colors duration-150"
                  >
                    <XCircle className="w-4 h-4" /> Gagal — Revisi
                  </button>
                </div>
              </div>
            ) : null}
          </div>
        )}

        {/* QC gagal: tahap QC menunggu perbaikan produksi, tampilkan catatannya */}
        {position === "locked" && step.key === "qc" && step.qc?.passed === false && step.qc.notes && (
          <p className="mt-1 text-[11px] text-yellow-700 dark:text-yellow-400">
            QC sebelumnya gagal: {step.qc.notes} — menunggu perbaikan, lalu QC diulang.
          </p>
        )}
      </div>
    </li>
  );
}
