import React from "react";

export default function CardsBlock({ cards, t }) {
  return (
    <div style={{ marginTop: 0, display: "grid", gap: 10 }}>
      {cards.map((c, idx) => {
        const icon = c?.icon || "ℹ️";
        const title = String(c?.title || "").trim();
        const type = String(c?.type || "").toLowerCase();

        const box = {
          borderRadius: 14,
          border: `1px solid ${t.mode === "dark" ? "rgba(148,163,184,0.18)" : "rgba(15,23,42,0.10)"}`,
          background: t.mode === "dark" ? "rgba(2,6,23,0.26)" : "rgba(255,255,255,0.72)",
          padding: "10px 12px",
          backdropFilter: "blur(8px)",
        };

        const header = {
          display: "flex",
          alignItems: "center",
          gap: 10,
          fontWeight: 950,
          fontSize: 12,
          color: t.text,
          letterSpacing: 0.2,
          marginBottom: 6,
        };

        const iconStyle = {
          width: 30,
          height: 30,
          borderRadius: 12,
          display: "grid",
          placeItems: "center",
          border: `1px solid ${t.mode === "dark" ? "rgba(148,163,184,0.25)" : t.border}`,
          background: t.mode === "dark" ? "rgba(30,41,59,0.45)" : "rgba(248,250,252,0.92)",
          fontSize: 16,
          flex: "0 0 auto",
        };

        const body = {
          fontWeight: 800,
          fontSize: 12,
          color: t.mode === "dark" ? "rgba(226,232,240,0.92)" : "rgba(15,23,42,0.88)",
          lineHeight: 1.35,
          whiteSpace: "pre-wrap",
        };

        return (
          <div key={`${type}-${idx}`} style={box}>
            <div style={header}>
              <div style={iconStyle}>{icon}</div>
              <div style={{ minWidth: 0 }}>
                <div style={{ fontWeight: 950 }}>{title || "Info"}</div>
              </div>
            </div>

            {Array.isArray(c?.lines) && c.lines.length > 0 ? (
              <div style={{ display: "grid", gap: 4 }}>
                {c.lines.map((ln, i) => (
                  <div key={i} style={body}>
                    • {ln}
                  </div>
                ))}
              </div>
            ) : (
              <div style={body}>{String(c?.text || "").trim()}</div>
            )}
          </div>
        );
      })}
    </div>
  );
}
