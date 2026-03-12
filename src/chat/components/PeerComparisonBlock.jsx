import React from "react";

const LABELS = {
  gross_cases: { en: "Volume", es: "Volumen" },
  confirmed_cases: { en: "Confirmed", es: "Confirmados" },
  confirmed_rate: { en: "Confirmed rate", es: "Tasa confirmación" },
  total_converted_value: { en: "Converted value", es: "Valor convertido" },
  dropped_rate: { en: "Dropped rate", es: "Tasa dropped" },
};

export default function PeerComparisonBlock({ peerComparison, t, lang }) {
  if (!peerComparison || !peerComparison.ranks) return null;
  const { scopeType, entity, peerCount, ranks, averages, entityMetrics, limited } = peerComparison;

  if (peerCount < 2) return null;

  const sectionTitle = lang === "es" ? "Comparación con peers" : "Peer comparison";
  const l = (key) => (LABELS[key] ? LABELS[key][lang] || LABELS[key].en : key);
  const fmt = (v) => (v == null ? "—" : typeof v === "number" ? v.toLocaleString(undefined, { maximumFractionDigits: 1 }) : String(v));

  const box = {
    borderRadius: 12,
    border: `1px solid ${t.mode === "dark" ? "rgba(148,163,184,0.18)" : "rgba(15,23,42,0.10)"}`,
    background: t.mode === "dark" ? "rgba(15,23,42,0.25)" : "rgba(255,255,255,0.85)",
    padding: "12px 14px",
  };

  const headerStyle = {
    fontSize: 12,
    fontWeight: 900,
    color: t.textMuted,
    letterSpacing: 0.2,
    marginBottom: 10,
  };

  const rowStyle = {
    display: "flex",
    justifyContent: "space-between",
    alignItems: "center",
    gap: 12,
    padding: "6px 0",
    fontSize: 12,
    fontWeight: 700,
    color: t.text,
    borderBottom: `1px solid ${t.mode === "dark" ? "rgba(148,163,184,0.08)" : "rgba(15,23,42,0.05)"}`,
  };

  const rankBadge = (rank, total) => {
    if (rank == null) return "—";
    const pct = total ? Math.round((rank / total) * 100) : 0;
    const isTop = pct <= 25;
    const isBottom = pct >= 75;
    return (
      <span
        style={{
          fontWeight: 900,
          color: isTop ? (t.mode === "dark" ? "rgba(34,197,94,0.95)" : "rgb(22,163,74)") : isBottom ? (t.mode === "dark" ? "rgba(239,68,68,0.9)" : "rgb(185,28,28)") : t.text,
        }}
      >
        #{rank} / {total}
      </span>
    );
  };

  return (
    <div style={{ marginTop: 16 }}>
      <div style={headerStyle}>{sectionTitle}</div>
      <div style={box}>
        {limited && (
          <div style={{ ...rowStyle, color: t.textMuted, fontSize: 11, marginBottom: 4 }}>
            {lang === "es" ? "Comparación limitada por tamaño de muestra pequeño." : "Peer comparison limited due to small sample size."}
          </div>
        )}
        {["gross_cases", "confirmed_cases", "confirmed_rate", "total_converted_value", "dropped_rate"].map((key) => {
          const rank = ranks?.[key];
          const avg = averages?.[key];
          const entityVal = entityMetrics?.[key];
          const showVsAvg = (key === "confirmed_rate" || key === "dropped_rate") && entityVal != null && avg != null;
          return (
            <div key={key} style={rowStyle}>
              <div style={{ flex: 1, minWidth: 0 }}>
                <span>{l(key)}</span>
                {showVsAvg && (
                  <div style={{ fontSize: 11, color: t.textMuted, marginTop: 2 }}>
                    {entityVal}% vs {fmt(avg)}% avg
                  </div>
                )}
              </div>
              <span style={{ flexShrink: 0 }}>{rankBadge(rank, peerCount)}</span>
            </div>
          );
        })}
      </div>
    </div>
  );
}
