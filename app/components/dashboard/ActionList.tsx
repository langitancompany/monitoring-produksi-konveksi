import { memo } from "react";
import {
  AlertTriangle,
  CheckCircle2,
  Clock,
  ArrowUpRight,
} from "lucide-react";
import type { ActionItem, ActionItemType } from "@/lib/dashboardStats";
import { parseLocalDate } from "@/lib/utils";

// ─── Token per tipe isu ──────────────────────────────────────────────────────

const TYPE_STYLES: Record<
  ActionItemType,
  { indicator: string; text: string; label: string }
> = {
  KENDALA: {
    indicator: "bg-purple-600",
    text: "text-purple-700 dark:text-purple-300",
    label: "Kendala",
  },
  REVISI: {
    indicator: "bg-rose-500",
    text: "text-rose-700 dark:text-rose-300",
    label: "Revisi",
  },
  TELAT: {
    indicator: "bg-red-600",
    text: "text-red-700 dark:text-red-300",
    label: "Telat",
  },
  URGENT: {
    indicator: "bg-orange-500",
    text: "text-orange-700 dark:text-orange-300",
    label: "Urgent",
  },
};

// ─── Action Row ───────────────────────────────────────────────────────────────

interface ActionRowProps {
  item: ActionItem;
  index: number;
  onSelectOrder: (id: string) => void;
}

const ActionRow = memo(
  function ActionRow({ item, index, onSelectOrder }: ActionRowProps) {
    const { order, type, detail } = item;
    const style = TYPE_STYLES[type];

    const icon = (() => {
      const cls = `w-3.5 h-3.5 flex-shrink-0 ${style.text}`;
      switch (type) {
        case "KENDALA":
          return <AlertTriangle className={cls} />;
        case "TELAT":
          return <Clock className={cls} />;
        default:
          return <ArrowUpRight className={cls} />;
      }
    })();

    return (
      <div
        className="group flex items-stretch cursor-pointer transition-colors duration-150 hover:bg-zinc-50 dark:hover:bg-zinc-900"
        onClick={() => onSelectOrder(order.id)}
      >
        {/* Indikator */}
        <div
          className={`w-0.5 my-3 ml-0 rounded-full ${style.indicator} flex-shrink-0`}
        />

        <div className="flex-1 min-w-0 flex items-center gap-3 md:gap-4 px-3 md:px-4 py-3">
          {/* Nomor urut */}
          <span className="font-mono tabular-nums text-[10px] text-zinc-400 dark:text-zinc-600 w-5 flex-shrink-0 pt-0.5">
            {String(index + 1).padStart(2, "0")}
          </span>

          {/* Isi */}
          <div className="flex-1 min-w-0">
            <div className="flex items-center gap-2 min-w-0">
              <p className="font-semibold text-zinc-900 dark:text-zinc-100 text-sm truncate">
                {order.nama_pemesan}
              </p>
              <span className="font-mono text-[10px] text-zinc-400 dark:text-zinc-500 hidden md:inline">
                #{order.kode_produksi}
              </span>
              <span
                className={`text-[10px] font-semibold uppercase tracking-wide ${style.text} flex-shrink-0`}
              >
                {style.label}
              </span>
            </div>
            <div className={`flex items-center gap-1.5 mt-1 ${style.text}`}>
              {icon}
              <p className="text-xs truncate">
                {type === "KENDALA" ? `Kendala: ${detail}` : detail}
              </p>
            </div>
          </div>

          {/* Deadline */}
          <div className="flex-shrink-0 text-right self-center">
            <p className="font-mono tabular-nums text-[10px] text-zinc-500 dark:text-zinc-400">
              DL{" "}
              {parseLocalDate(order.deadline).toLocaleDateString("id-ID", {
                day: "numeric",
                month: "short",
              })}
            </p>
          </div>
        </div>
      </div>
    );
  },
  (prevProps, nextProps) =>
    prevProps.item.uniqueKey === nextProps.item.uniqueKey &&
    prevProps.item.detail === nextProps.item.detail &&
    prevProps.item.order.deadline === nextProps.item.order.deadline &&
    prevProps.item.order.nama_pemesan === nextProps.item.order.nama_pemesan,
);

// ─── Action List ──────────────────────────────────────────────────────────────

interface ActionListProps {
  actionItems: ActionItem[];
  onSelectOrder: (id: string) => void;
}

const ActionList = memo(function ActionList({
  actionItems,
  onSelectOrder,
}: ActionListProps) {
  return (
    <section
      id="perlu-tindakan"
      className="scroll-mt-4 bg-white dark:bg-zinc-950 rounded-xl border border-zinc-200 dark:border-zinc-800 overflow-hidden"
    >
      <header className="px-4 md:px-5 py-4 flex items-center justify-between border-b border-zinc-200 dark:border-zinc-800">
        <h3 className="font-semibold text-zinc-900 dark:text-zinc-100 text-sm md:text-base tracking-tight">
          Perlu Tindakan Segera
        </h3>
        <span className="font-mono tabular-nums text-[11px] text-zinc-500 dark:text-zinc-400">
          {String(actionItems.length).padStart(2, "0")} isu
        </span>
      </header>

      <div className="divide-y divide-zinc-100 dark:divide-zinc-800/70">
        {actionItems.slice(0, 10).map((item, index) => (
          <ActionRow
            key={item.uniqueKey}
            item={item}
            index={index}
            onSelectOrder={onSelectOrder}
          />
        ))}

        {actionItems.length === 0 && (
          <div className="px-4 py-10 text-center flex flex-col items-center text-zinc-400 dark:text-zinc-500">
            <CheckCircle2
              className="w-8 h-8 mb-2 text-emerald-500"
              strokeWidth={1.5}
            />
            <p className="text-xs">
              Aman — tidak ada kendala, telat, atau urgent.
            </p>
          </div>
        )}
      </div>
    </section>
  );
});

export default ActionList;
