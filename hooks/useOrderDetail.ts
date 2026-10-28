// hooks/useOrderDetail.ts
//
// Aksi di halaman Detail Pesanan: selesaikan tahap, upload bukti, Approval,
// QC (lolos/gagal), batalkan tahap, dan kendala. (Pola dari useOrderDetail +
// useUpload Sablon.) Semua perubahan disimpan lewat applyStepUpdate /
// applyKendalaUpdate di useOrders — di sini hanya aturan "apa yang diubah".
//
// Aturan (PRD bagian 6):
//  - tahap hanya bisa dikerjakan berurutan (tahap sebelumnya harus selesai)
//  - semua tahap = upload foto; pengunggah + waktu tercatat (uploadedBy/timestamp)
//    dan pengunggah menjadi pekerja tahap itu (doneBy → dasar gaji)
//  - QC gagal → catatan wajib → status Revisi → Produksi Massal dibuka lagi
//  - tiap aksi menulis log, memanggil notifikasi, dan memuat ulang data

import { useCallback, useState } from "react";
import type { UserData } from "@/types";
import type { ApprovalInput, KendalaNote, Order, ProductionTypeData } from "@/types/order";
import { resetStep, stepPosition } from "@/lib/steps";
import { getDocumentLabel } from "@/lib/utils";
import { cleanItems, sumItems, uploadMockups, validateItems } from "@/lib/orderItems";
import type { ActionLog, OrderFields } from "@/hooks/useOrders";
import type { ProductionStep } from "@/types/order";

type OrderRef = Pick<Order, "id" | "kode_produksi" | "status">;

interface Props {
  order: Order;
  /** master jenis produksi (daftar ukuran & varian dipakai memeriksa rincian Approval) */
  productionTypes: ProductionTypeData[];
  currentUser: UserData & { id: string };
  applyStepUpdate: (
    order: Order,
    stepKey: string,
    patch: Partial<ProductionStep>,
    options?: {
      log?: ActionLog;
      fields?: OrderFields;
      also?: Record<string, Partial<ProductionStep>>;
    },
  ) => Promise<boolean>;
  applyKendalaUpdate: (order: Order, kendala: KendalaNote[], log: ActionLog) => Promise<boolean>;
  uploadProof: (
    order: OrderRef,
    file: File,
    label: string,
    opts?: { allowPdf?: boolean; highRes?: boolean },
  ) => Promise<string | null>;
  showAlert: (title: string, message: string, type?: "success" | "error") => void;
  showConfirm: (title: string, message: string, onConfirm: () => void) => void;
}

/** Isian standar saat sebuah tahap diselesaikan. */
function doneFields(byName: string, workers: string[]): Partial<ProductionStep> {
  const now = new Date().toISOString();
  return {
    isCompleted: true,
    completedAt: now,
    timestamp: now,
    uploadedBy: byName,
    doneBy: workers,
  };
}

export function useOrderDetail({
  order,
  productionTypes,
  currentUser,
  applyStepUpdate,
  applyKendalaUpdate,
  uploadProof,
  showAlert,
  showConfirm,
}: Props) {
  // Tahap yang sedang diproses (untuk spinner di tombolnya); `kendala` untuk form kendala.
  const [busyKey, setBusyKey] = useState<string | null>(null);

  /** Jalankan aksi sambil menandai tahap sibuk. */
  const run = useCallback(async (key: string, fn: () => Promise<boolean>) => {
    setBusyKey(key);
    try {
      return await fn();
    } finally {
      setBusyKey(null);
    }
  }, []);

  /** Tahap harus ada, belum selesai, dan sedang "giliran"-nya. */
  const activeStep = useCallback(
    (stepKey: string) => {
      const idx = order.steps.findIndex((s) => s.key === stepKey);
      if (idx < 0 || stepPosition(order.steps, idx) !== "active") {
        showAlert(
          "Belum bisa dikerjakan",
          "Tahap sebelumnya belum selesai, atau tahap ini sudah dikerjakan orang lain. Data akan diperbarui.",
          "error",
        );
        return null;
      }
      return order.steps[idx];
    },
    [order.steps, showAlert],
  );

  // ─── Upload foto (Mockup, Potong, Jahit/Produksi, Packing, Kirim, Terima) ──
  const uploadStep = useCallback(
    (stepKey: string, file: File) =>
      run(`step:${stepKey}`, async () => {
        const step = activeStep(stepKey);
        if (!step) return false;
        const url = await uploadProof(order, file, getDocumentLabel(stepKey), {
          highRes: stepKey === "mockup",
        });
        if (!url) return false;
        // Perbaikan setelah QC gagal: pekerja lama tetap tercatat, yang baru ditambahkan.
        const workers = Array.from(new Set([...(step.doneBy ?? []), currentUser.id]));
        return applyStepUpdate(order, stepKey, { ...doneFields(currentUser.name, workers), fileUrl: url }, {
          log: {
            category: "STATUS",
            event: "Tahap Selesai",
            ket: `${step.name} selesai — diupload oleh ${currentUser.name}`,
            meta: { url },
          },
        });
      }),
    [run, activeStep, order, uploadProof, applyStepUpdate, currentUser.id, currentUser.name],
  );

  // ─── Approval (pesanan utama) ──────────────────────────────────────────────
  const submitApproval = useCallback(
    (input: ApprovalInput) =>
      run("step:approval", async () => {
        const step = activeStep("approval");
        if (!step) return false;

        const problem = validateItems(input.items, productionTypes, input.mockups ?? {});
        if (problem) {
          showAlert("Item belum lengkap", problem, "error");
          return false;
        }
        // Mockup pesanan umum diupload dulu; urlnya disimpan di item.
        const withMockups = await uploadMockups(input.items, input.mockups ?? {}, (f, label) =>
          uploadProof(order, f, label, { highRes: true }),
        );
        if (!withMockups) return false;

        const items = cleanItems(withMockups);
        const total = sumItems(items);
        const catatan = input.catatan?.trim();
        return applyStepUpdate(
          order,
          "approval",
          { ...doneFields(currentUser.name, [currentUser.id]), note: catatan || undefined },
          {
            // Item → dasar gaji per item. jumlah pesanan mengikuti total item.
            fields: { items, jumlah: total, jenis_produksi: items[0].jenis_produksi },
            log: {
              category: "STATUS",
              event: "Approval Dibuat",
              ket: `${items.length} jenis, total ${total} pcs${catatan ? ` — ${catatan}` : ""}`,
              meta: { items },
            },
          },
        );
      }),
    [run, activeStep, order, productionTypes, uploadProof, applyStepUpdate, currentUser.id, currentUser.name, showAlert],
  );

  // ─── QC ────────────────────────────────────────────────────────────────────
  const submitQC = useCallback(
    (passed: boolean, notes: string) =>
      run(passed ? "qc:pass" : "qc:fail", async () => {
        const step = activeStep("qc");
        if (!step) return false;
        const catatan = notes.trim();

        if (passed) {
          return applyStepUpdate(
            order,
            "qc",
            {
              ...doneFields(currentUser.name, [currentUser.id]),
              qc: { passed: true, notes: catatan || "Lolos QC", checkedBy: currentUser.name },
            },
            {
              log: {
                category: "QC",
                event: "Lolos QC",
                ket: catatan || "Pesanan lolos pemeriksaan kualitas",
              },
            },
          );
        }

        if (!catatan) {
          showAlert("Catatan wajib diisi", "Tuliskan apa yang perlu diperbaiki sebelum menandai QC gagal.", "error");
          return false;
        }
        // QC gagal: QC tetap belum selesai, Produksi Massal dibuka lagi untuk diperbaiki.
        return applyStepUpdate(
          order,
          "qc",
          {
            isCompleted: false,
            completedAt: null,
            timestamp: new Date().toISOString(),
            qc: { passed: false, notes: catatan, checkedBy: currentUser.name },
          },
          {
            also: { produksi_massal: { isCompleted: false, completedAt: null, timestamp: undefined } },
            log: { category: "REVISI", event: "QC Gagal — Revisi", ket: catatan },
          },
        );
      }),
    [run, activeStep, order, applyStepUpdate, currentUser.id, currentUser.name, showAlert],
  );

  // ─── Batalkan tahap yang sudah selesai ─────────────────────────────────────
  const undoStep = useCallback(
    (stepKey: string) => {
      const step = order.steps.find((s) => s.key === stepKey);
      if (!step) return;
      showConfirm(
        "Batalkan tahap ini?",
        `Tahap "${step.name}" akan dibuka lagi (file/bukti dilepas dari pesanan). Lanjutkan?`,
        () => {
          void run(`step:${stepKey}`, () =>
            applyStepUpdate(order, stepKey, resetStep(step), {
              log: {
                category: step.type === "qc" ? "QC" : "STATUS",
                event: "Tahap Dibatalkan",
                ket: `${step.name} dibuka kembali`,
              },
            }),
          );
        },
      );
    },
    [order, showConfirm, run, applyStepUpdate],
  );

  // ─── Kendala ───────────────────────────────────────────────────────────────
  const addKendala = useCallback(
    (notes: string, file?: File | null) =>
      run("kendala:add", async () => {
        const text = notes.trim();
        if (!text) {
          showAlert("Catatan kosong", "Tuliskan kendalanya.", "error");
          return false;
        }
        let buktiFile: string | null = null;
        if (file) {
          buktiFile = await uploadProof(order, file, getDocumentLabel("kendala"));
          if (!buktiFile) return false;
        }
        const note: KendalaNote = {
          id: `k-${Date.now().toString(36)}`,
          notes: text,
          reportedBy: currentUser.name,
          timestamp: new Date().toISOString(),
          isResolved: false,
          buktiFile,
        };
        return applyKendalaUpdate(order, [...order.kendala, note], {
          category: "KENDALA",
          event: "Lapor Kendala",
          ket: text,
        });
      }),
    [run, order, uploadProof, applyKendalaUpdate, currentUser.name, showAlert],
  );

  const resolveKendala = useCallback(
    (kendalaId: string) =>
      run(`kendala:${kendalaId}`, async () => {
        const target = order.kendala.find((k) => k.id === kendalaId);
        if (!target) return false;
        const kendala = order.kendala.map((k) =>
          k.id === kendalaId
            ? { ...k, isResolved: true, resolvedBy: currentUser.name, resolvedTimestamp: new Date().toISOString() }
            : k,
        );
        return applyKendalaUpdate(order, kendala, {
          category: "KENDALA",
          event: "Kendala Diselesaikan",
          ket: target.notes,
        });
      }),
    [run, order, applyKendalaUpdate, currentUser.name],
  );

  const deleteKendala = useCallback(
    (kendalaId: string) => {
      const target = order.kendala.find((k) => k.id === kendalaId);
      if (!target) return;
      showConfirm("Hapus laporan kendala?", "Laporan ini akan dihapus dari pesanan.", () => {
        void run(`kendala:${kendalaId}`, () =>
          applyKendalaUpdate(
            order,
            order.kendala.filter((k) => k.id !== kendalaId),
            { category: "KENDALA", event: "Laporan Kendala Dihapus", ket: target.notes },
          ),
        );
      });
    },
    [order, showConfirm, run, applyKendalaUpdate],
  );

  const addKendalaBukti = useCallback(
    (kendalaId: string, file: File) =>
      run(`kendala:${kendalaId}`, async () => {
        const url = await uploadProof(order, file, getDocumentLabel("kendala"));
        if (!url) return false;
        const target = order.kendala.find((k) => k.id === kendalaId);
        return applyKendalaUpdate(
          order,
          order.kendala.map((k) => (k.id === kendalaId ? { ...k, buktiFile: url } : k)),
          {
            category: "KENDALA",
            event: "Bukti Kendala Ditambahkan",
            ket: target?.notes ?? "-",
            meta: { url },
          },
        );
      }),
    [run, order, uploadProof, applyKendalaUpdate],
  );

  return {
    busyKey,
    uploadStep,
    submitApproval,
    submitQC,
    undoStep,
    addKendala,
    resolveKendala,
    deleteKendala,
    addKendalaBukti,
  };
}
