// app/components/finance/ExportButton.tsx
//
// Tombol "Ekspor Excel". Urutan: (1) catat ke log audit lewat /api/finance/export-log, (2) baru buat file .xlsx
// di browser. Bila pencatatan gagal, file TIDAK dibuat — jadi setiap ekspor yang terjadi pasti punya jejak.
"use client";

import React, { useState } from "react";
import { Download, Loader2 } from "lucide-react";
import { useDialog } from "@/app/components/ui/DialogProvider";
import { postJson, errMsg } from "@/hooks/useFinanceApi";
import { downloadXlsx, type SheetSpec } from "@/lib/finance/excel";
import { smallGhostBtnCls } from "./ui";

export interface ExportPayload {
  filename: string;
  sheets: SheetSpec[];
  /** jumlah baris data yang diekspor (untuk log audit) */
  rowCount: number;
}

export default function ExportButton({
  scope,
  build,
  disabled,
}: {
  /** nama lingkup untuk log audit, mis. "Tagihan" */
  scope: string;
  /** dipanggil saat diklik; null = tidak ada data untuk diekspor */
  build: () => ExportPayload | null;
  disabled?: boolean;
}) {
  const { notify } = useDialog();
  const [busy, setBusy] = useState(false);

  const click = async () => {
    const payload = build();
    if (!payload || payload.rowCount === 0) {
      notify("Tidak ada data untuk diekspor pada tampilan ini.", { title: "Ekspor Excel" });
      return;
    }
    setBusy(true);
    try {
      try {
        await postJson("/api/finance/export-log", { scope, row_count: payload.rowCount });
      } catch (e) {
        notify(`${errMsg(e)} File tidak dibuat karena ekspor harus tercatat di log audit.`, { title: "Gagal mencatat ekspor" });
        return;
      }
      await downloadXlsx(payload.filename, payload.sheets);
    } catch (e) {
      notify(errMsg(e), { title: "Gagal membuat file Excel" });
    } finally {
      setBusy(false);
    }
  };

  return (
    <button type="button" onClick={click} disabled={busy || disabled} className={smallGhostBtnCls}>
      {busy ? <Loader2 className="w-3 h-3 animate-spin" /> : <Download className="w-3 h-3" />} Ekspor Excel
    </button>
  );
}
