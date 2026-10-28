// app/components/orders/ApprovalSheet.tsx
//
// Form Approval otomatis untuk pesanan utama, dibentuk dari data pesanan (tanpa upload file).
// Format: A4 landscape (1123x794 px) per halaman, jumlah halaman MENGIKUTI isi pesanan:
//   • header (banner /Header-approval.png, sama seperti Sablon) + detail customer di halaman 1
//   • rincian pesanan berupa KARTU dua kolom: judul + total pcs, lalu ukuran:jumlah (hanya yang
//     terisi, mis. S: 2, XL: 5). Pesanan umum menampilkan mockup di sisi kiri kartu
//   • kartu mengalir ke halaman berikutnya bila tidak muat; catatan + kotak TTD di halaman terakhir
// Warna dipaksa terang (hitam di atas putih) supaya hasil cetak/PDF selalu sama.

import React from "react";
import type { Order, OrderItem, ProductionTypeData } from "@/types/order";
import { COMPANY } from "@/lib/config";
import { isCustomType, itemTitle, itemTotal, sumItems, varianLabel } from "@/lib/orderItems";
import { typeLabel } from "@/lib/utils";

export const SHEET_W = 1123;
export const SHEET_H = 794;

// ─── Ukuran (px) ──────────────────────────────────────────────────────────────
const FRAME_PAD = 14; // sheet → bingkai
const FRAME_BORDER = 3;
const INNER_PAD = 12; // bingkai → isi
const INNER_W = SHEET_W - 2 * (FRAME_PAD + FRAME_BORDER + INNER_PAD); // 1065
const INNER_H = SHEET_H - 2 * (FRAME_PAD + FRAME_BORDER + INNER_PAD); // 736

const BANNER_W = 520; // lebar kolom banner (sama dengan kolom kiri Form Approval Sablon)
const BANNER_RATIO = 300 / 2129; // Header-approval.png (2129x300)
const HEADER_H = 82; // banner + garis bawah + jarak (dibulatkan ke atas)
const CUSTOMER_H = 86;
const SECTION_TITLE_H = 25;
const COL_GAP = 12;
const COL_W = Math.floor((INNER_W - COL_GAP) / 2); // 526
const ROW_GAP = 10;
const CARD_HEAD_H = 22;
const CHIP_ROW_H = 22;
const SIGN_BOX_H = 92;

const TEAL = "#124540";
const GRAY = "#d4d4d8";
const RED = "#c62828";

// ─── Helper tampilan ──────────────────────────────────────────────────────────

function fmtDate(v?: string | null): string {
  if (!v) return "";
  const m = /^(\d{4})-(\d{2})-(\d{2})/.exec(v);
  if (m) return `${m[3]}/${m[2]}/${m[1]}`;
  const d = new Date(v);
  if (isNaN(d.getTime())) return v;
  return `${String(d.getDate()).padStart(2, "0")}/${String(d.getMonth() + 1).padStart(2, "0")}/${d.getFullYear()}`;
}

interface Chip {
  ukuran: string;
  jumlah: number;
}
interface Block {
  key: string;
  label: string;
  chips: Chip[];
  total: number;
}

/** Blok per varian (atau satu blok bila tanpa varian); hanya ukuran yang jumlahnya > 0. */
function blocksOf(it: OrderItem): Block[] {
  if (it.rincian && it.rincian.length > 0) {
    return it.rincian.map((r) => {
      const chips = r.ukuran
        .filter((u) => (Number(u.jumlah) || 0) > 0)
        .map((u) => ({ ukuran: u.ukuran, jumlah: Number(u.jumlah) }));
      return { key: r.id, label: varianLabel(r), chips, total: chips.reduce((n, c) => n + c.jumlah, 0) };
    });
  }
  return [{ key: it.id, label: "", chips: [], total: itemTotal(it) }];
}

/** Perkiraan lebar satu chip "S | 2" (Arial 11px) — sengaja sedikit berlebih supaya tinggi tidak kurang. */
const chipWidth = (c: Chip) => 6.8 * (c.ukuran.length + String(c.jumlah).length) + 28;

function chipLines(chips: Chip[], availW: number): number {
  if (chips.length === 0) return 1; // baris "Jumlah: N pcs"
  let lines = 1;
  let used = 0;
  for (const c of chips) {
    const w = chipWidth(c);
    if (used > 0 && used + w > availW) {
      lines += 1;
      used = 0;
    }
    used += w;
  }
  return lines;
}

const textLines = (text: string, availW: number, charPx = 6.4) =>
  text
    .split("\n")
    .reduce((n, ln) => n + Math.max(1, Math.ceil((ln.length * charPx) / availW)), 0);

// ─── Pembagian halaman ────────────────────────────────────────────────────────

interface CardSpec {
  item: OrderItem;
  title: string;
  custom: boolean;
  blocks: Block[];
  h: number;
}
interface RowSpec {
  cards: CardSpec[];
  h: number;
}
export interface PageSpec {
  rows: RowSpec[];
  /** halaman ini memuat catatan + kotak TTD */
  final: boolean;
}

const IMG_W = 190;

function cardSpec(it: OrderItem, types: ProductionTypeData[]): CardSpec {
  const type = types.find((t) => t.value === it.jenis_produksi);
  const custom = isCustomType(type);
  const blocks = blocksOf(it);
  const note = (it.catatan ?? "").trim();

  if (custom) {
    const availW = COL_W - 2 - IMG_W - 20;
    let content = 8;
    for (const b of blocks) content += chipLines(b.chips, availW) * CHIP_ROW_H + 4;
    if (note) content += textLines(note, availW) * 14 + 4;
    return { item: it, title: itemTitle(it, types), custom, blocks, h: CARD_HEAD_H + Math.max(150, content + 8) };
  }

  const availW = COL_W - 2 - 16;
  let content = 8;
  for (const b of blocks) {
    content += (b.label ? 16 : 0) + chipLines(b.chips, availW) * CHIP_ROW_H + 4;
  }
  if (note) content += textLines(note, availW) * 14 + 4;
  return { item: it, title: typeLabel(it.jenis_produksi, types), custom, blocks, h: CARD_HEAD_H + Math.max(56, content + 6) };
}

function noteLines(order: Order, catatanApproval?: string): string[] {
  const out: string[] = [];
  const c = (order.catatan_pesanan ?? "").trim();
  if (c) out.push(`Pesanan: ${c}`);
  if (catatanApproval?.trim()) out.push(`Approval: ${catatanApproval.trim()}`);
  return out;
}

export function buildApprovalPages(order: Order, types: ProductionTypeData[], catatanApproval?: string): PageSpec[] {
  const cards = (order.items ?? []).map((it) => cardSpec(it, types));

  const rows: RowSpec[] = [];
  for (let i = 0; i < cards.length; i += 2) {
    const pair = cards.slice(i, i + 2);
    rows.push({ cards: pair, h: Math.max(...pair.map((c) => c.h)) });
  }

  const notes = noteLines(order, catatanApproval);
  const finalH =
    (notes.length > 0 ? SECTION_TITLE_H + textLines(notes.join("\n"), INNER_W, 6.2) * 16 + 8 : 0) +
    SECTION_TITLE_H +
    SIGN_BOX_H +
    6;

  const cap = (pageIndex: number) =>
    INNER_H - HEADER_H - (pageIndex === 0 ? CUSTOMER_H : 0) - SECTION_TITLE_H;

  const pages: { rows: RowSpec[]; used: number }[] = [{ rows: [], used: 0 }];
  for (const row of rows) {
    let pg = pages[pages.length - 1];
    const add = (pg.rows.length > 0 ? ROW_GAP : 0) + row.h;
    if (pg.rows.length > 0 && pg.used + add > cap(pages.length - 1)) {
      pg = { rows: [], used: 0 };
      pages.push(pg);
    }
    pg.used += (pg.rows.length > 0 ? ROW_GAP : 0) + row.h;
    pg.rows.push(row);
  }

  const last = pages[pages.length - 1];
  const needGap = last.rows.length > 0 ? ROW_GAP : 0;
  const result: PageSpec[] = pages.map((p) => ({ rows: p.rows, final: false }));
  if (last.used + needGap + finalH <= cap(pages.length - 1)) {
    result[result.length - 1].final = true;
  } else {
    result.push({ rows: [], final: true });
  }
  return result;
}

export function approvalPageCount(order: Order, types: ProductionTypeData[], catatanApproval?: string): number {
  return buildApprovalPages(order, types, catatanApproval).length;
}

// ─── Komponen kecil ───────────────────────────────────────────────────────────

function SectionTitle({ n, children }: { n: number; children: React.ReactNode }) {
  return (
    <div style={{ display: "flex", height: 20, marginBottom: 5 }}>
      <div
        style={{
          width: 34,
          background: TEAL,
          color: "#fff",
          fontWeight: 700,
          fontSize: 12,
          display: "flex",
          alignItems: "center",
          justifyContent: "center",
          marginRight: 4,
        }}
      >
        {n}
      </div>
      <div
        style={{
          flex: 1,
          background: GRAY,
          fontWeight: 700,
          fontSize: 12,
          display: "flex",
          alignItems: "center",
          paddingLeft: 8,
          letterSpacing: 0.3,
        }}
      >
        {children}
      </div>
    </div>
  );
}

function Field({ label, value, bold, clamp, labelWidth = 110 }: { label: string; value?: React.ReactNode; bold?: boolean; clamp?: boolean; labelWidth?: number }) {
  return (
    <div style={{ display: "flex", fontSize: 12, minHeight: 17, lineHeight: "17px" }}>
      <div style={{ width: labelWidth, flexShrink: 0, fontWeight: bold ? 700 : 400 }}>{label}</div>
      <div style={{ width: 10, flexShrink: 0 }}>:</div>
      <div
        style={{
          fontWeight: bold ? 700 : 400,
          minWidth: 0,
          ...(clamp ? { overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" } : { wordBreak: "break-word" }),
        }}
      >
        {value}
      </div>
    </div>
  );
}

function SignBox({ title, dotted }: { title: string; dotted?: boolean }) {
  return (
    <div style={{ flex: 1, border: "2px solid #000", display: "flex", flexDirection: "column" }}>
      <div style={{ borderBottom: "2px solid #000", textAlign: "center", fontSize: 12, height: 18, lineHeight: "18px" }}>{title}</div>
      <div style={{ flex: 1, display: "flex", alignItems: "flex-end", justifyContent: "center" }}>
        {dotted && <span style={{ fontSize: 11, paddingBottom: 3, letterSpacing: 1 }}>..................................</span>}
      </div>
    </div>
  );
}

/** Satu pasangan ukuran:jumlah, mis. "XL | 2". */
function SizeChip({ c }: { c: Chip }) {
  return (
    <span style={{ display: "inline-flex", border: "1px solid #555", borderRadius: 3, fontSize: 11, lineHeight: "16px", overflow: "hidden" }}>
      <span style={{ padding: "0 5px", background: "#e4e4e7", fontWeight: 700 }}>{c.ukuran}</span>
      <span style={{ padding: "0 6px", fontWeight: 700 }}>{c.jumlah}</span>
    </span>
  );
}

function BlockLines({ blocks, total }: { blocks: Block[]; total: number }) {
  return (
    <>
      {blocks.map((b) => (
        <div key={b.key} style={{ marginBottom: 4 }}>
          {b.label && <div style={{ fontSize: 11, fontWeight: 700, lineHeight: "16px" }}>{b.label}</div>}
          {b.chips.length > 0 ? (
            <div style={{ display: "flex", flexWrap: "wrap", gap: 4 }}>
              {b.chips.map((c) => (
                <SizeChip key={c.ukuran} c={c} />
              ))}
            </div>
          ) : (
            <div style={{ fontSize: 12, lineHeight: "22px" }}>
              Jumlah: <b>{b.total || total}</b> pcs
            </div>
          )}
        </div>
      ))}
    </>
  );
}

function Card({ card, height }: { card: CardSpec; height: number }) {
  const { item, title, custom, blocks } = card;
  const total = itemTotal(item);
  const note = (item.catatan ?? "").trim();
  return (
    <div style={{ width: COL_W, height, border: "1px solid #555", boxSizing: "border-box", display: "flex", flexDirection: "column", overflow: "hidden" }}>
      <div
        style={{
          height: CARD_HEAD_H,
          background: TEAL,
          color: "#fff",
          display: "flex",
          alignItems: "center",
          justifyContent: "space-between",
          gap: 8,
          padding: "0 8px",
          fontSize: 12,
          fontWeight: 700,
          flexShrink: 0,
        }}
      >
        <span style={{ minWidth: 0, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{title}</span>
        <span style={{ flexShrink: 0, fontVariantNumeric: "tabular-nums" }}>{total} pcs</span>
      </div>
      <div style={{ flex: 1, minHeight: 0, display: "flex" }}>
        {custom && (
          <div
            style={{
              width: IMG_W,
              flexShrink: 0,
              borderRight: "1px solid #555",
              background: "#f4f4f5",
              display: "flex",
              alignItems: "center",
              justifyContent: "center",
              padding: 6,
              boxSizing: "border-box",
            }}
          >
            {item.mockup_url ? (
              // eslint-disable-next-line @next/next/no-img-element
              <img src={item.mockup_url} alt="Mockup" style={{ maxWidth: "100%", maxHeight: "100%", objectFit: "contain", display: "block" }} />
            ) : (
              <span style={{ fontSize: 11, color: "#888", textAlign: "center" }}>Mockup belum diupload</span>
            )}
          </div>
        )}
        <div style={{ flex: 1, minWidth: 0, padding: custom ? "8px 10px" : "8px", boxSizing: "border-box" }}>
          <BlockLines blocks={blocks} total={total} />
          {note && <div style={{ fontSize: 11, lineHeight: "14px", color: "#333", wordBreak: "break-word" }}>Catatan: {note}</div>}
        </div>
      </div>
    </div>
  );
}

// ─── Komponen utama ───────────────────────────────────────────────────────────

interface Props {
  order: Order;
  productionTypes: ProductionTypeData[];
  /** nama PJ & tim (dicari halaman dari users/teams) */
  pjName?: string;
  teamName?: string;
  /** catatan yang diketik admin di tahap Approval */
  catatanApproval?: string;
  /** ref tiap halaman (untuk dipotret jadi PDF) */
  pageRef?: (el: HTMLDivElement | null, index: number) => void;
  /** jarak antar halaman di layar (px, di luar node yang dipotret) */
  gap?: number;
}

export default function ApprovalSheet({ order, productionTypes, pjName, teamName, catatanApproval, pageRef, gap = 0 }: Props) {
  const pages = buildApprovalPages(order, productionTypes, catatanApproval);
  const notes = noteLines(order, catatanApproval);
  const alamat = (order.alamat_pemesan ?? "").trim();
  const grand = sumItems(order.items ?? []);

  return (
    <>
      {pages.map((page, pi) => (
        <div
          key={pi}
          ref={(el) => pageRef?.(el, pi)}
          className="approval-page"
          style={{
            width: SHEET_W,
            height: SHEET_H,
            marginBottom: pi < pages.length - 1 ? gap : 0,
            background: "#fff",
            color: "#000",
            boxSizing: "border-box",
            padding: FRAME_PAD,
            fontFamily: "Arial, Helvetica, sans-serif",
          }}
        >
          <div
            style={{
              border: `${FRAME_BORDER}px solid #000`,
              height: "100%",
              boxSizing: "border-box",
              padding: INNER_PAD,
              display: "flex",
              flexDirection: "column",
            }}
          >
            {/* ── Header: banner sama seperti Sablon (menempel di pojok kiri-atas bingkai) ── */}
            <div
              style={{
                display: "flex",
                alignItems: "flex-end",
                justifyContent: "space-between",
                gap: 12,
                borderBottom: "2px solid #000",
                paddingBottom: 6,
                marginBottom: 8,
                flexShrink: 0,
              }}
            >
              <div style={{ width: BANNER_W, flexShrink: 0 }}>
                {/* eslint-disable-next-line @next/next/no-img-element */}
                <img
                  src="/Header-approval.png"
                  alt={COMPANY.name}
                  style={{
                    display: "block",
                    width: `calc(100% + ${INNER_PAD}px)`,
                    maxWidth: "none",
                    height: "auto",
                    aspectRatio: `${1 / BANNER_RATIO}`,
                    margin: `-${INNER_PAD}px 0 0 -${INNER_PAD}px`,
                  }}
                />
              </div>
              <div style={{ display: "flex", alignItems: "flex-end", gap: 14, minWidth: 0 }}>
                <div style={{ textAlign: "right", minWidth: 0 }}>
                  <div style={{ fontSize: 10, color: "#444", letterSpacing: 0.5 }}>FORM APPROVAL · HAL {pi + 1}/{pages.length}</div>
                  <div style={{ fontSize: 11, color: "#444" }}>Code produksi</div>
                  <div style={{ fontSize: 17, fontWeight: 800, lineHeight: "20px" }}>#{order.kode_produksi}</div>
                </div>
                <div style={{ textAlign: "center", flexShrink: 0 }}>
                  <div style={{ background: RED, color: "#fff", fontWeight: 700, fontSize: 11, padding: "2px 10px", marginBottom: 2 }}>DEADLINE</div>
                  <div style={{ border: `2px solid ${RED}`, color: RED, fontWeight: 700, fontSize: 13, padding: "1px 10px" }}>{fmtDate(order.deadline)}</div>
                </div>
              </div>
            </div>

            {/* ── Halaman 1: detail customer ── */}
            {pi === 0 && (
              <div style={{ height: CUSTOMER_H, flexShrink: 0 }}>
                <SectionTitle n={1}>DETAIL CUSTOMER</SectionTitle>
                <div style={{ display: "flex", gap: 30 }}>
                  <div style={{ flex: 1.2, minWidth: 0 }}>
                    <Field label="Nama Customer" value={order.nama_pemesan} bold />
                    <Field label="WA Customer" value={order.no_hp} />
                    <Field label="Alamat" value={alamat} clamp />
                  </div>
                  <div style={{ flex: 1, minWidth: 0 }}>
                    <Field label="Tanggal Masuk" value={fmtDate(order.tanggal_masuk)} />
                    <Field label="PJ Produksi" value={pjName} />
                    <Field label="Tim" value={teamName} />
                  </div>
                </div>
              </div>
            )}

            {/* ── Rincian pesanan (kartu dua kolom) ── */}
            {(pi === 0 || page.rows.length > 0) && (
            <div style={{ flexShrink: 0 }}>
              <SectionTitle n={2}>
                {pi === 0 ? "RINCIAN PESANAN" : `RINCIAN PESANAN (LANJUTAN) — ${order.nama_pemesan}`}
                {pi === 0 && <span style={{ marginLeft: "auto", paddingRight: 8, fontWeight: 700 }}>TOTAL {grand} PCS</span>}
              </SectionTitle>
            </div>
            )}
            <div style={{ display: "flex", flexDirection: "column", gap: ROW_GAP, minHeight: 0 }}>
              {page.rows.map((row, ri) => (
                <div key={ri} style={{ display: "flex", gap: COL_GAP, height: row.h }}>
                  {row.cards.map((c) => (
                    <Card key={c.item.id} card={c} height={row.h} />
                  ))}
                </div>
              ))}
              {pi === 0 && page.rows.length === 0 && (
                <div style={{ border: "2px dashed #aaa", color: "#777", fontSize: 12, padding: 14, textAlign: "center" }}>Rincian pesanan belum diisi.</div>
              )}
            </div>

            {/* ── Halaman terakhir: catatan + TTD (menempel di bawah) ── */}
            {page.final && (
              <div style={{ marginTop: page.rows.length === 0 && pi > 0 ? 0 : "auto", flexShrink: 0 }}>
                {notes.length > 0 && (
                  <div style={{ marginBottom: 8 }}>
                    <SectionTitle n={3}>CATATAN</SectionTitle>
                    <div style={{ fontSize: 12, lineHeight: "16px", whiteSpace: "pre-line", wordBreak: "break-word" }}>{notes.join("\n")}</div>
                  </div>
                )}
                <SectionTitle n={notes.length > 0 ? 4 : 3}>APPROVAL & TTD PENERIMAAN</SectionTitle>
                <div style={{ display: "flex", gap: 14, height: SIGN_BOX_H }}>
                  <SignBox title="Approval" />
                  <SignBox title="Customer" dotted />
                  <SignBox title={COMPANY.name} dotted />
                </div>
              </div>
            )}
          </div>
        </div>
      ))}
    </>
  );
}
