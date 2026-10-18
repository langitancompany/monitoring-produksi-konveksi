// app/components/apps/SalaryPrintSlip.tsx
//
import type { CSSProperties } from "react";
//
// Komponen print-only untuk SATU slip gaji (diadopsi dari Sablon). Dipakai SalaryView:
// cetak satu slip, atau banyak slip digabung jadi satu dokumen (lib/salaryPrint.tsx).
//
// Komponen ini TIDAK melakukan fetch data apa pun — murni presentational,
// menerima semua data lewat props supaya bisa dipanggil dengan
// renderToStaticMarkup() di luar siklus render React biasa (dalam iframe
// cetak tersembunyi).

export interface SalarySlipRow {
  label: string; // nama pemesan
  detail?: string; // rincian jenis, qty, rate per tahap
  role?: "PJ" | "Tim"; // peran di pesanan ini (hanya slip produksi)
  qty?: number;
  rate?: number;
  amount: number;
}

export interface SalaryPrintSlipProps {
  companyName: string;
  companyAddress: string;
  logoUrl?: string;
  recipientName: string;
  recipientRoleLabel?: string;
  kategoriLabel: string; // "Produksi" | "Tim QC & Packing" | "Bonus Admin"
  periodLabel: string; // "Oktober 2026"
  rows: SalarySlipRow[];
  totalAmount: number;
  paidAt?: string | null; // ISO date string, kalau sudah ditandai lunas
  slipNumber?: string; // opsional, mis. "SLP/2026/09/0001"
}

const currency = (n: number) =>
  `Rp ${Math.round(n || 0).toLocaleString("id-ID")}`;

const formatDate = (iso?: string | null) => {
  if (!iso) return null;
  return new Date(iso).toLocaleDateString("id-ID", {
    day: "2-digit",
    month: "long",
    year: "numeric",
  });
};

export default function SalaryPrintSlip({
  companyName,
  companyAddress,
  logoUrl,
  recipientName,
  recipientRoleLabel,
  kategoriLabel,
  periodLabel,
  rows,
  totalAmount,
  paidAt,
  slipNumber,
}: SalaryPrintSlipProps) {
  const paidLabel = formatDate(paidAt);

  const hasRole = rows.some((r) => !!r.role);

  // Jumlah kolom tabel (Peran hanya muncul di slip produksi).
  const colCount = hasRole ? 5 : 4;

  // Seluruh slip dibuat SATU tabel: header perusahaan, info penerima, dan
  // judul kolom ada di <thead>. Saat rincian panjang dan slip berlanjut ke
  // halaman berikutnya, browser otomatis mengulang <thead> di atas tiap
  // halaman — jadi setiap lembar potongan tetap ada header yang sama.
  // Margin halaman diatur lewat @page di SalaryView (bukan padding di sini),
  // supaya halaman lanjutan juga punya margin atas yang sama.
  return (
    <div
      style={{
        width: "100%",
        fontFamily: "Arial, Helvetica, sans-serif",
        color: "#18181b",
        boxSizing: "border-box",
      }}
    >
      <table
        style={{
          width: "100%",
          borderCollapse: "collapse",
          fontSize: "10px",
        }}
      >
        <thead style={{ display: "table-header-group" }}>
          {/* HEADER */}
          <tr>
            <td colSpan={colCount} style={{ padding: 0 }}>
              <div
                style={{
                  display: "flex",
                  justifyContent: "space-between",
                  alignItems: "flex-start",
                  borderBottom: "2px solid #124540",
                  paddingBottom: "10px",
                }}
              >
                <div
                  style={{ display: "flex", alignItems: "center", gap: "10px" }}
                >
                  {logoUrl ? (
                    // eslint-disable-next-line @next/next/no-img-element
                    <img
                      src={logoUrl}
                      alt={companyName}
                      style={{
                        height: "48px",
                        width: "48px",
                        objectFit: "contain",
                      }}
                    />
                  ) : null}
                  <div>
                    <div
                      style={{
                        fontSize: "16px",
                        fontWeight: 700,
                        color: "#124540",
                      }}
                    >
                      {companyName}
                    </div>
                    <div style={{ fontSize: "10px", color: "#52525b" }}>
                      {companyAddress}
                    </div>
                  </div>
                </div>
                <div style={{ textAlign: "right" }}>
                  <div
                    style={{
                      fontSize: "13px",
                      fontWeight: 700,
                      letterSpacing: "0.05em",
                    }}
                  >
                    SLIP GAJI
                  </div>
                  {slipNumber ? (
                    <div
                      style={{
                        fontSize: "9px",
                        color: "#71717a",
                        fontFamily: "monospace",
                      }}
                    >
                      {slipNumber}
                    </div>
                  ) : null}
                </div>
              </div>
            </td>
          </tr>

          {/* INFO PENERIMA */}
          <tr>
            <td colSpan={colCount} style={{ padding: "14px 0" }}>
              <div
                style={{
                  display: "grid",
                  gridTemplateColumns: "1fr 1fr",
                  gap: "8px",
                  fontSize: "11px",
                }}
              >
                <div>
                  <div
                    style={{
                      color: "#71717a",
                      fontSize: "9px",
                      textTransform: "uppercase",
                    }}
                  >
                    Nama Penerima
                  </div>
                  <div style={{ fontWeight: 700 }}>{recipientName}</div>
                  {recipientRoleLabel ? (
                    <div style={{ color: "#52525b", fontSize: "10px" }}>
                      {recipientRoleLabel}
                    </div>
                  ) : null}
                </div>
                <div>
                  <div
                    style={{
                      color: "#71717a",
                      fontSize: "9px",
                      textTransform: "uppercase",
                    }}
                  >
                    Periode
                  </div>
                  <div style={{ fontWeight: 700 }}>{periodLabel}</div>
                  <div style={{ color: "#52525b", fontSize: "10px" }}>
                    {kategoriLabel}
                  </div>
                </div>
              </div>
            </td>
          </tr>

          {/* JUDUL KOLOM */}
          <tr style={{ background: "#f4f4f5" }}>
            <th style={thStyle}>Keterangan</th>
            {hasRole && (
              <th style={{ ...thStyle, textAlign: "center" }}>Peran</th>
            )}
            <th style={{ ...thStyle, textAlign: "right" }}>Qty</th>
            <th style={{ ...thStyle, textAlign: "right" }}>Rata² /pcs</th>
            <th style={{ ...thStyle, textAlign: "right" }}>Jumlah</th>
          </tr>
        </thead>

        {/* RINCIAN — satu baris tidak dipotong di tengah halaman */}
        <tbody>
          {rows.map((row, i) => (
            <tr
              key={i}
              style={{
                borderBottom: "1px solid #e4e4e7",
                breakInside: "avoid",
                pageBreakInside: "avoid",
              }}
            >
              <td style={tdStyle}>
                {row.label}
                {row.detail ? (
                  <div style={{ color: "#a1a1aa", fontSize: "9px" }}>
                    {row.detail}
                  </div>
                ) : null}
              </td>
              {hasRole && (
                <td style={{ ...tdStyle, textAlign: "center" }}>
                  {row.role ? (
                    <span
                      style={{
                        display: "inline-block",
                        padding: "1px 8px",
                        border: "1px solid #a1a1aa",
                        borderRadius: "999px",
                        fontSize: "9px",
                        fontWeight: 700,
                        textTransform: "uppercase",
                        color: row.role === "PJ" ? "#124540" : "#52525b",
                      }}
                    >
                      {row.role}
                    </span>
                  ) : (
                    "—"
                  )}
                </td>
              )}
              <td style={{ ...tdStyle, textAlign: "right" }}>
                {row.qty !== undefined ? row.qty.toLocaleString("id-ID") : "—"}
              </td>
              <td style={{ ...tdStyle, textAlign: "right" }}>
                {row.rate !== undefined ? currency(row.rate) : "—"}
              </td>
              <td style={{ ...tdStyle, textAlign: "right", fontWeight: 600 }}>
                {currency(row.amount)}
              </td>
            </tr>
          ))}

          {/* TOTAL + STATUS + TANDA TANGAN — satu blok, tidak terpisah halaman */}
          <tr style={{ breakInside: "avoid", pageBreakInside: "avoid" }}>
            <td colSpan={colCount} style={{ padding: "14px 0 0" }}>
              <div
                style={{
                  display: "flex",
                  justifyContent: "flex-end",
                  marginBottom: "18px",
                }}
              >
                <div
                  style={{
                    minWidth: "220px",
                    display: "flex",
                    justifyContent: "space-between",
                    padding: "8px 12px",
                    background: "#124540",
                    color: "#fff",
                    borderRadius: "6px",
                    fontSize: "12px",
                    fontWeight: 700,
                  }}
                >
                  <span>TOTAL GAJI</span>
                  <span>{currency(totalAmount)}</span>
                </div>
              </div>

              <div style={{ marginBottom: "22px" }}>
                {paidLabel ? (
                  <div
                    style={{
                      display: "inline-flex",
                      alignItems: "center",
                      gap: "6px",
                      fontSize: "10px",
                      fontWeight: 700,
                      color: "#15803d",
                      border: "1px solid #86efac",
                      background: "#f0fdf4",
                      padding: "4px 10px",
                      borderRadius: "999px",
                    }}
                  >
                    ✓ LUNAS DIBAYAR — {paidLabel}
                  </div>
                ) : (
                  <div
                    style={{
                      display: "inline-flex",
                      alignItems: "center",
                      gap: "6px",
                      fontSize: "10px",
                      fontWeight: 700,
                      color: "#a16207",
                      border: "1px solid #fde68a",
                      background: "#fffbeb",
                      padding: "4px 10px",
                      borderRadius: "999px",
                    }}
                  >
                    BELUM DIBAYAR
                  </div>
                )}
              </div>

              <div
                style={{
                  display: "flex",
                  justifyContent: "space-between",
                  fontSize: "10px",
                }}
              >
                <div style={{ textAlign: "center", width: "45%" }}>
                  <div style={{ marginBottom: "40px" }}>Diterima oleh,</div>
                  <div
                    style={{
                      borderTop: "1px solid #a1a1aa",
                      paddingTop: "4px",
                    }}
                  >
                    {recipientName}
                  </div>
                </div>
                <div style={{ textAlign: "center", width: "45%" }}>
                  <div style={{ marginBottom: "40px" }}>Mengetahui,</div>
                  <div
                    style={{
                      borderTop: "1px solid #a1a1aa",
                      paddingTop: "4px",
                    }}
                  >
                    {companyName}
                  </div>
                </div>
              </div>
            </td>
          </tr>
        </tbody>
      </table>
    </div>
  );
}

const thStyle: CSSProperties = {
  textAlign: "left",
  padding: "6px 8px",
  fontSize: "9px",
  textTransform: "uppercase",
  color: "#52525b",
  fontWeight: 700,
};

const tdStyle: CSSProperties = {
  padding: "6px 8px",
  color: "#27272a",
};
