// app/components/orders/detail/StepFinishing.tsx
// Kartu 03 — QC & Packing (dua kolom; pesanan non-utama hanya QC) dan
// kartu 04 — Pengiriman (Bukti Kirim & Bukti Terima). Tata letak mengikuti Sablon.
"use client";

import React, { useState } from "react";
import { AlertTriangle, CheckCircle, Eye, Loader2, Package, Trash2 } from "lucide-react";
import { formatDateTime } from "@/lib/utils";
import { ByLine, SectionCard, StepCtx, UploadButton, getStep } from "./stepUi";

interface Props {
  ctx: StepCtx;
  onQC: (passed: boolean, notes: string) => Promise<boolean>;
}

const colBox = "flex flex-col border border-zinc-200 dark:border-zinc-800 rounded-md p-4";
const colLabel = "text-[10px] font-semibold uppercase tracking-[0.12em] text-zinc-500 dark:text-zinc-400 mb-3";

export default function StepFinishing({ ctx, onQC }: Props) {
  const { order, disabled, busyKey } = ctx;
  const [qcNote, setQcNote] = useState("");

  const qc = getStep(order, "qc");
  const packing = getStep(order, "packing"); // tidak ada di pesanan non-utama
  const kirim = getStep(order, "pengiriman");
  const terima = getStep(order, "penerimaan");
  const showPacking = !!packing;

  const qcFailed = !!qc && !qc.isCompleted && qc.qc?.passed === false && !!qc.qc.notes;
  const qcPos = ctx.position("qc");

  return (
    <>
      {/* ── 03 QC & PACKING ── */}
      <SectionCard num="03" title={showPacking ? "QC & Packing" : "Quality Control"}>
        <div className={`grid grid-cols-1 gap-4 md:gap-6 ${showPacking ? "md:grid-cols-2" : ""}`}>
          {/* KIRI: QC */}
          <div className={colBox}>
            <span className={colLabel}>Quality Control</span>

            {qcFailed && (
              <div className="border-l-2 border-red-600 pl-3 py-1 mb-4">
                <p className="text-[10px] font-semibold text-red-600 dark:text-red-400 uppercase mb-1 flex items-center gap-1">
                  <AlertTriangle className="w-3 h-3" /> Alasan Revisi:
                </p>
                <p className="text-xs text-zinc-700 dark:text-zinc-300 italic">&quot;{qc?.qc?.notes}&quot;</p>
                {qc?.qc?.checkedBy && (
                  <p className="text-[10px] text-zinc-400 dark:text-zinc-500 mt-1">Dicek oleh: {qc.qc.checkedBy}</p>
                )}
              </div>
            )}

            {qc?.isCompleted ? (
              <div className="flex-1 flex flex-col items-center justify-center gap-1.5 py-6 rounded-md bg-emerald-50 dark:bg-emerald-900/10 text-center min-h-[140px]">
                <CheckCircle className="w-6 h-6 text-emerald-600 dark:text-emerald-400" />
                <h4 className="font-semibold text-emerald-600 dark:text-emerald-400 text-sm uppercase tracking-wide">Lolos QC</h4>
                <p className="text-[10px] text-zinc-500 dark:text-zinc-400 font-mono tabular-nums">
                  Oleh: {qc.qc?.checkedBy ?? qc.uploadedBy ?? "-"} | {formatDateTime(qc.completedAt)}
                </p>
                {qc.qc?.notes && qc.qc.notes !== "Lolos QC" && (
                  <p className="text-[10px] text-zinc-500 dark:text-zinc-400 italic">{qc.qc.notes}</p>
                )}
                {ctx.canUndo("qc") && (
                  <button
                    onClick={() => ctx.onUndo("qc")}
                    disabled={disabled}
                    className="text-zinc-400 hover:text-red-600 dark:hover:text-red-400 text-[10px] mt-3 hover:underline transition-colors duration-150"
                  >
                    Reset
                  </button>
                )}
              </div>
            ) : qcPos === "active" && ctx.canWork("qc") ? (
              <div className="flex-1 flex flex-col">
                <textarea
                  placeholder="Catatan QC (Wajib jika revisi)..."
                  disabled={disabled}
                  className="w-full text-sm p-3 text-zinc-900 dark:text-zinc-100 bg-zinc-50 dark:bg-zinc-900 border border-zinc-200 dark:border-zinc-800 rounded-md outline-none transition-colors duration-150 mb-3 resize-none h-28"
                  value={qcNote}
                  onChange={(e) => setQcNote(e.target.value)}
                />
                <div className="grid grid-cols-2 gap-3 mt-auto">
                  <button
                    onClick={async () => { if (await onQC(false, qcNote)) setQcNote(""); }}
                    disabled={!qcNote.trim() || disabled}
                    className="bg-white dark:bg-zinc-900 border border-red-200 dark:border-red-900 text-red-600 dark:text-red-400 py-2.5 rounded-md font-semibold text-xs hover:bg-red-50 dark:hover:bg-red-900/20 disabled:opacity-50 disabled:cursor-not-allowed transition-colors duration-150 flex items-center justify-center gap-2"
                  >
                    {busyKey === "qc:fail" ? (<><Loader2 className="w-3.5 h-3.5 animate-spin" /> Memproses...</>) : "Revisi"}
                  </button>
                  <button
                    onClick={async () => { if (await onQC(true, qcNote)) setQcNote(""); }}
                    disabled={disabled}
                    className="bg-[#124540] text-white py-2.5 rounded-md font-semibold text-xs hover:bg-[#0d332f] disabled:opacity-70 disabled:cursor-not-allowed transition-colors duration-150 flex items-center justify-center gap-2"
                  >
                    {busyKey === "qc:pass" ? (<><Loader2 className="w-3.5 h-3.5 animate-spin" /> Memproses...</>) : "Lolos QC"}
                  </button>
                </div>
              </div>
            ) : (
              <div className="flex-1 flex items-center justify-center text-center py-6 min-h-[140px]">
                <span className="text-xs text-zinc-400 dark:text-zinc-600 italic">
                  {qcFailed ? "Sedang Revisi — menunggu upload ulang produksi..." : "Menunggu produksi selesai..."}
                </span>
              </div>
            )}
          </div>

          {/* KANAN: PACKING (hanya pesanan utama) */}
          {showPacking && packing && (
            <div className={colBox}>
              <span className={colLabel}>Packing</span>

              {packing.isCompleted ? (
                <div className="flex-1 flex flex-col min-h-[140px]">
                  {packing.fileUrl ? (
                    <div className="relative w-full h-28 mb-3 rounded-md overflow-hidden border border-zinc-200 dark:border-zinc-800 group">
                      {/* eslint-disable-next-line @next/next/no-img-element */}
                      <img src={packing.fileUrl} alt="Packing" className="w-full h-full object-cover" />
                      <a
                        href={packing.fileUrl}
                        target="_blank"
                        rel="noreferrer"
                        className="absolute inset-0 bg-black/40 flex items-center justify-center text-white opacity-0 group-hover:opacity-100 transition-colors duration-150 font-semibold text-xs"
                      >
                        <Eye className="w-4 h-4 mr-1" /> Lihat
                      </a>
                    </div>
                  ) : (
                    <div className="flex justify-center mb-3 py-4">
                      <Package className="w-8 h-8 text-zinc-300 dark:text-zinc-600" />
                    </div>
                  )}
                  <div className="flex items-center justify-between gap-2 mt-auto">
                    <div className="flex items-center gap-1.5 pl-2 border-l-2 border-emerald-600">
                      <span className="text-[10px] font-semibold text-emerald-600 dark:text-emerald-400 uppercase tracking-wide">Selesai</span>
                    </div>
                    {ctx.canUndo("packing") && (
                      <button
                        onClick={() => ctx.onUndo("packing")}
                        disabled={disabled}
                        className="flex items-center gap-1 text-[10px] font-semibold text-zinc-400 hover:text-red-600 dark:hover:text-red-400 px-1.5 py-1 rounded-md hover:bg-zinc-100 dark:hover:bg-zinc-800 transition-colors duration-150"
                      >
                        <Trash2 className="w-3 h-3" /> Hapus
                      </button>
                    )}
                  </div>
                  <p className="text-[10px] text-zinc-400 dark:text-zinc-500 mt-2">
                    Di-pack oleh: <span className="font-semibold text-zinc-600 dark:text-zinc-300">{packing.uploadedBy ?? "-"}</span>
                    <span className="font-mono tabular-nums"> · {formatDateTime(packing.completedAt ?? packing.timestamp)}</span>
                  </p>
                </div>
              ) : (
                <div className="flex-1 flex items-center justify-center min-h-[140px]">
                  {ctx.position("packing") === "active" && ctx.canWork("packing") ? (
                    <UploadButton
                      label="Upload Foto"
                      variant="big"
                      disabled={disabled}
                      busy={busyKey === "step:packing"}
                      onFile={(f) => ctx.onUpload("packing", f)}
                    />
                  ) : (
                    <div className="text-center flex flex-col items-center gap-2">
                      <Package className="w-6 h-6 text-zinc-300 dark:text-zinc-600" />
                      <p className="text-xs text-zinc-400 dark:text-zinc-600 italic">Menunggu QC Lolos</p>
                    </div>
                  )}
                </div>
              )}
            </div>
          )}
        </div>
      </SectionCard>

      {/* ── 04 PENGIRIMAN ── */}
      <SectionCard num="04" title="Pengiriman">
        <div className="p-4 border border-zinc-200 dark:border-zinc-800 rounded-xl bg-zinc-50/60 dark:bg-zinc-900/50 space-y-4">
          {/* Bukti Kirim */}
          {kirim && (
            <div className="flex justify-between items-center gap-3">
              <div>
                <span className="text-xs md:text-sm font-semibold text-zinc-700 dark:text-zinc-300">Bukti Kirim (Resi)</span>
                <ByLine step={kirim} />
              </div>
              {kirim.isCompleted ? (
                <div className="flex gap-2 items-center">
                  {kirim.fileUrl && (
                    <a href={kirim.fileUrl} target="_blank" rel="noreferrer" className="text-emerald-600 dark:text-emerald-400 font-semibold underline text-xs hover:text-emerald-700 dark:hover:text-emerald-300 transition-colors duration-150">
                      Lihat Resi
                    </a>
                  )}
                  {ctx.canUndo("pengiriman") && (
                    <button onClick={() => ctx.onUndo("pengiriman")} disabled={disabled} className="text-zinc-400 hover:text-red-600 dark:hover:text-red-400 p-1 rounded-md hover:bg-zinc-100 dark:hover:bg-zinc-800 transition-colors duration-150">
                      <Trash2 className="w-4 h-4" />
                    </button>
                  )}
                </div>
              ) : ctx.position("pengiriman") === "active" && ctx.canWork("pengiriman") ? (
                <UploadButton label="Upload Resi" variant="primary" disabled={disabled} busy={busyKey === "step:pengiriman"} onFile={(f) => ctx.onUpload("pengiriman", f)} />
              ) : (
                <span className="text-[10px] text-zinc-300 dark:text-zinc-600 italic">
                  {showPacking ? "Menunggu pengerjaan & packing selesai..." : "Menunggu QC lolos..."}
                </span>
              )}
            </div>
          )}

          {/* Bukti Terima */}
          {terima && (
            <div className="flex justify-between items-center border-t border-zinc-200 dark:border-zinc-800 pt-4 gap-3">
              <div>
                <span className="text-xs md:text-sm font-semibold text-zinc-700 dark:text-zinc-300">Bukti Terima (User)</span>
                <ByLine step={terima} />
              </div>
              {terima.isCompleted ? (
                <div className="flex gap-2 items-center">
                  {terima.fileUrl && (
                    <a href={terima.fileUrl} target="_blank" rel="noreferrer" className="text-orange-600 dark:text-orange-400 font-semibold underline text-xs hover:text-orange-700 dark:hover:text-orange-300 transition-colors duration-150">
                      Lihat Bukti
                    </a>
                  )}
                  {ctx.canUndo("penerimaan") && (
                    <button onClick={() => ctx.onUndo("penerimaan")} disabled={disabled} className="text-zinc-400 hover:text-red-600 dark:hover:text-red-400 p-1 rounded-md hover:bg-zinc-100 dark:hover:bg-zinc-800 transition-colors duration-150">
                      <Trash2 className="w-4 h-4" />
                    </button>
                  )}
                </div>
              ) : ctx.position("penerimaan") === "active" && ctx.canWork("penerimaan") ? (
                <UploadButton label="Upload Terima" variant="primary" disabled={disabled} busy={busyKey === "step:penerimaan"} onFile={(f) => ctx.onUpload("penerimaan", f)} />
              ) : (
                <span className="text-[10px] text-zinc-300 dark:text-zinc-600 italic">-</span>
              )}
            </div>
          )}
        </div>
      </SectionCard>
    </>
  );
}
