// lib/imageCompress.ts
//
// Kompres gambar mockup sebelum diupload ke Supabase Storage.
//
// Tujuannya file kecil tapi tetap tajam saat dicetak di Form Approval (A4):
//   • sisi terpanjang maksimal 1600 px. Area mockup di kartu cetak hanya sekitar 9 × 3,6 cm,
//     dan bila gambar dicetak satu halaman A4 penuh pun 1600 px ≈ 190 dpi (masih tajam).
//   • JPEG kualitas 0,85 (hampir tidak terlihat bedanya dengan aslinya), target ≤ 0,8 MB.
//   • selalu JPEG, supaya hasilnya konsisten di semua browser (Safari tidak bisa membuat WebP).
//     PNG transparan menjadi berlatar putih.
//   • foto ponsel yang berukuran 5–12 MB biasanya menjadi sekitar 200–600 KB.
//   • gambar yang sudah kecil dan tidak perlu diperkecil dibiarkan apa adanya (tidak diubah jadi lebih besar).

import imageCompression from "browser-image-compression";

export const MOCKUP_MAX_SIDE = 1600;
export const MOCKUP_MAX_MB = 0.8;
export const MOCKUP_QUALITY = 0.85;

/** Batas ukuran file asli bila kompresi gagal (mis. format tak terbaca browser). */
export const MOCKUP_FALLBACK_MAX_MB = 5;

export interface CompressResult {
  file: File;
  /** ukuran asli & hasil (byte), untuk dicatat di log */
  before: number;
  after: number;
  /** false bila kompresi gagal dan file asli dipakai */
  compressed: boolean;
}

export async function compressMockup(file: File): Promise<CompressResult> {
  const before = file.size;
  try {
    const out = await imageCompression(file, {
      maxSizeMB: MOCKUP_MAX_MB,
      maxWidthOrHeight: MOCKUP_MAX_SIDE,
      initialQuality: MOCKUP_QUALITY,
      fileType: "image/jpeg",
      useWebWorker: true,
    });
    // JPEG kecil yang sudah efisien bisa jadi malah membesar → pakai file asli.
    if (out.size >= before && file.type === "image/jpeg") {
      return { file, before, after: before, compressed: true };
    }
    return { file: out, before, after: out.size, compressed: true };
  } catch (err) {
    console.error("Kompresi mockup gagal", err);
    return { file, before, after: before, compressed: false };
  }
}

/** Ekstensi file sesuai isi hasil kompresi (bukan nama file asli yang bisa .png / .heic). */
export function extensionForType(type: string): string | null {
  if (type === "image/jpeg") return "jpg";
  if (type === "image/png") return "png";
  if (type === "image/webp") return "webp";
  return null;
}

export const fmtBytes = (n: number) => (n >= 1024 * 1024 ? `${(n / 1024 / 1024).toFixed(1)} MB` : `${Math.round(n / 1024)} KB`);
