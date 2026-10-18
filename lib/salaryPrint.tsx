// lib/salaryPrint.tsx
//
// Cetak satu/banyak slip gaji lewat iframe tersembunyi + dialog cetak browser
// ("Simpan sebagai PDF" untuk PDF). Pola sama dengan Sablon & cetak Catatan Rapat.
// Dipanggil dari SalaryView (browser saja).

import React from "react";
import { renderToStaticMarkup } from "react-dom/server";
import SalaryPrintSlip, { type SalarySlipRow } from "@/app/components/apps/SalaryPrintSlip";
import { COMPANY } from "@/lib/config";
import type { SalaryKategori } from "@/types/salary";

export interface SlipToPrint {
  name: string;
  kategori: SalaryKategori;
  rows: SalarySlipRow[];
  total: number;
  /** ISO bila sudah ditandai lunas */
  paidAt?: string | null;
}

const KATEGORI_LABEL: Record<SalaryKategori, string> = {
  produksi: "Produksi (PJ & Tim)",
  qc: "Tim QC & Packing",
  admin: "Bonus Admin",
};

const slug = (t: string) =>
  t
    .toUpperCase()
    .replace(/[^\p{L}\p{N}]+/gu, "-")
    .replace(/^-+|-+$/g, "");

/** Nama file PDF bawaan: SLIP-GAJI-OKTOBER-2026-NAMA (banyak slip → "N-ORANG"). */
export function slipFileTitle(slips: SlipToPrint[], monthName: string, year: number): string {
  const who = slips.length === 1 ? slug(slips[0].name) : `${slips.length}-ORANG`;
  return `SLIP-GAJI-${slug(monthName)}-${year}-${who}`;
}

/** Membuka dialog cetak. `onDone` dipanggil saat selesai/dibatalkan (untuk mematikan spinner). */
export function printSlips(
  slips: SlipToPrint[],
  periodLabel: string,
  monthName: string,
  year: number,
  onDone: () => void,
): boolean {
  if (slips.length === 0) return false;
  const fileTitle = slipFileTitle(slips, monthName, year);
  const logoUrl = `${window.location.origin}/logo.png`;

  const pagesHtml = slips
    .map((s) =>
      renderToStaticMarkup(
        <div className="salary-print-page">
          <SalaryPrintSlip
            companyName={COMPANY.name}
            companyAddress={COMPANY.address}
            logoUrl={logoUrl}
            recipientName={s.name}
            recipientRoleLabel={s.kategori === "qc" ? "Tim QC & Packing" : undefined}
            kategoriLabel={KATEGORI_LABEL[s.kategori]}
            periodLabel={periodLabel}
            rows={s.rows}
            totalAmount={s.total}
            paidAt={s.paidAt}
          />
        </div>,
      ),
    )
    .join("");

  const doc = `<!DOCTYPE html>
<html><head><meta charset="utf-8" /><title>${fileTitle}</title>
<style>
  * { margin: 0; padding: 0; box-sizing: border-box; -webkit-print-color-adjust: exact; print-color-adjust: exact; }
  body { font-family: Arial, Helvetica, sans-serif; }
  .salary-print-page { page-break-after: always; break-after: page; }
  .salary-print-page:last-child { page-break-after: auto; break-after: auto; }
  @page { size: 210mm 297mm portrait; margin: 14mm 16mm; }
</style></head><body>${pagesHtml}</body></html>`;

  const iframe = document.createElement("iframe");
  Object.assign(iframe.style, { position: "fixed", right: "0", bottom: "0", width: "0", height: "0", border: "0" });
  iframe.setAttribute("aria-hidden", "true");
  document.body.appendChild(iframe);

  const originalTitle = document.title;
  let cleaned = false;
  const cleanup = () => {
    if (cleaned) return;
    cleaned = true;
    document.title = originalTitle;
    onDone();
    setTimeout(() => iframe.parentNode?.removeChild(iframe), 500);
  };

  const idoc = iframe.contentWindow?.document;
  if (!idoc) {
    cleanup();
    return false;
  }
  idoc.open();
  idoc.write(doc);
  idoc.close();
  if (iframe.contentWindow) iframe.contentWindow.onafterprint = cleanup;

  // Tunggu logo termuat (maks. 3 detik) sebelum dialog cetak dibuka
  const waitImages = () =>
    Promise.race([
      Promise.all(
        Array.from(idoc.images).map((img) =>
          img.complete
            ? Promise.resolve()
            : new Promise<void>((r) => {
                img.onload = () => r();
                img.onerror = () => r();
              }),
        ),
      ),
      new Promise<void>((r) => setTimeout(r, 3000)),
    ]);

  setTimeout(async () => {
    await waitImages();
    document.title = fileTitle; // Chrome memakai judul halaman utama sebagai nama file PDF
    iframe.contentWindow?.focus();
    iframe.contentWindow?.print();
    setTimeout(cleanup, 30000); // cadangan bila onafterprint tidak terpanggil
  }, 100);
  return true;
}
