// GET /pengeluaran/manifest.webmanifest -> manifest PWA khusus aplikasi Catat Pengeluaran.
// id + scope berbeda dari aplikasi utama (id "/"), jadi Android/Chrome memasangnya sebagai aplikasi terpisah.
// Route handler (bukan app/manifest.ts) karena konvensi manifest.ts hanya berlaku di root.
import { NextResponse } from "next/server";

export const dynamic = "force-static";

export function GET() {
  const manifest = {
    id: "/pengeluaran",
    name: "LCO Pengeluaran - Catat Pengeluaran",
    short_name: "LCO Pengeluaran",
    description: "Catat pengeluaran Konveksi Langitan.co.",
    start_url: "/pengeluaran",
    scope: "/pengeluaran",
    display: "standalone",
    orientation: "portrait",
    background_color: "#000000",
    theme_color: "#000000",
    lang: "id",
    icons: [
      { src: "/icons/pengeluaran-192.png", sizes: "192x192", type: "image/png", purpose: "any" },
      { src: "/icons/pengeluaran-512.png", sizes: "512x512", type: "image/png", purpose: "any" },
      { src: "/icons/pengeluaran-maskable-192.png", sizes: "192x192", type: "image/png", purpose: "maskable" },
      { src: "/icons/pengeluaran-maskable-512.png", sizes: "512x512", type: "image/png", purpose: "maskable" },
    ],
  };
  return new NextResponse(JSON.stringify(manifest), {
    headers: { "Content-Type": "application/manifest+json; charset=utf-8" },
  });
}
