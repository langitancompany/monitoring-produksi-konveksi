// app/components/finance/tabs/GuideTab.tsx
//
// Panduan kerja admin Keuangan:
//  - "Perlu tindakan sekarang": angka langsung dari database (antrean, piutang telat, pesanan belum ditagih)
//  - Tugas harian/mingguan/bulanan yang bisa dicentang (disimpan di perangkat ini, reset otomatis per periode)
//  - Aturan penting, tanya-jawab, dan daftar fitur yang belum tersedia
"use client";

import React, { useCallback, useEffect, useMemo, useState } from "react";
import { Check, ChevronDown, ChevronRight } from "lucide-react";
import { finFetch, errMsg } from "@/hooks/useFinanceApi";
import type { FinCaps } from "@/lib/finance/caps";
import type { TodoData } from "@/lib/finance/types";
import {
  COMING_SOON, FAQ, FREQ_LABEL, FREQ_PERIOD_HINT, RULES, pruneDone, taskKey, tasksFor,
  type Freq, type GuideTarget, type GuideTask,
} from "@/lib/finance/guideTasks";
import { cardCls, sectionLabelCls } from "../ui";
import { formatRupiah } from "../utils";

const FREQS: Freq[] = ["daily", "weekly", "monthly"];

const btnCls =
  "inline-flex items-center justify-center min-h-9 px-3.5 rounded-md bg-[#124540] hover:bg-[#0d332f] text-white text-xs font-semibold transition-colors duration-150";

type Tone = "neutral" | "amber" | "red";
const TONE_CLS: Record<Tone, string> = {
  neutral: "border-zinc-200 dark:border-zinc-800 bg-white dark:bg-zinc-950",
  amber: "border-amber-200 dark:border-amber-900/50 bg-amber-50 dark:bg-amber-950/30",
  red: "border-red-200 dark:border-red-900/50 bg-red-50 dark:bg-red-950/30",
};

export default function GuideTab({
  caps,
  version,
  userKey,
  onGo,
}: {
  caps: FinCaps;
  version: number;
  /** id pengguna, supaya centang tidak tercampur bila satu browser dipakai bergantian */
  userKey: string;
  onGo: (tab: GuideTarget, opts?: { pending?: boolean }) => void;
}) {
  const STORAGE = `fin-guide:v1:${userKey}`;
  const [todo, setTodo] = useState<TodoData | null>(null);
  const [todoError, setTodoError] = useState<string | null>(null);
  const [openTask, setOpenTask] = useState<string | null>(null);
  const [freq, setFreq] = useState<Freq>("daily");
  const tasks = useMemo(() => tasksFor(caps), [caps]);

  // Centang tersimpan di perangkat ini; periode lama dibuang saat dibaca. Gagal baca = daftar kosong.
  const [done, setDone] = useState<Record<string, true>>(() => {
    try {
      const raw = typeof window !== "undefined" ? window.localStorage.getItem(STORAGE) : null;
      return raw ? pruneDone(JSON.parse(raw) as Record<string, true>, tasks) : {};
    } catch {
      return {};
    }
  });

  const toggle = (t: GuideTask) => {
    const key = taskKey(t);
    setDone((prev) => {
      const next = { ...prev };
      if (next[key]) delete next[key];
      else next[key] = true;
      try {
        window.localStorage.setItem(STORAGE, JSON.stringify(next));
      } catch {
        /* penyimpanan penuh/diblokir: centang tetap berlaku selama halaman terbuka */
      }
      return next;
    });
  };

  const loadTodo = useCallback(async () => {
    try {
      setTodo(await finFetch<TodoData>("/api/finance/todo"));
      setTodoError(null);
    } catch (e) {
      setTodoError(errMsg(e));
    }
  }, []);

  useEffect(() => {
    void loadTodo();
  }, [loadTodo, version]);

  const alerts: { key: string; tone: Tone; text: React.ReactNode; go?: () => void; goLabel?: string }[] = [];
  if (todo) {
    if (caps.approver && todo.pending_payments.count > 0) {
      const old = todo.pending_payments.oldest_days;
      alerts.push({
        key: "pp", tone: (old ?? 0) >= 3 ? "red" : "amber",
        text: <><b>{todo.pending_payments.count} pembayaran</b> ({formatRupiah(todo.pending_payments.amount)}) menunggu verifikasi{old ? `, yang terlama ${old} hari` : ""}.</>,
        go: () => onGo("verify"), goLabel: "Buka antrean",
      });
    }
    if (caps.approver && todo.pending_expenses.count > 0) {
      const old = todo.pending_expenses.oldest_days;
      alerts.push({
        key: "pe", tone: (old ?? 0) >= 3 ? "red" : "amber",
        text: <><b>{todo.pending_expenses.count} pengeluaran</b> ({formatRupiah(todo.pending_expenses.amount)}) menunggu persetujuan{old ? `, yang terlama ${old} hari` : ""}.</>,
        go: () => onGo("expenses", { pending: true }), goLabel: "Buka antrean",
      });
    }
    if (todo.overdue.count > 0) {
      alerts.push({
        key: "od", tone: "red",
        text: <><b>{todo.overdue.count} tagihan</b> lewat jatuh tempo, sisa {formatRupiah(todo.overdue.amount)}.</>,
        go: () => onGo("overview"), goLabel: "Lihat piutang",
      });
    }
    if (caps.maker && todo.unbilled_recent.count > 0) {
      alerts.push({
        key: "ub", tone: "amber",
        text: <><b>{todo.unbilled_recent.count} pesanan</b> 30 hari terakhir sudah punya rincian item tetapi belum ditagih.</>,
        go: () => onGo("invoices"), goLabel: "Buka Tagihan",
      });
    }
  }

  const visibleTasks = tasks.filter((t) => t.freq === freq);
  const doneCount = (f: Freq) => tasks.filter((t) => t.freq === f && done[taskKey(t)]).length;
  const totalCount = (f: Freq) => tasks.filter((t) => t.freq === f).length;

  return (
    <div className="space-y-5 md:space-y-6">
      <section className="space-y-3">
        <p className={sectionLabelCls}>Perlu tindakan sekarang</p>
        {todoError && <p className="text-xs text-red-600 dark:text-red-400">{todoError}</p>}
        {!todo && !todoError && <p className="text-xs text-zinc-500 dark:text-zinc-400">Memuat…</p>}
        {todo && alerts.length === 0 && (
          <div className={`${cardCls} px-4 py-3 text-xs text-emerald-700 dark:text-emerald-400`}>
            Tidak ada yang mendesak. Semua antrean sudah diproses dan tidak ada tagihan yang lewat jatuh tempo.
          </div>
        )}
        {alerts.map((a) => (
          <div key={a.key} className={`flex items-center justify-between gap-3 rounded-xl border px-4 py-3 ${TONE_CLS[a.tone]}`}>
            <p className="text-xs text-zinc-700 dark:text-zinc-200 leading-relaxed">{a.text}</p>
            {a.go && <button onClick={a.go} className={`${btnCls} shrink-0`}>{a.goLabel}</button>}
          </div>
        ))}
      </section>

      <section className="space-y-3">
        <p className={sectionLabelCls}>Tugas rutin</p>
        <div className="flex gap-2">
          {FREQS.map((f) => (
            <button
              key={f}
              onClick={() => setFreq(f)}
              className={`text-xs font-semibold px-3 py-1.5 rounded-full border whitespace-nowrap transition-colors duration-150 ${
                freq === f
                  ? "bg-[#124540] text-white border-[#124540]"
                  : "bg-white dark:bg-zinc-950 border-zinc-200 dark:border-zinc-800 text-zinc-600 dark:text-zinc-400 hover:border-zinc-400 dark:hover:border-zinc-600"
              }`}
            >
              {FREQ_LABEL[f]}{" "}
              <span className="text-[10px] opacity-70 font-mono tabular-nums">({doneCount(f)}/{totalCount(f)})</span>
            </button>
          ))}
        </div>
        <p className="text-[11px] text-zinc-500 dark:text-zinc-400">
          Centang yang sudah dikerjakan {FREQ_PERIOD_HINT[freq]}. Centang disimpan di perangkat ini dan kembali kosong di periode berikutnya.
        </p>

        {visibleTasks.length === 0 ? (
          <p className="text-xs text-zinc-500 dark:text-zinc-400">Tidak ada tugas {FREQ_LABEL[freq].toLowerCase()} untuk hak akses Anda.</p>
        ) : (
          <div className={`${cardCls} divide-y divide-zinc-100 dark:divide-zinc-800 overflow-hidden`}>
            {visibleTasks.map((t) => {
              const isDone = !!done[taskKey(t)];
              const isOpen = openTask === t.id;
              return (
                <div key={t.id} className="px-4 py-3">
                  <div className="flex items-start gap-3">
                    <button
                      type="button"
                      role="checkbox"
                      aria-checked={isDone}
                      aria-label={`Tandai selesai: ${t.title}`}
                      onClick={() => toggle(t)}
                      className={`mt-0.5 w-5 h-5 rounded border flex items-center justify-center shrink-0 transition-colors duration-150 ${
                        isDone ? "bg-[#124540] border-[#124540] text-white" : "border-zinc-300 dark:border-zinc-700"
                      }`}
                    >
                      {isDone && <Check className="w-3.5 h-3.5" />}
                    </button>
                    <button type="button" onClick={() => setOpenTask(isOpen ? null : t.id)} className="min-w-0 flex-1 text-left flex items-start gap-2">
                      <span className="min-w-0 flex-1">
                        <span className={`block text-sm font-semibold ${isDone ? "line-through text-zinc-400" : "text-zinc-900 dark:text-zinc-100"}`}>{t.title}</span>
                        <span className="block text-[11px] text-zinc-500 dark:text-zinc-400 mt-0.5">{t.why}</span>
                      </span>
                      <span className="mt-0.5 text-zinc-400 shrink-0">
                        {isOpen ? <ChevronDown className="w-4 h-4" /> : <ChevronRight className="w-4 h-4" />}
                      </span>
                    </button>
                  </div>
                  {isOpen && (
                    <div className="mt-3 ml-8 space-y-3">
                      <ol className="list-decimal list-inside space-y-1 text-xs text-zinc-600 dark:text-zinc-300">
                        {t.steps.map((s) => (
                          <li key={s}>{s}</li>
                        ))}
                      </ol>
                      {t.go && (
                        <button onClick={() => onGo(t.go!.tab, { pending: t.go!.pending })} className={btnCls}>
                          {t.go.label}
                        </button>
                      )}
                    </div>
                  )}
                </div>
              );
            })}
          </div>
        )}
      </section>

      <section className="space-y-3">
        <p className={sectionLabelCls}>Aturan penting</p>
        <ul className={`${cardCls} p-4 space-y-2 text-xs text-zinc-700 dark:text-zinc-300 list-disc list-inside`}>
          {RULES.map((r) => (
            <li key={r}>{r}</li>
          ))}
        </ul>
      </section>

      <section className="space-y-3">
        <p className={sectionLabelCls}>Tanya jawab</p>
        <div className={`${cardCls} divide-y divide-zinc-100 dark:divide-zinc-800`}>
          {FAQ.map((f) => (
            <details key={f.q} className="px-4 py-3 group">
              <summary className="text-xs font-semibold text-zinc-900 dark:text-zinc-100 cursor-pointer list-none flex items-center justify-between gap-2">
                {f.q}
                <ChevronRight className="w-4 h-4 text-zinc-400 shrink-0 group-open:rotate-90 transition-transform duration-150" />
              </summary>
              <p className="text-xs text-zinc-600 dark:text-zinc-300 mt-2 leading-relaxed">{f.a}</p>
            </details>
          ))}
        </div>
      </section>

      <section className="space-y-3">
        <p className={sectionLabelCls}>Belum tersedia</p>
        <ul className={`${cardCls} p-4 space-y-2 text-xs text-zinc-600 dark:text-zinc-300 list-disc list-inside`}>
          {COMING_SOON.map((c) => (
            <li key={c}>{c}</li>
          ))}
        </ul>
      </section>
    </div>
  );
}
