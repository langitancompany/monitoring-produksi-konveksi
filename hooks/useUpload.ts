// hooks/useUpload.ts
//
// Upload foto/file bukti ke storage. (Diadopsi dari useUpload Sablon, tetapi
// dibuat lebih sederhana: hook ini HANYA mengunggah dan mengembalikan URL.
// Mengubah tahap pesanan dilakukan pemanggil lewat applyStepUpdate.)
//
// Bucket `production-proofs` dipakai bersama Sablon. Kebijakannya berlaku untuk
// seluruh bucket (bukan per folder), dan cron cleanup-storage milik Sablon
// menghapus file yang tidak dikenalnya — karena itu SEMUA file Konveksi ada di
// bawah awalan `konveksi/{orderId}/…` (3 tingkat, di luar jangkauan pemindaian
// cleanup Sablon yang hanya 2 tingkat). Jangan ubah awalan ini.

import { useState, useCallback } from "react";
import { SupabaseClient } from "@supabase/supabase-js";
import imageCompression from "browser-image-compression";
import { compressMockup, extensionForType, fmtBytes, MOCKUP_FALLBACK_MAX_MB } from "@/lib/imageCompress";
import type { UserData } from "@/types";
import type { Order } from "@/types/order";
import { generateStorageFilename } from "@/lib/utils";
import type { LogCategory } from "@/hooks/useOrders";

export const STORAGE_BUCKET = "production-proofs";
const MAX_PDF_MB = 15;

type OrderRef = Pick<Order, "id" | "kode_produksi" | "status">;

interface Props {
  supabase: SupabaseClient;
  currentUser: (UserData & { id: string }) | null;
  writeLog: (p: {
    order: OrderRef;
    category: LogCategory;
    event: string;
    ket?: string;
    newVal?: string;
    meta?: Record<string, unknown>;
  }) => Promise<void>;
  showAlert: (title: string, message: string, type?: "success" | "error") => void;
}

/** HHmmss lokal — supaya nama file unik (tidak menimpa & tidak kena cache CDN). */
function clockSuffix(d = new Date()): string {
  const p = (n: number) => String(n).padStart(2, "0");
  return `${p(d.getHours())}${p(d.getMinutes())}${p(d.getSeconds())}`;
}

function extensionOf(file: File): string {
  const fromName = file.name.includes(".") ? file.name.split(".").pop() : "";
  if (fromName) return fromName.toLowerCase();
  if (file.type === "application/pdf") return "pdf";
  if (file.type === "image/png") return "png";
  return "jpg";
}

export function useUpload({ supabase, currentUser, writeLog, showAlert }: Props) {
  const [isUploading, setIsUploading] = useState(false);

  /**
   * Unggah satu file bukti. Mengembalikan URL publik, atau null bila gagal
   * (alasan sudah ditampilkan lewat showAlert).
   *  - label     : jenis dokumen untuk nama file, mis. "Packing" (lihat getDocumentLabel)
   *  - allowPdf  : Approval boleh PDF; tahap lain hanya gambar
   */
  const uploadProof = useCallback(
    async (
      order: OrderRef,
      file: File,
      label: string,
      // highRes = gambar mockup: dikompres khusus (lihat lib/imageCompress.ts) supaya kecil tapi tetap layak cetak.
      opts: { allowPdf?: boolean; highRes?: boolean } = {},
    ): Promise<string | null> => {
      if (!currentUser) return null;

      const isImage = file.type.startsWith("image/");
      const isPdf = file.type === "application/pdf";
      if (!isImage && !(opts.allowPdf && isPdf)) {
        showAlert(
          "Format tidak didukung",
          opts.allowPdf ? "Pilih file gambar (JPG/PNG) atau PDF." : "Pilih file gambar (JPG/PNG).",
          "error",
        );
        return null;
      }
      if (isPdf && file.size > MAX_PDF_MB * 1024 * 1024) {
        showAlert("File terlalu besar", `PDF maksimal ${MAX_PDF_MB} MB. Kecilkan ukurannya dulu.`, "error");
        return null;
      }

      setIsUploading(true);
      try {
        let processed = file;
        let sizeMeta: { sebelum: number; sesudah: number } | null = null;
        if (isImage && opts.highRes) {
          const r = await compressMockup(file);
          if (!r.compressed && file.size > MOCKUP_FALLBACK_MAX_MB * 1024 * 1024) {
            showAlert(
              "Gambar gagal dikompres",
              `Gambar ini ${fmtBytes(file.size)} dan tidak bisa dikecilkan otomatis. Simpan sebagai JPG/PNG yang lebih kecil dari ${MOCKUP_FALLBACK_MAX_MB} MB, lalu coba lagi.`,
              "error",
            );
            return null;
          }
          processed = r.file;
          sizeMeta = { sebelum: r.before, sesudah: r.after };
        } else if (isImage) {
          try {
            processed = await imageCompression(file, { maxSizeMB: 1, maxWidthOrHeight: 1920, useWebWorker: true });
          } catch (err) {
            console.error("Kompresi gagal, memakai file asli", err);
          }
        }

        // Ekstensi mengikuti isi file hasil kompresi (mockup selalu JPEG), bukan nama file asli.
        const ext = (isImage && extensionForType(processed.type)) || extensionOf(file);
        const baseName = generateStorageFilename(`${label}_${clockSuffix()}`, order.kode_produksi);
        const path = `konveksi/${order.id}/${baseName}.${ext}`;

        const { error } = await supabase.storage
          .from(STORAGE_BUCKET)
          .upload(path, processed, { upsert: false, contentType: processed.type || file.type });
        if (error) {
          showAlert("Gagal upload", error.message, "error");
          return null;
        }

        const { data } = supabase.storage.from(STORAGE_BUCKET).getPublicUrl(path);

        await writeLog({
          order,
          category: "FILE",
          event: `Upload ${label}`,
          ket: `Nama file: ${baseName}.${ext}${sizeMeta ? ` (${fmtBytes(sizeMeta.sebelum)} → ${fmtBytes(sizeMeta.sesudah)})` : ""}`,
          meta: { url: data.publicUrl, path, ...(sizeMeta ?? {}) },
        });

        return data.publicUrl;
      } finally {
        setIsUploading(false);
      }
    },
    [supabase, currentUser, writeLog, showAlert],
  );

  return { isUploading, uploadProof };
}
