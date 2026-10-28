// app/components/orders/detail/StepApproval.tsx
// Kartu 01 — Approval.
//  utama     : form Approval (rincian jenis × varian × ukuran) → Form Approval dibuat otomatis
//  non_utama : Detail Pesanan (otomatis) + Upload Mockup
"use client";

import React, { useState } from "react";
import { Eye, FileText } from "lucide-react";
import type { ApprovalInput, ProductionTypeData } from "@/types/order";
import { itemTitle } from "@/lib/orderItems";
import { ByLine, DoneBadge, SectionCard, StepCtx, UploadButton, getStep } from "./stepUi";
import ApprovalForm from "./ApprovalForm";

interface Props {
  ctx: StepCtx;
  productionTypes: ProductionTypeData[];
  /** simpan Approval (pesanan utama) */
  onApproval: (data: ApprovalInput) => void;
}

const ViewLink = ({ href, children }: { href: string; children: React.ReactNode }) => (
  <a
    href={href}
    target="_blank"
    rel="noopener noreferrer"
    className="text-[10px] text-blue-600 dark:text-blue-400 font-semibold flex items-center gap-1 hover:underline"
  >
    <Eye className="w-3.5 h-3.5" /> {children}
  </a>
);

export default function StepApproval({ ctx, productionTypes, onApproval }: Props) {
  const { order, disabled, busyKey } = ctx;
  const [showForm, setShowForm] = useState(false);
  const utamaTypes = productionTypes.filter((t) => t.kategori === "utama");

  // ── Pesanan UTAMA ─────────────────────────────────────────────────────────
  if (order.kategori === "utama") {
    const step = getStep(order, "approval");
    if (!step) return null;
    const busy = busyKey === "step:approval";

    return (
      <SectionCard num="01" title="Approval">
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
          <div className="flex-1">
            {step.isCompleted ? (
              <>
                <div className="font-semibold text-sm md:text-base text-zinc-900 dark:text-zinc-200">
                  Form Approval Siap
                </div>
                <ByLine step={step} />
                {order.items.length > 0 && (
                  <div className="text-xs text-zinc-600 dark:text-zinc-300 mt-1">
                    {order.items
                      .map((it) => `${itemTitle(it, productionTypes)} × ${it.jumlah}`)
                      .join(" · ")}
                  </div>
                )}
                {step.note && (
                  <div className="text-xs text-zinc-500 dark:text-zinc-400 mt-0.5">Catatan: {step.note}</div>
                )}
                <div className="flex items-center gap-4 mt-1">
                  <ViewLink href={`/approval/${order.id}`}>Lihat Form Approval</ViewLink>
                  {step.fileUrl && <ViewLink href={step.fileUrl}>File approval lama</ViewLink>}
                </div>
              </>
            ) : (
              <>
                <div className="font-semibold text-sm md:text-base text-zinc-400 dark:text-zinc-600">
                  Approval Desain
                </div>
                <div className="text-[10px] text-zinc-400 dark:text-zinc-600 italic">
                  Isi rincian pesanan (jenis, varian, ukuran, jumlah); Form Approval dibuat otomatis...
                </div>
              </>
            )}
          </div>

          <div className="flex items-center gap-2">
            {step.isCompleted ? (
              <DoneBadge canUndo={ctx.canUndo("approval")} disabled={disabled} onUndo={() => ctx.onUndo("approval")} />
            ) : (
              ctx.canWork("approval") &&
              !showForm && (
                <button
                  onClick={() => setShowForm(true)}
                  disabled={disabled}
                  className="bg-white dark:bg-zinc-900 border border-zinc-200 dark:border-zinc-800 px-4 py-2 rounded-md text-xs font-semibold text-zinc-600 dark:text-zinc-300 flex items-center justify-center gap-2 hover:bg-zinc-50 dark:hover:bg-zinc-800 disabled:opacity-50 transition-colors duration-150 w-full sm:w-auto"
                >
                  <FileText className="w-4 h-4" /> Buat Approval
                </button>
              )
            )}
          </div>
        </div>

        {!step.isCompleted && showForm && ctx.canWork("approval") && (
          <ApprovalForm
            utamaTypes={utamaTypes}
            isSubmitting={busy || disabled}
            onCancel={() => setShowForm(false)}
            onSubmit={onApproval}
          />
        )}
      </SectionCard>
    );
  }

  // ── Pesanan NON-UTAMA: Detail Pesanan (otomatis) + Mockup ────────────────
  const detail = getStep(order, "detail");
  const mockup = getStep(order, "mockup");
  return (
    <SectionCard num="01" title="Approval">
      <div className="space-y-4">
        {detail && (
          <div className="flex flex-col sm:flex-row sm:items-center justify-between border-b border-zinc-200 dark:border-zinc-800 pb-4 gap-3">
            <div>
              <div className="font-semibold text-sm md:text-base text-zinc-900 dark:text-zinc-200">Detail Pesanan</div>
              <ByLine step={detail} />
            </div>
            {detail.isCompleted && (
              <DoneBadge canUndo={false} disabled onUndo={() => undefined} />
            )}
          </div>
        )}

        {mockup && (
          <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
            <div>
              <div
                className={`font-semibold text-sm md:text-base ${
                  mockup.isCompleted ? "text-zinc-900 dark:text-zinc-200" : "text-zinc-400 dark:text-zinc-600"
                }`}
              >
                {mockup.isCompleted ? "Mockup Terupload" : "Mockup Desain"}
              </div>
              <ByLine step={mockup} />
              {mockup.fileUrl && (
                <div className="flex items-center gap-4 mt-1">
                  <ViewLink href={mockup.fileUrl}>Lihat Mockup</ViewLink>
                </div>
              )}
              {!mockup.isCompleted && (
                <div className="text-[10px] text-zinc-400 dark:text-zinc-600 italic">Upload mockup desain...</div>
              )}
            </div>
            <div className="flex items-center gap-2">
              {mockup.isCompleted ? (
                <DoneBadge canUndo={ctx.canUndo("mockup")} disabled={disabled} onUndo={() => ctx.onUndo("mockup")} />
              ) : (
                ctx.canWork("mockup") && (
                  <UploadButton
                    label="Upload Mockup"
                    disabled={disabled || ctx.position("mockup") !== "active"}
                    busy={busyKey === "step:mockup"}
                    onFile={(f) => ctx.onUpload("mockup", f)}
                  />
                )
              )}
            </div>
          </div>
        )}
      </div>
    </SectionCard>
  );
}
