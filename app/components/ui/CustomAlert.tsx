// app/components/ui/CustomAlert.tsx

import React from "react";
import {
  AlertCircle,
  AlertTriangle,
  CheckCircle,
  Trash2,
  X,
} from "lucide-react";

export interface AlertState {
  isOpen: boolean;
  title: string;
  message: string;
  type: "success" | "error" | "confirm";
  onConfirm?: () => void;
}

interface CustomAlertProps {
  alertState: AlertState;
  closeAlert: () => void;
}

export default function CustomAlert({
  alertState,
  closeAlert,
}: CustomAlertProps) {
  if (!alertState.isOpen) return null;

  // Pemilihan Icon dan Warna berdasarkan tipe
  const getConfig = () => {
    switch (alertState.type) {
      case "error":
        return {
          icon: <AlertCircle className="w-6 h-6" />,
          colorClass:
            "bg-red-100 text-red-600 dark:bg-red-900/30 dark:text-red-400",
          btnClass: "bg-red-600 hover:bg-red-700",
        };
      case "confirm":
        return {
          icon: <AlertTriangle className="w-6 h-6" />,
          colorClass:
            "bg-zinc-100 text-zinc-600 dark:bg-zinc-800 dark:text-zinc-400",
          btnClass: "bg-[#124540] hover:bg-[#0d332f]",
        };
      default:
        return {
          icon: <CheckCircle className="w-6 h-6" />,
          colorClass:
            "bg-emerald-100 text-emerald-600 dark:bg-emerald-900/30 dark:text-emerald-400",
          btnClass: "bg-emerald-600 hover:bg-emerald-700",
        };
    }
  };

  const config = getConfig();

  return (
    <div className="fixed inset-0 z-100 flex items-center justify-center bg-black/70 p-4">
      <div className="bg-white dark:bg-zinc-950 border border-zinc-200 dark:border-zinc-800 rounded-xl p-6 w-full max-w-sm text-center relative overflow-hidden">
        {/* Tombol Close di Pojok (Opsional) */}
        <button
          onClick={closeAlert}
          className="absolute top-4 right-4 text-zinc-400 hover:text-zinc-600 dark:hover:text-zinc-200 transition-colors duration-150"
        >
          <X className="w-4 h-4" />
        </button>

        {/* Lingkaran Icon */}
        <div
          className={`w-14 h-14 ${config.colorClass} rounded-full flex items-center justify-center mx-auto mb-4`}
        >
          {config.icon}
        </div>

        {/* Judul & Pesan */}
        <h4 className="text-base font-semibold text-zinc-900 dark:text-zinc-100 tracking-tight mb-2">
          {alertState.title}
        </h4>
        <p className="text-xs text-zinc-500 dark:text-zinc-400 mb-8 leading-relaxed">
          {alertState.message}
        </p>

        {/* Tombol Aksi */}
        <div className="flex gap-3">
          {alertState.type === "confirm" && (
            <button
              onClick={closeAlert}
              className="flex-1 py-3 rounded-md border border-zinc-200 dark:border-zinc-800 text-zinc-600 dark:text-zinc-400 font-semibold text-sm hover:bg-zinc-50 dark:hover:bg-zinc-900 transition-colors duration-150"
            >
              Batal
            </button>
          )}
          <button
            onClick={() => {
              if (alertState.type === "confirm" && alertState.onConfirm) {
                alertState.onConfirm();
              }
              closeAlert();
            }}
            className={`flex-1 py-3 rounded-md text-white font-semibold text-sm transition-colors duration-150 ${config.btnClass}`}
          >
            {alertState.type === "confirm" ? "Ya, Lanjutkan" : "Mengerti"}
          </button>
        </div>
      </div>
    </div>
  );
}
