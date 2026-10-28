"use client";

// app/approval/[id]/page.tsx
// Halaman Form Approval otomatis untuk satu order. Hanya bisa dibuka user
// yang sudah login (query pakai sesi Supabase, tunduk pada RLS).
//
// PDF dibuat langsung di browser (html-to-image + jsPDF), BUKAN lewat
// window.print(). window.print() sering tidak berfungsi di browser HP
// (Chrome Android, iOS Safari, browser di dalam WhatsApp/Instagram, PWA),
// sehingga tombol terasa "mati". Cara ini sama dengan Invoice di modul Keuangan.

import React, { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useParams, useRouter } from "next/navigation";
import { Download, Loader2, Printer, Share2, X } from "lucide-react";
import { createClient } from "@/lib/supabase/client";
import type { Order, ProductionTypeData } from "@/types/order";
import ApprovalSheet, { SHEET_W, SHEET_H, approvalPageCount } from "@/app/components/orders/ApprovalSheet";

// A4 portrait (mm)
const PDF_W_MM = 210;
const PDF_H_MM = 297;
// jarak antar halaman di layar saja (px)
const PAGE_GAP = 16;

function isAppleDevice(): boolean {
  if (typeof navigator === "undefined") return false;
  const ua = navigator.userAgent;
  return (
    /iPad|iPhone|iPod/.test(ua) ||
    // iPadOS 13+ mengaku sebagai Mac
    (navigator.platform === "MacIntel" && navigator.maxTouchPoints > 1) ||
    // Safari desktop
    (/Safari/.test(ua) && !/Chrome|Chromium|Android/.test(ua))
  );
}

export default function ApprovalPage() {
  const params = useParams<{ id: string }>();
  const router = useRouter();
  const id = params?.id;

  const [order, setOrder] = useState<Order | null>(null);
  const [types, setTypes] = useState<ProductionTypeData[]>([]);
  const [pjName, setPjName] = useState("");
  const [teamName, setTeamName] = useState("");
  const [loading, setLoading] = useState(true);
  const [scale, setScale] = useState(1);
  const [busy, setBusy] = useState<null | "pdf" | "share">(null);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);
  const [canShareFile, setCanShareFile] = useState(false);

  // Node ukuran asli (794x1123) yang dipotret jadi PDF. Dipisah dari wrapper
  // yang diskala (transform) supaya hasil PDF selalu ukuran penuh.
  const pageRefs = useRef<Array<HTMLDivElement | null>>([]);

  useEffect(() => {
    if (!id) return;
    const supabase = createClient();
    (async () => {
      const { data } = await supabase.from("orders").select("*").eq("id", id).maybeSingle();
      const o = (data as Order) ?? null;
      setOrder(o);
      if (o) {
        const [t, u, tm] = await Promise.all([
          supabase.from("production_types").select("*"),
          o.assigned_to ? supabase.from("users").select("name").eq("id", o.assigned_to).maybeSingle() : Promise.resolve({ data: null }),
          o.team_id ? supabase.from("teams").select("name").eq("id", o.team_id).maybeSingle() : Promise.resolve({ data: null }),
        ]);
        setTypes((t.data as ProductionTypeData[]) ?? []);
        setPjName((u.data as { name?: string } | null)?.name ?? "");
        setTeamName((tm.data as { name?: string } | null)?.name ?? "");
      }
      setLoading(false);
    })();
  }, [id]);

  // Skala tampilan layar (PDF/cetak selalu skala 1)
  useEffect(() => {
    const fit = () => setScale(Math.min(1, (window.innerWidth - 24) / SHEET_W));
    fit();
    window.addEventListener("resize", fit);
    return () => window.removeEventListener("resize", fit);
  }, []);

  useEffect(() => {
    if (order) document.title = `Form Approval ${order.kode_produksi}`;
  }, [order]);

  // Cek dukungan "Bagikan file" (umumnya HP). Dicek di client saja.
  useEffect(() => {
    try {
      // eslint-disable-next-line react-hooks/set-state-in-effect
      setCanShareFile(
        typeof navigator !== "undefined" &&
          typeof navigator.canShare === "function" &&
          typeof File !== "undefined" &&
          navigator.canShare({
            files: [new File([""], "x.pdf", { type: "application/pdf" })],
          }),
      );
    } catch {
      setCanShareFile(false);
    }
  }, []);

  const fileName = order
    ? `Form Approval ${order.kode_produksi}${
        order.nama_pemesan ? ` - ${order.nama_pemesan}` : ""
      }.pdf`.replace(/[\\/:*?"<>|]/g, "-")
    : "Form Approval.pdf";

  /** Potret tiap halaman form (794x1123) -> PDF A4 portrait, satu halaman PDF per halaman form. */
  const makePdf = useCallback(async (): Promise<Blob> => {
    const nodes = pageRefs.current.filter((n): n is HTMLDivElement => !!n);
    if (nodes.length === 0) throw new Error("Form belum siap, coba lagi sebentar lagi.");

    const [{ toJpeg }, { default: jsPDF }] = await Promise.all([
      import("html-to-image"),
      import("jspdf"),
    ]);

    // Pastikan banner & mockup sudah selesai dimuat sebelum dipotret.
    await Promise.all(
      nodes.flatMap((node) =>
        Array.from(node.querySelectorAll("img")).map((img) =>
          img.complete
            ? Promise.resolve()
            : new Promise<void>((resolve) => {
                img.addEventListener("load", () => resolve());
                img.addEventListener("error", () => resolve());
              }),
        ),
      ),
    );
    try {
      await document.fonts?.ready;
    } catch {
      /* abaikan */
    }

    const opts = {
      pixelRatio: 2,
      quality: 0.95,
      cacheBust: true,
      backgroundColor: "#ffffff",
      width: SHEET_W,
      height: SHEET_H,
    };

    const pdf = new jsPDF({ orientation: "portrait", unit: "mm", format: "a4" });
    for (let i = 0; i < nodes.length; i++) {
      // Safari/iOS: render pertama sering melewatkan gambar. Render pemanasan
      // dulu, hasil yang dipakai adalah render kedua.
      if (isAppleDevice()) {
        try {
          await toJpeg(nodes[i], opts);
        } catch {
          /* abaikan, render berikutnya yang menentukan */
        }
      }
      const dataUrl = await toJpeg(nodes[i], opts);
      if (i > 0) pdf.addPage("a4", "portrait");
      pdf.addImage(dataUrl, "JPEG", 0, 0, PDF_W_MM, PDF_H_MM);
    }
    return pdf.output("blob");
  }, []);

  const saveBlob = useCallback(
    (blob: Blob) => {
      const url = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      a.download = fileName;
      document.body.appendChild(a);
      a.click();
      a.remove();
      setTimeout(() => URL.revokeObjectURL(url), 30000);
    },
    [fileName],
  );

  const onSavePdf = async () => {
    if (busy) return;
    setErrorMsg(null);
    setBusy("pdf");
    try {
      saveBlob(await makePdf());
    } catch (e) {
      setErrorMsg(
        `Gagal membuat PDF: ${
          e instanceof Error ? e.message : "terjadi kesalahan"
        }`,
      );
    } finally {
      setBusy(null);
    }
  };

  const onShare = async () => {
    if (busy) return;
    setErrorMsg(null);
    setBusy("share");
    try {
      const blob = await makePdf();
      try {
        const file = new File([blob], fileName, { type: "application/pdf" });
        await navigator.share({ files: [file], title: fileName });
      } catch (e) {
        if (e instanceof DOMException && e.name === "AbortError") return; // user menutup menu bagikan
        // Menu bagikan ditolak browser → simpan sebagai unduhan biasa.
        saveBlob(blob);
      }
    } catch (e) {
      setErrorMsg(
        `Gagal membagikan PDF: ${
          e instanceof Error ? e.message : "terjadi kesalahan"
        }`,
      );
    } finally {
      setBusy(null);
    }
  };

  const onPrint = () => {
    try {
      window.print();
    } catch {
      setErrorMsg(
        'Cetak langsung tidak didukung di browser ini. Gunakan tombol "Simpan PDF".',
      );
    }
  };

  // window.close() hanya jalan kalau tab dibuka lewat script; kalau diblokir
  // browser (umum di HP), kembali ke halaman sebelumnya / beranda.
  const onClose = () => {
    window.close();
    setTimeout(() => {
      if (window.history.length > 1) router.back();
      else router.push("/");
    }, 200);
  };

  const catatanApproval = order?.steps?.find((st) => st.key === "approval")?.note ?? undefined;
  const pageCount = useMemo(
    () => (order ? approvalPageCount(order, types, catatanApproval) : 1),
    [order, types, catatanApproval],
  );

  if (loading) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-zinc-100 dark:bg-zinc-950">
        <Loader2 className="w-8 h-8 animate-spin text-zinc-400" />
      </div>
    );
  }

  if (!order) {
    return (
      <div className="min-h-screen flex flex-col items-center justify-center gap-2 bg-zinc-100 dark:bg-zinc-950 text-zinc-600 dark:text-zinc-300 p-6 text-center">
        <p className="font-semibold">Form approval tidak ditemukan.</p>
        <p className="text-sm text-zinc-500">
          Pastikan kamu sudah login dan order masih ada.
        </p>
      </div>
    );
  }

  const btnPrimary =
    "flex items-center gap-1.5 bg-zinc-900 dark:bg-white text-white dark:text-zinc-900 px-3 py-1.5 rounded-md text-xs font-semibold disabled:opacity-60";
  const btnDanger =
    "flex items-center gap-1.5 bg-red-600 hover:bg-red-700 active:bg-red-800 dark:bg-red-500 dark:hover:bg-red-600 text-white px-3 py-1.5 rounded-md text-xs font-semibold transition-colors duration-150";
  const btnGhost =
    "flex items-center gap-1.5 border border-zinc-300 dark:border-zinc-700 text-zinc-700 dark:text-zinc-200 px-3 py-1.5 rounded-md text-xs font-semibold disabled:opacity-60";

  return (
    <div className="min-h-screen bg-zinc-200 dark:bg-zinc-900 py-4 print:bg-white print:py-0">
      <style>{`
        @page { size: A4 portrait; margin: 0; }
        .approval-page { box-shadow: 0 1px 3px rgba(0,0,0,.14), 0 10px 30px rgba(0,0,0,.12); }
        @media print {
          html, body { background: #fff !important; }
          .no-print { display: none !important; }
          .sheet-wrap { width: ${SHEET_W}px !important; height: auto !important; margin: 0 !important; }
          .sheet-scale { transform: none !important; }
          .approval-page { margin-bottom: 0 !important; box-shadow: none !important; break-after: page; page-break-after: always; }
          .approval-page:last-child { break-after: auto; page-break-after: auto; }
          .approval-page, .approval-page * {
            -webkit-print-color-adjust: exact;
            print-color-adjust: exact;
          }
        }
      `}</style>

      <div className="no-print px-3 mb-3 max-w-[794px] mx-auto">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <div className="text-sm font-semibold text-zinc-700 dark:text-zinc-200 truncate">
            Form Approval · {order.kode_produksi}
          </div>
          <div className="flex flex-wrap gap-2">
            <button
              onClick={onSavePdf}
              disabled={!!busy}
              className={btnPrimary}
            >
              {busy === "pdf" ? (
                <Loader2 className="w-4 h-4 animate-spin" />
              ) : (
                <Download className="w-4 h-4" />
              )}
              {busy === "pdf" ? "Membuat PDF..." : "Simpan PDF"}
            </button>
            {canShareFile && (
              <button onClick={onShare} disabled={!!busy} className={btnGhost}>
                {busy === "share" ? (
                  <Loader2 className="w-4 h-4 animate-spin" />
                ) : (
                  <Share2 className="w-4 h-4" />
                )}
                Bagikan
              </button>
            )}
            <button
              onClick={onPrint}
              disabled={!!busy}
              className={`${btnGhost} hidden md:flex`}
            >
              <Printer className="w-4 h-4" /> Cetak
            </button>
            <button onClick={onClose} className={btnDanger}>
              <X className="w-4 h-4" /> Tutup
            </button>
          </div>
        </div>
        {errorMsg && (
          <div className="mt-2 text-xs text-red-600 dark:text-red-400">
            {errorMsg}
          </div>
        )}
      </div>

      <div
        className="sheet-wrap mx-auto"
        style={{ width: SHEET_W * scale, height: (pageCount * SHEET_H + (pageCount - 1) * PAGE_GAP) * scale }}
      >
        <div
          className="sheet-scale"
          style={{
            width: SHEET_W,
            transform: `scale(${scale})`,
            transformOrigin: "top left",
          }}
        >
          {/* Tiap halaman adalah node ukuran asli (tanpa transform) yang dipotret jadi satu halaman PDF */}
          <ApprovalSheet
            order={order}
            productionTypes={types}
            pjName={pjName}
            teamName={teamName}
            catatanApproval={catatanApproval}
            gap={PAGE_GAP}
            pageRef={(el, i) => {
              pageRefs.current[i] = el;
            }}
          />
        </div>
      </div>
    </div>
  );
}
