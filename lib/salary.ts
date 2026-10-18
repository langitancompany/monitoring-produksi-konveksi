// lib/salary.ts
//
// Logika murni Config Harga & Gaji (Bagian 5) — tanpa React / Supabase supaya
// mudah diuji: tests/salary.test.ts. Aturan lengkap & keputusan desain: docs/PRD.md §20.
//
// RINGKAS CARA KERJA GAJI (mengikuti alur Sablon, disesuaikan ke model konveksi):
//  1. PRODUKSI  — per pesanan. Nominal = Σ item (jumlah × rate[jenis, tahap]) untuk tahap
//     Potong Kain & Jahit/Produksi. Dibagi: PJ mendapat `pj_share_percent`%, sisanya
//     dibagi rata ke anggota tim (selain PJ). Tanpa tim → PJ 100%. Tanpa PJ → tim dibagi rata.
//     Hak gaji muncul bila SEMUA tahap produksi pesanan selesai; bulan gaji = bulan
//     tahap produksi terakhir selesai.
//  2. TIM QC    — pool = Σ item (jumlah × (rate QC + rate Packing)) untuk pesanan yang QC-nya
//     lolos & packing selesai, dibagi RATA ke semua user ber-role `qc`.
//  3. ADMIN     — bonus per pesanan SELESAI untuk pembuat pesanan (bila ber-role `admin`):
//     `bonus_admin_closing` + (pcs di atas `batas_pcs_bonus_admin`) × `bonus_admin_per_pcs`.
//  Rate berhistori: dipilih menurut tanggal tahap selesai (effective_date ≤ tanggal itu),
//  jadi menaikkan harga hari ini tidak mengubah gaji bulan lalu.
//  Semua nominal dibulatkan ke Rupiah utuh dengan metode sisa terbesar, jadi jumlah bagian
//  SELALU sama persis dengan totalnya (tidak ada Rupiah yang hilang/lebih).

import type { Order, ProductionStep, ProductionTypeData } from "@/types/order";
import type { TeamData } from "@/types/team";
import type { PricingConfig } from "@/types/salary";
import { completionDate } from "@/lib/orderArchive";
import { hasRole } from "@/lib/roles";
import { parseLocalDate, toLocalISODate, typeLabel } from "@/lib/utils";

// ─── Kunci & nilai bawaan ────────────────────────────────────────────────────

/** Tahap yang digaji sebagai "produksi" (dibagi PJ + tim). */
export const PRODUCTION_STEP_KEYS = ["potong_kain", "produksi_massal"] as const;
/** Tahap yang digaji sebagai "tim QC" (pool dibagi rata). */
export const QC_STEP_KEYS = ["qc", "packing"] as const;

export type RateStepKey = (typeof PRODUCTION_STEP_KEYS)[number] | (typeof QC_STEP_KEYS)[number];

/** Kolom matriks Config Harga (urutan = urutan tampil). */
export const RATE_STEPS: { key: RateStepKey; label: string; group: "produksi" | "qc" }[] = [
  { key: "potong_kain", label: "Potong Kain", group: "produksi" },
  { key: "produksi_massal", label: "Jahit / Produksi", group: "produksi" },
  { key: "qc", label: "QC", group: "qc" },
  { key: "packing", label: "Packing", group: "qc" },
];

export const RATE_CATEGORY = "PRODUKSI" as const;
export const PARAM_CATEGORY = "PARAMETER" as const;

/** Nama parameter aturan gaji (kolom key_name di pricing_configs, category PARAMETER). */
export const PARAM = {
  pjShare: "pj_share_percent",
  adminClosing: "bonus_admin_closing",
  adminLimit: "batas_pcs_bonus_admin",
  adminPerPcs: "bonus_admin_per_pcs",
} as const;
export type ParamKey = (typeof PARAM)[keyof typeof PARAM];

/**
 * Nilai bawaan bila belum ada barisnya di database (migration 007 juga mengisinya).
 * Angka bonus admin = nilai Sablon; pembagian PJ 70% = sistem lama Sablon (PRD §17).
 */
export const PARAM_DEFAULTS: Record<ParamKey, number> = {
  [PARAM.pjShare]: 70,
  [PARAM.adminClosing]: 10000,
  [PARAM.adminLimit]: 50,
  [PARAM.adminPerPcs]: 500,
};

export const PARAM_INFO: { key: ParamKey; label: string; unit: string; hint: string }[] = [
  {
    key: PARAM.pjShare,
    label: "Bagian PJ dari gaji produksi",
    unit: "persen",
    hint: "PJ menerima persen ini; sisanya dibagi rata ke anggota tim lain. Tanpa tim, PJ menerima 100%.",
  },
  {
    key: PARAM.adminClosing,
    label: "Bonus admin per closing",
    unit: "Rp",
    hint: "Diterima admin pembuat pesanan untuk setiap pesanan yang selesai.",
  },
  {
    key: PARAM.adminLimit,
    label: "Batas pcs bonus admin",
    unit: "pcs",
    hint: "Pcs sampai batas ini tidak dapat bonus tambahan.",
  },
  {
    key: PARAM.adminPerPcs,
    label: "Bonus admin per pcs di atas batas",
    unit: "Rp",
    hint: "Dikali jumlah pcs yang melebihi batas.",
  },
];

/** key_name untuk rate satu (jenis produksi, tahap): "kaos_polo:produksi_massal". */
export const rateKey = (jenis: string, stepKey: string) => `${jenis}:${stepKey}`;

export const stepLabel = (stepKey: string) =>
  RATE_STEPS.find((s) => s.key === stepKey)?.label ?? stepKey;

/** Apakah tahap ini ada di template kategori itu? (pesanan non-utama tidak punya Potong & Packing) */
export function stepAppliesTo(kategori: "utama" | "non_utama", stepKey: RateStepKey): boolean {
  if (kategori === "utama") return true;
  return stepKey === "produksi_massal" || stepKey === "qc";
}

export const rupiah = (n: number) => `Rp ${Math.round(n || 0).toLocaleString("id-ID")}`;

// ─── Pembulatan ──────────────────────────────────────────────────────────────

/**
 * Bagi `total` (Rupiah utuh) menurut `weights` jadi bilangan bulat yang JUMLAHNYA
 * persis `total` (metode sisa terbesar; seri → indeks lebih awal). Bobot negatif dianggap 0.
 */
export function allocateRounded(total: number, weights: number[]): number[] {
  if (weights.length === 0) return [];
  const t = Math.max(0, Math.round(total));
  const w = weights.map((x) => (Number.isFinite(x) && x > 0 ? x : 0));
  const sum = w.reduce((a, b) => a + b, 0);
  if (sum <= 0) return w.map(() => 0);
  const exact = w.map((x) => (t * x) / sum);
  const out = exact.map((e) => Math.floor(e));
  let rest = t - out.reduce((a, b) => a + b, 0);
  const order = exact
    .map((e, i) => ({ i, frac: e - Math.floor(e) }))
    .sort((a, b) => b.frac - a.frac || a.i - b.i);
  for (let k = 0; rest > 0 && k < order.length; k++, rest--) out[order[k].i] += 1;
  return out;
}

/**
 * Bagi rata `total` ke `n` orang. Sisa Rupiah dibagikan satu-satu mulai dari orang ke-`rotate`
 * (diputar per pesanan supaya sisanya tidak selalu jatuh ke orang yang sama).
 */
export function splitEqual(total: number, n: number, rotate = 0): number[] {
  if (n <= 0) return [];
  const t = Math.max(0, Math.round(total));
  const base = Math.floor(t / n);
  const rest = t - base * n;
  return Array.from({ length: n }, (_, k) => base + ((((k - rotate) % n) + n) % n < rest ? 1 : 0));
}

// ─── Buku harga (rate berhistori) ────────────────────────────────────────────

export interface RateBook {
  /** Rate yang berlaku pada `dateKey` (YYYY-MM-DD). `null` = belum pernah diatur (beda dengan Rp0 yang disengaja). */
  at(key: string, dateKey: string): number | null;
  /** Parameter aturan pada tanggal itu; bila belum ada barisnya → nilai bawaan. */
  param(key: ParamKey, dateKey: string): number;
}

/**
 * Susun buku harga dari semua baris pricing_configs. Aturan pemilihan sama dengan Sablon:
 * baris dengan effective_date terbesar yang ≤ tanggal; tanggal sama → id terbesar menang
 * (koreksi di hari yang sama = tambah baris baru).
 */
export function buildRateBook(configs: PricingConfig[]): RateBook {
  const byKey = new Map<string, PricingConfig[]>();
  for (const c of configs) {
    const list = byKey.get(c.key_name);
    if (list) list.push(c);
    else byKey.set(c.key_name, [c]);
  }
  for (const list of byKey.values()) {
    list.sort((a, b) =>
      a.effective_date < b.effective_date ? -1 : a.effective_date > b.effective_date ? 1 : a.id - b.id,
    );
  }
  const at = (key: string, dateKey: string): number | null => {
    const list = byKey.get(key);
    if (!list) return null;
    let found: number | null = null;
    for (const c of list) {
      if (c.effective_date > dateKey) break;
      const v = Number(c.value_amount);
      found = Number.isFinite(v) ? v : null;
    }
    return found;
  };
  return {
    at,
    param: (key, dateKey) => at(key, dateKey) ?? PARAM_DEFAULTS[key],
  };
}

/** Rate yang berlaku pada satu tanggal untuk SEMUA key (dipakai matriks Config Harga). */
export function currentRates(configs: PricingConfig[], dateKey: string): Record<string, number> {
  const book = buildRateBook(configs);
  const out: Record<string, number> = {};
  for (const key of new Set(configs.map((c) => c.key_name))) {
    const v = book.at(key, dateKey);
    if (v !== null) out[key] = v;
  }
  return out;
}

// ─── Tanggal & kelayakan gaji ────────────────────────────────────────────────

const dateOrNull = (iso: string | null | undefined): Date | null => {
  if (!iso) return null;
  const d = parseLocalDate(iso);
  return Number.isNaN(d.getTime()) ? null : d;
};

/** Kapan tahap ini selesai (cadangan: timestamp, lalu tanggal pesanan dibuat). */
export function stepWhen(order: Pick<Order, "created_at">, step: ProductionStep): Date {
  return dateOrNull(step.completedAt) ?? dateOrNull(step.timestamp) ?? dateOrNull(order.created_at) ?? new Date(0);
}

const stepOf = (order: Pick<Order, "steps">, key: string) => (order.steps ?? []).find((s) => s.key === key);

const latest = (dates: Date[]): Date =>
  dates.length ? new Date(Math.max(...dates.map((d) => d.getTime()))) : new Date(0);

export function productionSteps(order: Pick<Order, "steps">): ProductionStep[] {
  return (order.steps ?? []).filter((s) => (PRODUCTION_STEP_KEYS as readonly string[]).includes(s.key));
}

/** Semua tahap produksi (Potong & Jahit, atau Produksi untuk non-utama) sudah selesai? */
export function isProduksiTuntas(order: Pick<Order, "steps">): boolean {
  const ps = productionSteps(order);
  return ps.length > 0 && ps.every((s) => s.isCompleted);
}

/** Produksi tuntas + QC lolos + Packing selesai (bila pesanan punya Packing). */
export function isQcTuntas(order: Pick<Order, "steps">): boolean {
  if (!isProduksiTuntas(order)) return false;
  const qc = stepOf(order, "qc");
  if (!qc?.isCompleted || qc.qc?.passed === false) return false;
  const packing = stepOf(order, "packing");
  return !packing || packing.isCompleted;
}

/** Semua tahap selesai (dasar bonus admin). Tidak memakai `status` karena "Ada Kendala" menimpanya. */
export function isSelesai(order: Pick<Order, "steps">): boolean {
  const steps = order.steps ?? [];
  return steps.length > 0 && steps.every((s) => s.isCompleted);
}

/** Tanggal tahap produksi terakhir selesai (dasar bulan gaji produksi). */
export function produksiTuntasAt(order: Pick<Order, "steps" | "created_at">): Date {
  return latest(productionSteps(order).filter((s) => s.isCompleted).map((s) => stepWhen(order, s)));
}

/** Tanggal pekerjaan tim QC selesai: yang paling akhir di antara produksi, QC, dan Packing. */
export function qcTuntasAt(order: Pick<Order, "steps" | "created_at">): Date {
  const dates = [produksiTuntasAt(order)];
  for (const key of QC_STEP_KEYS) {
    const s = stepOf(order, key);
    if (s?.isCompleted) dates.push(stepWhen(order, s));
  }
  return latest(dates);
}

/** Tanggal pesanan selesai (dasar bulan bonus admin) — sama dengan menu Pesanan Selesai. */
export function selesaiAt(order: Pick<Order, "steps" | "updated_at" | "deadline">): Date {
  return dateOrNull(completionDate(order)) ?? new Date(0);
}

/** `month` 1–12. */
export const inMonth = (d: Date, month: number, year: number) =>
  d.getMonth() + 1 === month && d.getFullYear() === year;

// ─── Item & harga satu pesanan ───────────────────────────────────────────────

export interface PayItem {
  jenis: string;
  qty: number;
}

/**
 * Item yang digaji: dari `items`; bila kosong dipakai `jenis_produksi` + `jumlah`
 * (data lama). Jenis yang sama digabung.
 */
export function payItems(order: Pick<Order, "items" | "jenis_produksi" | "jumlah">): PayItem[] {
  const map = new Map<string, number>();
  for (const it of order.items ?? []) {
    const qty = Math.max(0, Math.floor(Number(it.jumlah) || 0));
    if (!it.jenis_produksi || qty === 0) continue;
    map.set(it.jenis_produksi, (map.get(it.jenis_produksi) ?? 0) + qty);
  }
  if (map.size === 0 && order.jenis_produksi && order.jumlah > 0) {
    map.set(order.jenis_produksi, Math.floor(order.jumlah));
  }
  return [...map].map(([jenis, qty]) => ({ jenis, qty }));
}

export interface PayLine {
  jenis: string;
  stepKey: string;
  qty: number;
  /** null = rate belum pernah diatur (dihitung Rp0 dan ditandai) */
  rate: number | null;
  amount: number;
}

export interface OrderPay {
  lines: PayLine[];
  total: number;
  /** key_name rate yang belum diatur */
  missing: string[];
  noItems: boolean;
}

function priceOrder(order: Order, stepKeys: readonly string[], book: RateBook): OrderPay {
  const items = payItems(order);
  const lines: PayLine[] = [];
  const missing = new Set<string>();
  for (const key of stepKeys) {
    const step = stepOf(order, key);
    if (!step || !step.isCompleted) continue;
    // Rate dipilih menurut tanggal TAHAP ITU selesai
    const dateKey = toLocalISODate(stepWhen(order, step));
    for (const it of items) {
      const rate = book.at(rateKey(it.jenis, key), dateKey);
      if (rate === null) missing.add(rateKey(it.jenis, key));
      lines.push({ jenis: it.jenis, stepKey: key, qty: it.qty, rate, amount: it.qty * (rate ?? 0) });
    }
  }
  return {
    lines,
    total: Math.round(lines.reduce((n, l) => n + l.amount, 0)),
    missing: [...missing],
    noItems: items.length === 0,
  };
}

export const priceProduksi = (order: Order, book: RateBook) => priceOrder(order, PRODUCTION_STEP_KEYS, book);
export const priceQc = (order: Order, book: RateBook) => priceOrder(order, QC_STEP_KEYS, book);

export interface AdminBonus {
  amount: number;
  base: number;
  limit: number;
  perPcs: number;
  extraPcs: number;
}

/** Bonus admin untuk satu pesanan selesai (parameter menurut tanggal pesanan selesai). */
export function adminBonus(order: Order, book: RateBook): AdminBonus {
  const dateKey = toLocalISODate(selesaiAt(order));
  const base = book.param(PARAM.adminClosing, dateKey);
  const limit = book.param(PARAM.adminLimit, dateKey);
  const perPcs = book.param(PARAM.adminPerPcs, dateKey);
  const extraPcs = Math.max(0, (order.jumlah || 0) - limit);
  return { amount: Math.round(base + extraPcs * perPcs), base, limit, perPcs, extraPcs };
}

// ─── Susunan pekerja (PJ + tim) ──────────────────────────────────────────────

export interface Crew {
  pj: string | null;
  memberIds: string[];
  /** snapshot = salinan database saat produksi selesai · live = dibaca dari pesanan/tim SEKARANG (cadangan) */
  source: "snapshot" | "live";
}

export function crewOf(
  order: Pick<Order, "crew_snapshot" | "assigned_to" | "team_id">,
  teams: Pick<TeamData, "id" | "member_ids">[],
): Crew {
  const snap = order.crew_snapshot;
  if (snap && typeof snap === "object") {
    return {
      pj: snap.pj ?? null,
      memberIds: Array.isArray(snap.member_ids) ? snap.member_ids : [],
      source: "snapshot",
    };
  }
  const team = order.team_id ? teams.find((t) => t.id === order.team_id) : undefined;
  return { pj: order.assigned_to ?? null, memberIds: team?.member_ids ?? [], source: "live" };
}

export interface CrewShare {
  userId: string;
  role: "PJ" | "Tim";
  amount: number;
}

/**
 * Bagi gaji produksi satu pesanan.
 *  - ada PJ + anggota lain → PJ `pjPercent`%, sisanya rata ke anggota lain
 *  - ada PJ saja           → PJ 100%
 *  - tanpa PJ, ada tim     → dibagi rata ke semua anggota
 *  - tanpa keduanya        → [] (belum bisa dibagikan; ditandai peringatan)
 * PJ yang juga anggota tim tidak dihitung dua kali.
 */
export function splitCrew(
  total: number,
  crew: Pick<Crew, "pj" | "memberIds">,
  pjPercent: number,
): CrewShare[] {
  const pct = Number.isFinite(pjPercent) ? Math.min(100, Math.max(0, pjPercent)) : PARAM_DEFAULTS[PARAM.pjShare];
  const members = [...new Set(crew.memberIds)];
  const helpers = members.filter((id) => id !== crew.pj);

  if (crew.pj) {
    if (helpers.length === 0) return [{ userId: crew.pj, role: "PJ", amount: Math.max(0, Math.round(total)) }];
    const weights = [pct, ...helpers.map(() => (100 - pct) / helpers.length)];
    const amounts = allocateRounded(total, weights);
    return [
      { userId: crew.pj, role: "PJ", amount: amounts[0] },
      ...helpers.map((id, i) => ({ userId: id, role: "Tim" as const, amount: amounts[i + 1] })),
    ];
  }
  if (members.length === 0) return [];
  const amounts = splitEqual(total, members.length);
  return members.map((id, i) => ({ userId: id, role: "Tim" as const, amount: amounts[i] }));
}

// ─── Laporan gaji satu bulan ─────────────────────────────────────────────────

export interface SalaryRow {
  orderId: string;
  kode: string;
  /** nama pemesan (slip memakai ini karena tim tidak hafal kode) */
  label: string;
  detail: string;
  role?: "PJ" | "Tim";
  qty: number;
  /** rata-rata per pcs untuk orang ini (hanya tampilan) */
  rate?: number;
  amount: number;
}

export interface PersonSalary {
  userId: string;
  total: number;
  qty: number;
  orders: number;
  rows: SalaryRow[];
}

export interface OrderWarning {
  orderId: string;
  kode: string;
  nama: string;
  problems: string[];
}

export interface SalaryUserLike {
  id: string;
  name: string;
  role?: string | null;
  roles?: string[] | null;
}

export interface SalaryReport {
  produksi: Record<string, PersonSalary>;
  qc: {
    /** anggota tim QC (user ber-role qc), urut nama */
    members: string[];
    perMember: Record<string, PersonSalary>;
    /** total pool QC bulan ini (sebelum dibagi) */
    poolTotal: number;
    orderCount: number;
    qty: number;
  };
  admin: Record<string, PersonSalary>;
  produksiTotal: number;
  /** 0 bila tidak ada anggota tim QC (uangnya tidak punya penerima) */
  qcTotal: number;
  adminTotal: number;
  warnings: OrderWarning[];
  noQcMembers: boolean;
}

export interface SalaryInput {
  orders: Order[];
  users: SalaryUserLike[];
  teams: Pick<TeamData, "id" | "member_ids">[];
  types: ProductionTypeData[];
  configs: PricingConfig[];
  /** 1–12 */
  month: number;
  year: number;
}

const emptyPerson = (userId: string): PersonSalary => ({ userId, total: 0, qty: 0, orders: 0, rows: [] });

/** "Seragam Sekolah 120 pcs (Potong Rp1.000 + Jahit / Produksi Rp3.000)" */
export function describeLines(lines: PayLine[], types: ProductionTypeData[]): string {
  const byJenis = new Map<string, PayLine[]>();
  for (const l of lines) {
    const list = byJenis.get(l.jenis);
    if (list) list.push(l);
    else byJenis.set(l.jenis, [l]);
  }
  return [...byJenis]
    .map(
      ([jenis, ls]) =>
        `${typeLabel(jenis, types)} ${ls[0].qty} pcs (${ls
          .map((l) => `${stepLabel(l.stepKey)} ${l.rate === null ? "belum diatur" : rupiah(l.rate)}`)
          .join(" + ")})`,
    )
    .join("; ");
}

const missingText = (missing: string[], types: ProductionTypeData[]) =>
  missing
    .map((k) => {
      const [jenis, step] = k.split(":");
      return `${typeLabel(jenis, types)} · ${stepLabel(step ?? "")}`;
    })
    .join(", ");

export function buildSalaryReport(input: SalaryInput): SalaryReport {
  const { users, teams, types, configs, month, year } = input;
  const book = buildRateBook(configs);
  // Urut tanggal dibuat → baris slip berurutan & pembagian sisa Rupiah deterministik
  const orders = input.orders
    .filter((o) => !o.deleted_at)
    .sort((a, b) => (a.created_at < b.created_at ? -1 : a.created_at > b.created_at ? 1 : a.kode_produksi.localeCompare(b.kode_produksi)));

  const warnMap = new Map<string, OrderWarning>();
  const warn = (o: Order, problem: string) => {
    const w = warnMap.get(o.id) ?? { orderId: o.id, kode: o.kode_produksi, nama: o.nama_pemesan, problems: [] };
    if (!w.problems.includes(problem)) w.problems.push(problem);
    warnMap.set(o.id, w);
  };

  // ── 1. Produksi (PJ + tim) ────────────────────────────────────────────────
  const produksi: Record<string, PersonSalary> = {};
  for (const o of orders) {
    if (!isProduksiTuntas(o)) continue;
    const when = produksiTuntasAt(o);
    if (!inMonth(when, month, year)) continue;

    const pay = priceProduksi(o, book);
    const crew = crewOf(o, teams);
    const pct = book.param(PARAM.pjShare, toLocalISODate(when));
    const shares = splitCrew(pay.total, crew, pct);

    if (pay.noItems) warn(o, "Pesanan tidak punya item/jumlah, gaji produksi Rp0.");
    if (pay.missing.length) warn(o, `Rate belum diatur: ${missingText(pay.missing, types)}.`);
    if (shares.length === 0) warn(o, "Belum ada PJ atau tim, gaji produksi belum bisa dibagikan.");
    else if (crew.source === "live") {
      warn(o, "Susunan PJ/tim dibaca dari data sekarang (belum ada salinan; jalankan migration 007).");
    }

    const qty = payItems(o).reduce((n, i) => n + i.qty, 0);
    const detail = describeLines(pay.lines, types);
    for (const s of shares) {
      const p = (produksi[s.userId] ??= emptyPerson(s.userId));
      p.total += s.amount;
      p.qty += qty;
      p.orders += 1;
      p.rows.push({
        orderId: o.id,
        kode: o.kode_produksi,
        label: o.nama_pemesan || o.kode_produksi,
        detail,
        role: s.role,
        qty,
        rate: qty > 0 ? Math.round(s.amount / qty) : undefined,
        amount: s.amount,
      });
    }
  }

  // ── 2. Tim QC (pool dibagi rata ke user ber-role qc) ──────────────────────
  const members = users
    .filter((u) => hasRole(u, "qc"))
    .sort((a, b) => a.name.localeCompare(b.name, "id") || a.id.localeCompare(b.id))
    .map((u) => u.id);
  const perMember: Record<string, PersonSalary> = {};
  for (const id of members) perMember[id] = emptyPerson(id);

  let poolTotal = 0;
  let qcOrders = 0;
  let qcQty = 0;
  for (const o of orders) {
    if (!isQcTuntas(o)) continue;
    if (!inMonth(qcTuntasAt(o), month, year)) continue;

    const pay = priceQc(o, book);
    if (pay.noItems) warn(o, "Pesanan tidak punya item/jumlah, gaji QC Rp0.");
    if (pay.missing.length) warn(o, `Rate belum diatur: ${missingText(pay.missing, types)}.`);

    const qty = payItems(o).reduce((n, i) => n + i.qty, 0);
    poolTotal += pay.total;
    qcOrders += 1;
    qcQty += qty;

    if (members.length === 0) continue;
    const shares = splitEqual(pay.total, members.length, qcOrders - 1);
    const detail = describeLines(pay.lines, types);
    members.forEach((id, i) => {
      const p = perMember[id];
      p.total += shares[i];
      p.qty += qty;
      p.orders += 1;
      p.rows.push({
        orderId: o.id,
        kode: o.kode_produksi,
        label: o.nama_pemesan || o.kode_produksi,
        detail: `${detail} · dibagi rata ${members.length} orang`,
        qty,
        rate: qty > 0 ? Math.round(shares[i] / qty) : undefined,
        amount: shares[i],
      });
    });
  }

  // ── 3. Admin (bonus per pesanan selesai, untuk pembuat pesanan ber-role admin) ──
  const adminIds = new Set(users.filter((u) => hasRole(u, "admin")).map((u) => u.id));
  const admin: Record<string, PersonSalary> = {};
  for (const o of orders) {
    if (!o.created_by || !adminIds.has(o.created_by)) continue;
    if (!isSelesai(o) || !inMonth(selesaiAt(o), month, year)) continue;
    const b = adminBonus(o, book);
    const p = (admin[o.created_by] ??= emptyPerson(o.created_by));
    p.total += b.amount;
    p.qty += o.jumlah || 0;
    p.orders += 1;
    p.rows.push({
      orderId: o.id,
      kode: o.kode_produksi,
      label: o.nama_pemesan || o.kode_produksi,
      detail:
        b.extraPcs > 0
          ? `Closing ${rupiah(b.base)} + ${b.extraPcs} pcs di atas ${b.limit} × ${rupiah(b.perPcs)}`
          : `Closing ${rupiah(b.base)}`,
      qty: o.jumlah || 0,
      amount: b.amount,
    });
  }

  const sum = (r: Record<string, PersonSalary>) => Object.values(r).reduce((n, p) => n + p.total, 0);
  const noQcMembers = members.length === 0 && poolTotal > 0;
  return {
    produksi,
    qc: { members, perMember, poolTotal, orderCount: qcOrders, qty: qcQty },
    admin,
    produksiTotal: sum(produksi),
    qcTotal: members.length > 0 ? sum(perMember) : 0,
    adminTotal: sum(admin),
    warnings: [...warnMap.values()],
    noQcMembers,
  };
}

// ─── Pesan galat database → bahasa yang dimengerti pemilik ───────────────────

type DbError = { code?: string; message?: string } | null | undefined;

/** Tabel/fungsi belum ada atau belum terbaca PostgREST (migration 007 belum dijalankan / belum di-reload). */
const migrationMissing = (err: DbError) => {
  const code = err?.code ?? "";
  const msg = err?.message ?? "";
  return (
    ["42P01", "42883", "PGRST205", "PGRST202"].includes(code) ||
    /(pricing_configs|salary_payments|mark_salary_paid|unmark_salary_paid).*(schema cache|does not exist|not find)/i.test(msg)
  );
};

const MIGRATION_HINT =
  "Tabel gaji belum terbaca. Jalankan supabase/migrations/007_pricing_salary.sql di SQL Editor Supabase; bila sudah dijalankan, restart PostgREST/Supabase API agar daftar tabel dimuat ulang.";

export function pricingErrorMessage(err: DbError): string {
  const code = err?.code ?? "";
  const msg = err?.message ?? "";
  if (migrationMissing(err)) return MIGRATION_HINT;
  if (code === "42501" || /row-level security/i.test(msg)) {
    return "Anda tidak punya izin mengubah harga (butuh izin Config Harga → Edit rate gaji).";
  }
  if (code === "23514") return "Nilai tidak valid: harus bilangan bulat ≥ 0 (persen PJ: 0–100).";
  return msg || "Terjadi kesalahan tak dikenal.";
}

export function salaryErrorMessage(err: DbError): string {
  const code = err?.code ?? "";
  const msg = err?.message ?? "";
  if (migrationMissing(err)) return MIGRATION_HINT;
  if (code === "23505") return "Gaji ini sudah ditandai lunas oleh orang lain. Data dimuat ulang.";
  if (code === "42501") return "Anda tidak punya izin menandai gaji (butuh izin Gaji & Upah → Edit).";
  return msg || "Terjadi kesalahan tak dikenal.";
}
