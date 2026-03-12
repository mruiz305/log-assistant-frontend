import React from "react";

/** Formatea fecha para display */
function fmtDate(val) {
  if (val == null || val === "") return "—";
  const d = new Date(val);
  if (Number.isNaN(d.getTime())) return String(val);
  return d.toLocaleDateString(undefined, { year: "numeric", month: "short", day: "numeric" });
}

/** Valor seguro para tabla */
function cell(val) {
  if (val == null || val === "") return "—";
  const s = String(val).trim();
  return s || "—";
}

export default function LogsPreviewBlock({ logs = [], t, lang }) {
  if (!Array.isArray(logs) || logs.length === 0) return null;

  const sectionTitle = lang === "es" ? "Casos recientes" : "Recent cases";

  // Columnas: Date, Status, Confirmed, Name, idot, Attorney, CNV
  const cols = [
    { key: "dateCameIn", label: lang === "es" ? "Fecha" : "Date", fmt: fmtDate },
    { key: "Status", label: lang === "es" ? "Estado" : "Status", fmt: cell },
    {
      key: "Confirmed",
      label: lang === "es" ? "Confirmado" : "Confirmed",
      fmt: (v) => (v === 1 || v === "1" || v === true || String(v).toLowerCase() === "yes" ? (lang === "es" ? "Sí" : "Yes") : (lang === "es" ? "No" : "No")),
    },
    { key: "name", label: lang === "es" ? "Nombre" : "Name", fmt: cell },   
    { key: "attorney", label: lang === "es" ? "Abogado" : "Attorney", fmt: cell },
    {
      key: "convertedValue",
      label: "CNV",
      fmt: (v) => {
        const n = Number(v);
        if (!Number.isFinite(n)) return cell(v);
        return n.toLocaleString(undefined, { minimumFractionDigits: 0, maximumFractionDigits: 2 });
      },
    },
  ];

  // Estilo coherente con el tema
  const tableWrap = {
    overflowX: "auto",
    borderRadius: 12,
    border: `1px solid ${t.mode === "dark" ? "rgba(148,163,184,0.18)" : "rgba(15,23,42,0.10)"}`,
    background: t.mode === "dark" ? "rgba(15,23,42,0.25)" : "rgba(255,255,255,0.85)",
  };

  const table = {
    width: "100%",
    borderCollapse: "collapse",
    fontSize: 12,
    fontWeight: 700,
  };

  const thStyle = {
    textAlign: "left",
    padding: "10px 12px",
    borderBottom: `1px solid ${t.mode === "dark" ? "rgba(148,163,184,0.22)" : "rgba(15,23,42,0.12)"}`,
    color: t.textMuted,
    fontWeight: 900,
    letterSpacing: 0.15,
    whiteSpace: "nowrap",
  };

  const tdStyle = {
    padding: "10px 12px",
    borderBottom: `1px solid ${t.mode === "dark" ? "rgba(148,163,184,0.10)" : "rgba(15,23,42,0.06)"}`,
    color: t.text,
    lineHeight: 1.3,
  };

  const headerRow = {
    fontSize: 12,
    fontWeight: 900,
    color: t.textMuted,
    letterSpacing: 0.2,
    marginBottom: 10,
  };

  return (
    <div style={{ marginTop: 16 }}>
      <div style={headerRow}>{sectionTitle}</div>
      <div style={tableWrap}>
        <table style={table}>
          <thead>
            <tr>
              {cols.map((c) => (
                <th key={c.key} style={thStyle}>
                  {c.label}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {logs.map((row, idx) => (
              <tr key={row.idLead ?? idx}>
                {cols.map((c) => (
                  <td key={c.key} style={tdStyle}>
                    {c.fmt(row[c.key])}
                  </td>
                ))}
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}
