// app/components/orders/ApprovalSheet.tsx
//
// Form Approval otomatis untuk pesanan utama, dibentuk dari data pesanan (tanpa upload file).
// Format: A4 PORTRAIT (794x1123 px) per halaman, jumlah halaman MENGIKUTI isi pesanan:
//   • halaman 1: banner /Header-approval.png selebar halaman, judul + kode + deadline, detail customer
//   • halaman lanjutan: header ringkas (tanpa banner) supaya ruang kartu lebih luas
//   • rincian pesanan berupa KARTU dalam dua kolom. Tiap kartu ditaruh di kolom yang lebih pendek
//     (susunan "masonry"), jadi tidak ada ruang kosong akibat kartu pendek bersebelahan dengan kartu
//     tinggi. Pesanan umum menampilkan mockup di BAGIAN ATAS kartu
//   • catatan + kotak TTD di halaman terakhir
// Warna dipaksa terang (teks gelap di atas putih) supaya hasil cetak/PDF selalu sama.

import React from "react";
import type { Order, OrderItem, ProductionTypeData } from "@/types/order";
import { COMPANY } from "@/lib/config";
import { isCustomType, itemTitle, itemTotal, sumItems, varianLabel } from "@/lib/orderItems";
import { typeLabel } from "@/lib/utils";

export const SHEET_W = 794;
export const SHEET_H = 1123;

// ─── Warna ────────────────────────────────────────────────────────────────────
const TEAL = "#124540";
const ACCENT = "#3fb5aa";
const TINT = "#edf6f5";
const INK = "#16201f";
const MUTED = "#66726f";
const LINE = "#d9e2e0";
const RED = "#b3261e";
const RED_TINT = "#fdeceb";
const FONT = "Arial, Helvetica, sans-serif";

// ─── Ukuran (px) ──────────────────────────────────────────────────────────────
const PAD_X = 36; // margin kiri-kanan isi
const CONTENT_W = SHEET_W - 2 * PAD_X; // 722
const BANNER_H = Math.round((SHEET_W * 300) / 2129); // Header-approval.png (2129x300) → 112
const TITLE_H = 76; // judul + kode + deadline (halaman 1)
const HEAD1_H = BANNER_H + TITLE_H;
const HEADN_H = 44; // header ringkas halaman lanjutan
const FOOTER_H = 34;
const PAD_T = 18;
const PAD_B = 12;
const SECTION_H = 30; // judul seksi + jarak
const CUSTOMER_H = 104;
const BLOCK_GAP = 14; // jarak antar seksi
const COL_GAP = 14;
const COL_W = Math.floor((CONTENT_W - COL_GAP) / 2); // 354
const CARD_GAP = 12;
const CARD_HEAD_H = 34;
const CARD_PAD = 12;
const MOCK_H = 150;
const CHIP_H = 22;
const CHIP_GAP = 5;
const LABEL_H = 18;
const SIGN_BOX_H = 98;

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

/** Perkiraan lebar satu chip "S | 2" (Arial 11px bold) — sengaja sedikit berlebih supaya tinggi tidak kurang. */
const chipWidth = (c: Chip) => 6.9 * (c.ukuran.length + String(c.jumlah).length) + 34;

function chipLines(chips: Chip[], availW: number): number {
  if (chips.length === 0) return 1; // baris "Jumlah: N pcs"
  let lines = 1;
  let used = 0;
  for (const c of chips) {
    const w = chipWidth(c) + CHIP_GAP;
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
export interface PageSpec {
  /** dua kolom kartu (kiri, kanan) */
  cols: [CardSpec[], CardSpec[]];
  /** halaman ini memuat catatan + kotak TTD */
  final: boolean;
}

function cardSpec(it: OrderItem, types: ProductionTypeData[]): CardSpec {
  const type = types.find((t) => t.value === it.jenis_produksi);
  const custom = isCustomType(type);
  const blocks = blocksOf(it);
  const note = (it.catatan ?? "").trim();
  const availW = COL_W - 2 - 2 * CARD_PAD;

  let body = 2 * CARD_PAD;
  blocks.forEach((b, i) => {
    body += (i > 0 ? 8 : 0) + (b.label ? LABEL_H : 0);
    const lines = chipLines(b.chips, availW);
    body += b.chips.length > 0 ? lines * CHIP_H + (lines - 1) * CHIP_GAP : CHIP_H;
  });
  if (note) body += 8 + textLines(note, availW, 6) * 15;
  body += 2; // cadangan pembulatan

  const h = 2 + CARD_HEAD_H + (custom ? MOCK_H : 0) + Math.max(48, body);
  const title = custom ? itemTitle(it, types) : typeLabel(it.jenis_produksi, types);
  return { item: it, title, custom, blocks, h };
}

function noteLines(order: Order, catatanApproval?: string): string[] {
  const out: string[] = [];
  const c = (order.catatan_pesanan ?? "").trim();
  if (c) out.push(`Pesanan: ${c}`);
  if (catatanApproval?.trim()) out.push(`Approval: ${catatanApproval.trim()}`);
  return out;
}

function finalHeight(notes: string[]): number {
  return (
    (notes.length > 0 ? SECTION_H + textLines(notes.join("\n"), CONTENT_W - 28, 6.2) * 17 + 20 + BLOCK_GAP : 0) +
    SECTION_H +
    SIGN_BOX_H +
    4
  );
}

/** Tinggi area kartu (di bawah judul seksi) pada halaman ke-`pageIndex`. */
function cardArea(pageIndex: number): number {
  const head = pageIndex === 0 ? HEAD1_H : HEADN_H;
  const customer = pageIndex === 0 ? CUSTOMER_H + SECTION_H + BLOCK_GAP : 0;
  return SHEET_H - head - FOOTER_H - PAD_T - PAD_B - customer - SECTION_H;
}

export function buildApprovalPages(order: Order, types: ProductionTypeData[], catatanApproval?: string): PageSpec[] {
  const cards = (order.items ?? []).map((it) => cardSpec(it, types));

  interface Work {
    cols: [CardSpec[], CardSpec[]];
    used: [number, number];
  }
  const newPage = (): Work => ({ cols: [[], []], used: [0, 0] });
  const pages: Work[] = [newPage()];
  const addH = (pg: Work, c: 0 | 1, h: number) => (pg.cols[c].length > 0 ? CARD_GAP : 0) + h;

  for (const card of cards) {
    let pg = pages[pages.length - 1];
    const cap = cardArea(pages.length - 1);
    // kolom yang lebih pendek dulu (seri → kiri)
    const order2: [0 | 1, 0 | 1] = pg.used[1] < pg.used[0] ? [1, 0] : [0, 1];
    let col: 0 | 1 | null = null;
    for (const c of order2) {
      if (pg.used[c] + addH(pg, c, card.h) <= cap) {
        col = c;
        break;
      }
    }
    if (col === null) {
      const pageEmpty = pg.cols[0].length === 0 && pg.cols[1].length === 0;
      if (!pageEmpty) {
        pg = newPage();
        pages.push(pg);
      }
      col = 0;
    }
    pg.used[col] += addH(pg, col, card.h);
    pg.cols[col].push(card);
  }

  const last = pages[pages.length - 1];
  const result: PageSpec[] = pages.map((p) => ({ cols: p.cols, final: false }));
  const maxUsed = Math.max(last.used[0], last.used[1]);
  const gap = maxUsed > 0 ? BLOCK_GAP : 0;
  if (maxUsed + gap + finalHeight(noteLines(order, catatanApproval)) <= cardArea(pages.length - 1)) {
    result[result.length - 1].final = true;
  } else {
    result.push({ cols: [[], []], final: true });
  }
  return result;
}

export function approvalPageCount(order: Order, types: ProductionTypeData[], catatanApproval?: string): number {
  return buildApprovalPages(order, types, catatanApproval).length;
}

// ─── Komponen kecil ───────────────────────────────────────────────────────────

function SectionTitle({ n, children, right }: { n: number; children: React.ReactNode; right?: React.ReactNode }) {
  return (
    <div style={{ display: "flex", alignItems: "center", gap: 9, height: 20, marginBottom: 10 }}>
      <div
        style={{
          width: 20,
          height: 20,
          borderRadius: 10,
          background: TEAL,
          color: "#fff",
          fontWeight: 700,
          fontSize: 11,
          display: "flex",
          alignItems: "center",
          justifyContent: "center",
          flexShrink: 0,
        }}
      >
        {n}
      </div>
      <div style={{ fontWeight: 700, fontSize: 12, letterSpacing: 1, color: TEAL, flexShrink: 0 }}>{children}</div>
      <div style={{ flex: 1, height: 1, background: LINE }} />
      {right}
    </div>
  );
}

function Field({ label, value, bold, clamp }: { label: string; value?: React.ReactNode; bold?: boolean; clamp?: number }) {
  return (
    <div style={{ display: "flex", fontSize: 12.5, lineHeight: "20px", minHeight: 20 }}>
      <div style={{ width: 98, flexShrink: 0, color: MUTED, fontSize: 11.5 }}>{label}</div>
      <div
        style={{
          fontWeight: bold ? 700 : 400,
          minWidth: 0,
          wordBreak: "break-word",
          ...(clamp
            ? { display: "-webkit-box", WebkitBoxOrient: "vertical", WebkitLineClamp: clamp, overflow: "hidden", lineHeight: "20px" }
            : {}),
        }}
      >
        {value || "—"}
      </div>
    </div>
  );
}

function SignBox({ title, sub }: { title: string; sub: string }) {
  return (
    <div style={{ flex: 1, border: `1px solid ${LINE}`, borderRadius: 8, display: "flex", flexDirection: "column", overflow: "hidden", background: "#fff" }}>
      <div style={{ background: TINT, height: 26, display: "flex", alignItems: "center", justifyContent: "center", fontSize: 11, fontWeight: 700, color: TEAL, letterSpacing: 0.6 }}>
        {title}
      </div>
      <div style={{ flex: 1 }} />
      <div style={{ padding: "0 14px 8px", textAlign: "center" }}>
        <div style={{ borderTop: `1px solid ${MUTED}`, paddingTop: 4, fontSize: 10, color: MUTED }}>{sub}</div>
      </div>
    </div>
  );
}

/** Satu pasangan ukuran:jumlah, mis. "XL | 2". */
function SizeChip({ c }: { c: Chip }) {
  return (
    <span
      style={{
        display: "inline-flex",
        height: CHIP_H,
        border: `1px solid ${ACCENT}`,
        borderRadius: 5,
        fontSize: 11,
        lineHeight: `${CHIP_H - 2}px`,
        overflow: "hidden",
        boxSizing: "border-box",
      }}
    >
      <span style={{ padding: "0 7px", background: TINT, color: TEAL, fontWeight: 700 }}>{c.ukuran}</span>
      <span style={{ padding: "0 8px", fontWeight: 700, background: "#fff", color: INK }}>{c.jumlah}</span>
    </span>
  );
}

function BlockLines({ blocks, total }: { blocks: Block[]; total: number }) {
  return (
    <>
      {blocks.map((b, i) => (
        <div key={b.key} style={{ marginTop: i > 0 ? 8 : 0 }}>
          {b.label && (
            <div style={{ fontSize: 11, fontWeight: 700, lineHeight: `${LABEL_H}px`, color: MUTED, letterSpacing: 0.3 }}>
              {b.label.toUpperCase()}
            </div>
          )}
          {b.chips.length > 0 ? (
            <div style={{ display: "flex", flexWrap: "wrap", gap: CHIP_GAP }}>
              {b.chips.map((c) => (
                <SizeChip key={c.ukuran} c={c} />
              ))}
            </div>
          ) : (
            <div style={{ fontSize: 12.5, lineHeight: `${CHIP_H}px` }}>
              Jumlah: <b>{b.total || total}</b> pcs
            </div>
          )}
        </div>
      ))}
    </>
  );
}

function Card({ card }: { card: CardSpec }) {
  const { item, title, custom, blocks, h } = card;
  const total = itemTotal(item);
  const note = (item.catatan ?? "").trim();
  return (
    <div
      style={{
        width: COL_W,
        height: h,
        border: `1px solid ${LINE}`,
        borderRadius: 9,
        boxSizing: "border-box",
        display: "flex",
        flexDirection: "column",
        overflow: "hidden",
        background: "#fff",
        flexShrink: 0,
      }}
    >
      <div
        style={{
          height: CARD_HEAD_H,
          background: TEAL,
          color: "#fff",
          display: "flex",
          alignItems: "center",
          justifyContent: "space-between",
          gap: 8,
          padding: `0 ${CARD_PAD}px`,
          fontSize: 12.5,
          fontWeight: 700,
          flexShrink: 0,
        }}
      >
        <span style={{ minWidth: 0, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{title}</span>
        <span
          style={{
            flexShrink: 0,
            fontVariantNumeric: "tabular-nums",
            background: "rgba(255,255,255,0.16)",
            borderRadius: 10,
            padding: "0 9px",
            height: 20,
            lineHeight: "20px",
            fontSize: 11.5,
          }}
        >
          {total} pcs
        </span>
      </div>
      {custom && (
        <div
          style={{
            height: MOCK_H,
            flexShrink: 0,
            background: "#f3f6f6",
            borderBottom: `1px solid ${LINE}`,
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
            padding: 8,
            boxSizing: "border-box",
          }}
        >
          {item.mockup_url ? (
            // eslint-disable-next-line @next/next/no-img-element
            <img src={item.mockup_url} alt="Mockup" style={{ maxWidth: "100%", maxHeight: "100%", objectFit: "contain", display: "block" }} />
          ) : (
            <span style={{ fontSize: 11, color: MUTED, textAlign: "center" }}>Mockup belum diupload</span>
          )}
        </div>
      )}
      <div style={{ flex: 1, minHeight: 0, padding: CARD_PAD, boxSizing: "border-box" }}>
        <BlockLines blocks={blocks} total={total} />
        {note && (
          <div style={{ marginTop: 8, fontSize: 11, lineHeight: "15px", color: "#3b4745", wordBreak: "break-word" }}>
            <b>Catatan:</b> {note}
          </div>
        )}
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
      {pages.map((page, pi) => {
        const hasCards = page.cols[0].length + page.cols[1].length > 0;
        return (
          <div
            key={pi}
            ref={(el) => pageRef?.(el, pi)}
            className="approval-page"
            style={{
              position: "relative",
              width: SHEET_W,
              height: SHEET_H,
              marginBottom: pi < pages.length - 1 ? gap : 0,
              background: "#fff",
              color: INK,
              boxSizing: "border-box",
              fontFamily: FONT,
              overflow: "hidden",
            }}
          >
            {/* ── Header ── */}
            {pi === 0 ? (
              <div style={{ height: HEAD1_H }}>
                {/* eslint-disable-next-line @next/next/no-img-element */}
                <img src="/Header-approval.png" alt={COMPANY.name} style={{ display: "block", width: SHEET_W, height: BANNER_H }} />
                <div style={{ height: TITLE_H, padding: `0 ${PAD_X}px`, display: "flex", alignItems: "center", justifyContent: "space-between", gap: 16 }}>
                  <div style={{ minWidth: 0 }}>
                    <div style={{ fontSize: 23, fontWeight: 800, letterSpacing: 1.5, color: TEAL, lineHeight: "26px" }}>FORM APPROVAL</div>
                    <div style={{ fontSize: 11, color: MUTED, marginTop: 3 }}>Persetujuan pesanan sebelum produksi dimulai</div>
                  </div>
                  <div style={{ display: "flex", gap: 10, flexShrink: 0 }}>
                    <div style={{ background: TINT, border: `1px solid ${LINE}`, borderRadius: 8, padding: "6px 14px", textAlign: "right" }}>
                      <div style={{ fontSize: 9.5, color: MUTED, letterSpacing: 0.8 }}>KODE PRODUKSI</div>
                      <div style={{ fontSize: 18, fontWeight: 800, lineHeight: "22px", color: TEAL }}>#{order.kode_produksi}</div>
                    </div>
                    <div style={{ background: RED_TINT, border: `1px solid ${RED}`, borderRadius: 8, padding: "6px 14px", textAlign: "right" }}>
                      <div style={{ fontSize: 9.5, color: RED, letterSpacing: 0.8, fontWeight: 700 }}>DEADLINE</div>
                      <div style={{ fontSize: 18, fontWeight: 800, lineHeight: "22px", color: RED }}>{fmtDate(order.deadline) || "—"}</div>
                    </div>
                  </div>
                </div>
              </div>
            ) : (
              <div
                style={{
                  height: HEADN_H,
                  background: TEAL,
                  borderBottom: `3px solid ${ACCENT}`,
                  boxSizing: "border-box",
                  padding: `0 ${PAD_X}px`,
                  display: "flex",
                  alignItems: "center",
                  justifyContent: "space-between",
                  color: "#fff",
                }}
              >
                <div style={{ fontSize: 12, fontWeight: 700, letterSpacing: 1 }}>FORM APPROVAL</div>
                <div style={{ fontSize: 11.5 }}>
                  <b>#{order.kode_produksi}</b> · {order.nama_pemesan} · Deadline {fmtDate(order.deadline) || "—"}
                </div>
              </div>
            )}

            {/* ── Isi ── */}
            <div
              style={{
                height: SHEET_H - (pi === 0 ? HEAD1_H : HEADN_H) - FOOTER_H,
                boxSizing: "border-box",
                padding: `${PAD_T}px ${PAD_X}px ${PAD_B}px`,
                display: "flex",
                flexDirection: "column",
              }}
            >
              {pi === 0 && (
                <div style={{ flexShrink: 0, marginBottom: BLOCK_GAP }}>
                  <SectionTitle n={1}>DETAIL CUSTOMER</SectionTitle>
                  <div
                    style={{
                      height: CUSTOMER_H,
                      boxSizing: "border-box",
                      background: "#f8fbfb",
                      border: `1px solid ${LINE}`,
                      borderRadius: 9,
                      padding: "12px 16px",
                      display: "flex",
                      gap: 28,
                      overflow: "hidden",
                    }}
                  >
                    <div style={{ flex: 1.25, minWidth: 0 }}>
                      <Field label="Nama Customer" value={order.nama_pemesan} bold />
                      <Field label="WA Customer" value={order.no_hp} />
                      <Field label="Alamat" value={alamat} clamp={2} />
                    </div>
                    <div style={{ width: 1, background: LINE }} />
                    <div style={{ flex: 1, minWidth: 0 }}>
                      <Field label="Tanggal Masuk" value={fmtDate(order.tanggal_masuk)} />
                      <Field label="PJ Produksi" value={pjName} />
                      <Field label="Tim" value={teamName} />
                    </div>
                  </div>
                </div>
              )}

              {(pi === 0 || hasCards) && (
                <div style={{ flexShrink: 0 }}>
                  <SectionTitle
                    n={2}
                    right={
                      pi === 0 ? (
                        <span style={{ background: TEAL, color: "#fff", borderRadius: 10, padding: "0 10px", height: 20, lineHeight: "20px", fontSize: 11, fontWeight: 700, letterSpacing: 0.5 }}>
                          TOTAL {grand} PCS
                        </span>
                      ) : undefined
                    }
                  >
                    {pi === 0 ? "RINCIAN PESANAN" : "RINCIAN PESANAN (LANJUTAN)"}
                  </SectionTitle>
                </div>
              )}

              {hasCards ? (
                <div style={{ display: "flex", gap: COL_GAP, alignItems: "flex-start", flexShrink: 0 }}>
                  {page.cols.map((col, ci) => (
                    <div key={ci} style={{ width: COL_W, display: "flex", flexDirection: "column", gap: CARD_GAP }}>
                      {col.map((c) => (
                        <Card key={c.item.id} card={c} />
                      ))}
                    </div>
                  ))}
                </div>
              ) : (
                pi === 0 && (
                  <div style={{ border: `2px dashed ${LINE}`, borderRadius: 9, color: MUTED, fontSize: 12, padding: 16, textAlign: "center" }}>
                    Rincian pesanan belum diisi.
                  </div>
                )
              )}

              {/* ── Halaman terakhir: catatan + TTD (menempel di bawah) ── */}
              {page.final && (
                <div style={{ marginTop: "auto", flexShrink: 0, paddingTop: hasCards ? BLOCK_GAP : 0 }}>
                  {notes.length > 0 && (
                    <div style={{ marginBottom: BLOCK_GAP }}>
                      <SectionTitle n={3}>CATATAN</SectionTitle>
                      <div
                        style={{
                          background: "#fffaf0",
                          border: "1px solid #f0e2bf",
                          borderRadius: 9,
                          padding: "9px 14px",
                          fontSize: 12,
                          lineHeight: "17px",
                          whiteSpace: "pre-line",
                          wordBreak: "break-word",
                        }}
                      >
                        {notes.join("\n")}
                      </div>
                    </div>
                  )}
                  <SectionTitle n={notes.length > 0 ? 4 : 3}>APPROVAL & TTD PENERIMAAN</SectionTitle>
                  <div style={{ display: "flex", gap: 12, height: SIGN_BOX_H }}>
                    <SignBox title="APPROVAL" sub="Nama & tanda tangan" />
                    <SignBox title="CUSTOMER" sub="Nama & tanda tangan" />
                    <SignBox title={COMPANY.name.toUpperCase()} sub="Nama & tanda tangan" />
                  </div>
                </div>
              )}
            </div>

            {/* ── Footer ── */}
            <div
              style={{
                position: "absolute",
                left: PAD_X,
                right: PAD_X,
                bottom: 0,
                height: FOOTER_H,
                borderTop: `1px solid ${LINE}`,
                display: "flex",
                alignItems: "center",
                justifyContent: "space-between",
                fontSize: 10,
                color: MUTED,
              }}
            >
              <span>
                {COMPANY.name} · {COMPANY.address}
              </span>
              <span style={{ fontWeight: 700 }}>
                Halaman {pi + 1} dari {pages.length}
              </span>
            </div>
          </div>
        );
      })}
    </>
  );
}
