// lib/finance/printFrame.ts
//
// Cetak lewat iframe tersembunyi untuk dokumen yang di-style dengan Tailwind (invoice). Iframe adalah dokumen
// terpisah, jadi stylesheet halaman utama harus disalin ke dalamnya agar class Tailwind berlaku. Fungsi ini juga
// menunggu CSS, font, dan gambar (kop/tanda tangan) selesai dimuat sebelum memanggil print(). Browser saja.

export interface PrintHtmlPagesOptions {
  title: string;
  /** HTML halaman-halaman yang akan dicetak. */
  pagesHtml: string;
  /** CSS tambahan khusus ukuran kertas (@page dsb.). */
  pageCss: string;
  /** Dipanggil saat proses selesai / dibatalkan / gagal. */
  onDone: () => void;
  onError?: (message: string) => void;
}

/** Judul dokumen dipasang ke HTML mentah: wajib di-escape agar tidak bisa menyisipkan tag/skrip. */
export const escapeHtml = (s: string): string =>
  s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;").replace(/'/g, "&#39;");

function collectParentStyles(): string {
  const parts: string[] = [];
  document.querySelectorAll<HTMLElement>('link[rel="stylesheet"], style').forEach((el) => {
    if (el instanceof HTMLLinkElement) {
      parts.push(`<link rel="stylesheet" href="${escapeHtml(el.href)}" />`);
    } else {
      parts.push(`<style>${el.textContent ?? ""}</style>`);
    }
  });
  return parts.join("\n");
}

export function printHtmlPages({ title, pagesHtml, pageCss, onDone, onError }: PrintHtmlPagesOptions) {
  const printDocument = `<!DOCTYPE html>
<html lang="id" style="color-scheme: light;">
  <head>
    <meta charset="utf-8" />
    <title>${escapeHtml(title)}</title>
    ${collectParentStyles()}
    <style>
      html, body { background: #fff !important; color: #27272a; margin: 0; padding: 0; }
      body { font-family: Arial, Helvetica, sans-serif; }
      * { -webkit-print-color-adjust: exact; print-color-adjust: exact; }
      ${pageCss}
    </style>
  </head>
  <body>${pagesHtml}</body>
</html>`;

  const iframe = document.createElement("iframe");
  Object.assign(iframe.style, { position: "fixed", right: "0", bottom: "0", width: "0", height: "0", border: "0" });
  iframe.setAttribute("aria-hidden", "true");
  document.body.appendChild(iframe);

  let finished = false;
  const cleanup = () => {
    if (finished) return;
    finished = true;
    onDone();
    setTimeout(() => iframe.parentNode?.removeChild(iframe), 500);
  };

  const win = iframe.contentWindow;
  const doc = win?.document;
  if (!win || !doc) {
    iframe.parentNode?.removeChild(iframe);
    onDone();
    onError?.("Gagal menyiapkan dokumen cetak. Coba lagi.");
    return;
  }

  doc.open();
  doc.write(printDocument);
  doc.close();

  const waitForAssets = async () => {
    const links = Array.from(doc.querySelectorAll<HTMLLinkElement>('link[rel="stylesheet"]'));
    await Promise.all(
      links.map(
        (l) =>
          new Promise<void>((resolve) => {
            if (l.sheet) return resolve();
            l.addEventListener("load", () => resolve());
            l.addEventListener("error", () => resolve());
          }),
      ),
    );
    await Promise.all(
      Array.from(doc.images).map(
        (img) =>
          new Promise<void>((resolve) => {
            if (img.complete) return resolve();
            img.addEventListener("load", () => resolve());
            img.addEventListener("error", () => resolve());
          }),
      ),
    );
    try {
      await doc.fonts?.ready;
    } catch {
      /* abaikan */
    }
  };

  let printed = false;
  const triggerPrint = () => {
    if (printed) return;
    printed = true;
    win.focus();
    win.print();
  };

  // Batas tunggu maksimum supaya tidak menggantung bila ada aset macet.
  const timeout = new Promise<void>((resolve) => setTimeout(resolve, 6000));
  Promise.race([waitForAssets(), timeout]).then(() => {
    win.requestAnimationFrame(() => setTimeout(triggerPrint, 100)); // satu frame agar layout selesai
  });

  win.onafterprint = cleanup;
  setTimeout(cleanup, 120000); // cadangan bila 'afterprint' tidak terpicu
}
