import React from "react";
import BotPrettyAnswer from "./BotPrettyAnswer";
import PeerComparisonBlock from "./PeerComparisonBlock";
import s from "../styles";

/**
 * Layout para respuestas logs_performance_review:
 * 1. Performance diagnosis (si existe)
 * 2. Summary (análisis ejecutivo)
 * 3. Peer comparison (si existe)
 * 4. PDF link al final (acción secundaria)
 */
export default function LogsReviewLayout({ meta = {}, text, t, lang }) {
  const { logsPdfLink, logsPreview, peerComparison, analysisText, performanceDiagnosis } = meta;

  const sectionTitle = {
    fontSize: 12,
    fontWeight: 900,
    color: t.textMuted,
    letterSpacing: 0.2,
    marginBottom: 8,
  };

  const separator = {
    height: 1,
    background: t.mode === "dark" ? "rgba(148,163,184,0.14)" : "rgba(15,23,42,0.08)",
    margin: "16px 0",
  };

  const summaryText = analysisText || text || "";

  const diagnosisLabel = lang === "es" ? "Diagnóstico de desempeño:" : "Performance diagnosis:";
  const diagnosisLine = performanceDiagnosis?.diagnosis
    ? `${diagnosisLabel} ${performanceDiagnosis.diagnosis}`
    : "";

  const pdfPromptText =
    lang === "es"
      ? "¿Quieres revisar el log completo? "
      : "Want to review the full log? ";
  const pdfLinkLabel =
    lang === "es" ? "Abrir Log completo (PDF)" : "Open Full Log PDF";

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 0 }}>
      {/* 0. Performance diagnosis (visible line) */}
      {diagnosisLine && (
        <>
          <div style={sectionTitle}>{lang === "es" ? "Diagnóstico" : "Diagnosis"}</div>
          <div
            style={{
              ...s.botAnswerWrap(t),
              fontWeight: 700,
              fontSize: 13,
              color: t.text,
            }}
          >
            {diagnosisLine}
          </div>
          <div style={separator} />
        </>
      )}
      {/* 1. Summary */}
      <div style={sectionTitle}>{lang === "es" ? "Resumen" : "Summary"}</div>
      <div style={s.botAnswerWrap(t)}>
        <BotPrettyAnswer text={summaryText} t={t} lang={lang} showHeader={false} />
      </div>

      {/* 2. Peer comparison */}
      {peerComparison && peerComparison.peerCount >= 2 && (
        <>
          <div style={separator} />
          <PeerComparisonBlock peerComparison={peerComparison} t={t} lang={lang} />
        </>
      )}

      {/* PDF link (acción secundaria al final) */}
      {logsPdfLink && (
        <>
          <div style={separator} />
          <div
            style={{
              fontSize: 13,
              fontWeight: 700,
              color: t.textMuted,
              lineHeight: 1.6,
              marginTop: 4,
            }}
          >
            {pdfPromptText}
            <a
              href={logsPdfLink}
              target="_blank"
              rel="noreferrer"
              style={{
                color: t.mode === "dark" ? "rgba(125,211,252,0.95)" : "rgba(37,99,235,0.95)",
                fontWeight: 800,
                textDecoration: "underline",
                textUnderlineOffset: 3,
              }}
            >
              {pdfLinkLabel}
            </a>
          </div>
        </>
      )}
    </div>
  );
}
