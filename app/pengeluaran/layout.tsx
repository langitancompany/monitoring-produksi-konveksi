// app/pengeluaran/layout.tsx
//
// Aplikasi terpisah "Catat Pengeluaran": halaman ini punya manifest PWA SENDIRI (id/scope/start_url /pengeluaran),
// nama, dan ikon sendiri, sehingga "Tambah ke Layar Utama" membuat ikon kedua yang langsung membuka form
// catat pengeluaran. Kode dan database tetap satu dengan aplikasi utama.

import type { Metadata, Viewport } from "next";

export const metadata: Metadata = {
  title: "LCO Pengeluaran",
  description: "Catat pengeluaran Konveksi Langitan.co.",
  applicationName: "LCO Pengeluaran",
  manifest: "/pengeluaran/manifest.webmanifest",
  icons: {
    icon: [
      { url: "/icons/pengeluaran-192.png", sizes: "192x192", type: "image/png" },
      { url: "/icons/pengeluaran-512.png", sizes: "512x512", type: "image/png" },
    ],
    // "?v=1" memaksa iPhone mengunduh ulang ikon bila file diganti (naikkan angkanya).
    apple: [{ url: "/icons/pengeluaran-apple-touch.png?v=1", sizes: "180x180", type: "image/png" }],
  },
  appleWebApp: { capable: true, title: "LCO Pengeluaran", statusBarStyle: "black" },
  formatDetection: { telephone: false },
};

export const viewport: Viewport = {
  themeColor: "#000000",
  viewportFit: "cover",
};

export default function PengeluaranLayout({ children }: { children: React.ReactNode }) {
  return children;
}
