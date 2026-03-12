import React, { useEffect, useMemo, useState } from "react";
import { useNavigate } from "react-router-dom";

import logoAvatar from "../assets/logo_avatar.png";
import logoWatermark from "../assets/logo_watermark.png";

import { makeTheme } from "../chat/theme";
import s from "../chat/styles";
import MiniChart from "../chat/components/MiniChart";

import { auth } from "../firebase";
import { signOut } from "firebase/auth";
import { resolveUserNameByEmail } from "../api";
import { fetchMonthlyDashboard } from "../api";

import { STORAGE_KEYS } from "../constants";
import { makeId, readStoredName } from "../chat/utils";

/** Extrae métricas desde el texto del summary (fallback, sin tocar backend). */
function parseKpisFromSummary(text = "") {
  const raw = String(text || "");
  const t = raw.replace(/\s+/g, " ").trim();

  const pick = (re) => {
    const m = t.match(re);
    if (!m) return null;
    const n = Number(String(m[1]).replace(/,/g, ""));
    return Number.isFinite(n) ? n : null;
  };

  const pickPct = (re) => {
    const m = t.match(re);
    if (!m) return null;
    const n = Number(String(m[1]).replace(/,/g, ""));
    return Number.isFinite(n) ? n : null;
  };

  const total =
    pick(/last\s+\d+\s+days:\s*([\d,]+)\s+gross\s+cases/i) ??
    pick(/total\s+([\d,]+)\s+gross\s+cases/i) ??
    pick(/([\d,]+)\s+gross\s+cases/i);

  const confirmed =
    pick(/with\s+([\d,]+)\s+confirmed/i) ??
    pick(/confirmed\s+cases?\s+(?:were|=|total(?:ed)?)\s*([\d,]+)/i);

  const confirmationRate =
    pickPct(/([\d.]+)\s*%\s*confirmation\s*rate/i) ??
    pickPct(/confirmation\s*rate\s*(?:is|=)?\s*([\d.]+)\s*%/i);

  const dropped =
    pick(/([\d,]+)\s+cases\s+dropped/i) ??
    pick(/dropped\s+cases?\s+(?:were|=|total(?:ed)?|low\s+at)?\s*([\d,]+)/i) ??
    pick(/dropped\s+cases?\s+.*?\s([\d,]+)/i);

  const droppedRate =
    pickPct(/([\d.]+)\s*%\s*dropped\s*rate/i) ??
    (() => {
      const m = t.match(/dropped[^.]{0,120}\(([\d.]+)\s*%\)/i);
      if (!m) return null;
      const n = Number(m[1]);
      return Number.isFinite(n) ? n : null;
    })();

  const active =
    pick(/active\s+cases?\s+(?:total(?:ed)?|were|=)\s*([\d,]+)/i) ??
    pick(/([\d,]+)\s+active\s+cases/i);

  const referOut =
    pick(/refer-?out\s+cases?\s+(?:were|=|total(?:ed)?)\s*([\d,]+)/i) ??
    pick(/referout\s+cases?\s+(?:were|=|total(?:ed)?)\s*([\d,]+)/i) ??
    pick(/([\d,]+)\s+refer-?out\s+cases/i);

  const problemCases =
    pick(/([\d,]+)\s+problem\s+cases/i) ??
    (/\bno\s+problem\s+cases\b/i.test(t) ? 0 : null);

  return {
    total,
    confirmed,
    confirmationRate,
    dropped,
    droppedRate,
    problemCases,
    active,
    referOut,
  };
}

function fmt(n) {
  if (n === null || n === undefined) return "—";
  try {
    return new Intl.NumberFormat().format(n);
  } catch {
    return String(n);
  }
}

function fmtMoney(n) {
  if (n === null || n === undefined) return "—";
  const v = Number(n);
  if (!Number.isFinite(v)) return "—";
  try {
    return new Intl.NumberFormat(undefined, {
      style: "currency",
      currency: "USD",
      maximumFractionDigits: 0,
    }).format(v);
  } catch {
    return `$${fmt(v)}`;
  }
}

function fmtPct(n) {
  if (n === null || n === undefined) return "—";
  return `${Number(n).toFixed(2)}%`;
}

/** Adapta chart del backend a MiniChart y fuerza colores de estados. */
function adaptChartForMiniChart(chart) {
  if (!chart) return null;

  const colorByLabel = (labelRaw) => {
    const label = String(labelRaw || "").trim().toLowerCase();

    if (label === "confirmed" || label === "good" || label.includes("good")) return "#00B050";
    if (label === "dropped") return "#F4B183";
    if (label.includes("dropped >60") || label.includes("dropped>60")) return "#ED7D31";
    if (label === "problem") return "#E49EDD";
    if (label.includes("problem >30") || label.includes("problem>30")) return "#FFD966";

    if (label === "active") return "#9CA3AF";
    if (label.includes("refer")) return "#8AB4F8";

    return null;
  };

  if (Array.isArray(chart.data) && chart.data.length) {
    const labels = chart.data.map((d) => String(d.label));
    const values = chart.data.map((d) => Number(d.value) || 0);

    return {
      kind: "donut",
      title: chart.title || "",
      labels,
      values,
      colors: labels.map((lab) => colorByLabel(lab) || undefined),
      center: {
        label: "Total",
        value: values.reduce((a, b) => a + b, 0),
      },
    };
  }

  return chart;
}

function splitBullets(text = "") {
  return String(text || "")
    .split("\n")
    .map((l) => l.trim())
    .filter(Boolean)
    .map((l) => l.replace(/^[-•]\s*/, ""));
}

function pickIcon(line = "") {
  const s = line.toLowerCase();
  if (/(riesgo|risk|alerta|alert)/.test(s)) return "🔴";
  if (/(recom|accion|acción|next step|paso|implementar|revisar)/.test(s)) return "🎯";
  if (/(tasa|rate|%|confirm|confirmad|dropped|caid|caíd)/.test(s)) return "📊";
  if (/(problema|problem)/.test(s)) return "🟡";
  return "ℹ️";
}

function buildExecOneLiner(kpis, lang) {
  const total = kpis?.total ?? null;
  const confirmed = kpis?.confirmed ?? null;
  const cr = kpis?.confirmationRate ?? null;
  const dr = kpis?.droppedRate ?? null;
  const dropped = kpis?.dropped ?? null;

  if (lang === "es") {
    return `Mes en curso: ${fmt(total)} casos; ${fmt(confirmed)} confirmados (${fmtPct(cr)}). Caída ${fmtPct(dr)} (${fmt(dropped)}).`;
  }
  return `Month-to-date: ${fmt(total)} cases; ${fmt(confirmed)} confirmed (${fmtPct(cr)}). Dropped rate ${fmtPct(dr)} (${fmt(dropped)}).`;
}

function Accordion({ title, open, setOpen, children, t }) {
  return (
    <div
      style={{
        marginTop: 12,
        border: `1px solid ${t.border}`,
        background: t.mode === "dark" ? "rgba(15,23,42,0.55)" : "rgba(248,250,252,0.95)",
        borderRadius: 14,
        overflow: "hidden",
      }}
    >
      <button
        type="button"
        onClick={() => setOpen((x) => !x)}
        style={{
          width: "100%",
          textAlign: "left",
          padding: "12px 12px",
          display: "flex",
          alignItems: "center",
          justifyContent: "space-between",
          gap: 10,
          background: "transparent",
          border: "none",
          cursor: "pointer",
          color: t.text,
          fontWeight: 950,
          fontSize: 13,
        }}
      >
        <span>{title}</span>
        <span style={{ opacity: 0.85 }}>{open ? "▾" : "▸"}</span>
      </button>

      {open ? <div style={{ padding: 12, paddingTop: 0 }}>{children}</div> : null}
    </div>
  );
}

export default function DashboardPage() {
  const nav = useNavigate();

  const [theme, setTheme] = useState(() => {
    const saved = localStorage.getItem(STORAGE_KEYS.THEME);
    return saved === "light" ? "light" : "dark";
  });

  const [lang, setLang] = useState(() => {
    const saved = localStorage.getItem(STORAGE_KEYS.LANG);
    return saved === "es" ? "es" : "en";
  });

  // eslint-disable-next-line no-unused-vars
  const [clientId] = useState(() => {
    const saved = localStorage.getItem(STORAGE_KEYS.CLIENT_ID);
    if (saved) return saved;
    const id = makeId();
    localStorage.setItem(STORAGE_KEYS.CLIENT_ID, id);
    return id;
  });

  const [userName, setUserName] = useState(() => readStoredName(STORAGE_KEYS.USER_NAME));
  const t = useMemo(() => makeTheme(theme), [theme]);

  const ui = useMemo(() => {
    if (lang === "es") {
      return {
        title: "Dashboard",
        sub: `305 No Fault${userName ? ` · ${userName}` : ""} · Resumen (mes en curso)`,
        online: "Online",
        exec: "Executive summary",
        retry: "Retry",
        updated: "Updated",
        openChat: "Open chat",
        kpiTitle: "Key metrics (mes en curso)",
        top10Title: "Top 10 representantes (mes en curso)",
        top10AttorneysTitle: "Top 10 abogados (mes en curso)",
        top10StatesTitle: "Top 10 estados (mes en curso)",
        chatCta: "Chat",
        chatHint: "Pregúntale a Nexus",
        repCol: "Representante",
        attCol: "Abogado",
        stateCol: "Estado",
      };
    }
    return {
      title: "Dashboard",
      sub: `305 No Fault${userName ? ` · ${userName}` : ""} · Auto summary (month-to-date)`,
      online: "Online",
      exec: "Executive summary",
      retry: "Retry",
      updated: "Updated",
      openChat: "Open chat",
      kpiTitle: "Key metrics (month-to-date)",
      top10Title: "Top 10 reps (month-to-date)",
      top10AttorneysTitle: "Top 10 attorneys (month-to-date)",
      top10StatesTitle: "Top 10 states (month-to-date)",
      chatCta: "Chat",
      chatHint: "Ask Nexus",
      repCol: "Rep",
      attCol: "Attorney",
      stateCol: "State",
    };
  }, [lang, userName]);

  const [loading, setLoading] = useState(false);
  const [summary, setSummary] = useState("");
  const [chart, setChart] = useState(null);

  const [kpiPack, setKpiPack] = useState(null);
  const [updatedAt, setUpdatedAt] = useState(null);

  const [topReps, setTopReps] = useState([]);
  const [topAttorneys, setTopAttorneys] = useState([]);
  const [topStates, setTopStates] = useState([]);
  const [err, setErr] = useState("");

  const [openDetails, setOpenDetails] = useState(false);
  const [openChart, setOpenChart] = useState(false);
  const [openReps, setOpenReps] = useState(false);
  const [openAtts, setOpenAtts] = useState(false);
  const [openStates, setOpenStates] = useState(false);

  useEffect(() => localStorage.setItem(STORAGE_KEYS.THEME, theme), [theme]);
  useEffect(() => localStorage.setItem(STORAGE_KEYS.LANG, lang), [lang]);

  useEffect(() => {
    let mounted = true;

    (async () => {
      try {
        const fbUser = auth.currentUser;
        if (!fbUser) return;

        const email = (fbUser.email || "").trim().toLowerCase();
        if (!email) return;

        const saved = readStoredName(STORAGE_KEYS.USER_NAME);
        if (saved) return;

        const r = await resolveUserNameByEmail(email);
        if (mounted && r?.ok && r?.found && r?.name) {
          localStorage.setItem(STORAGE_KEYS.USER_NAME, r.name);
          setUserName(r.name);
        }
      } catch (e) {
        console.log("resolveUserNameByEmail (dashboard) error:", e?.message);
      }
    })();

    return () => {
      mounted = false;
    };
  }, []);

  const loadMonthlySummary = async () => {
    setLoading(true);
    setErr("");

    try {
      const data = await fetchMonthlyDashboard(lang);
      if (!data?.ok) throw new Error("Invalid dashboard data");

      const k = data.kpis || null;
      setKpiPack(k);

      const autoSummary =
        lang === "es"
          ? `Mes en curso: ${k?.total ?? 0} casos, ${k?.confirmed ?? 0} confirmados (${k?.confirmationRate ?? 0}%), ${k?.dropped ?? 0} dropped (${k?.droppedRate ?? 0}%), problemas: ${k?.problemCases ?? 0}.`
          : `Month-to-date: ${k?.total ?? 0} cases, ${k?.confirmed ?? 0} confirmed (${k?.confirmationRate ?? 0}%), ${k?.dropped ?? 0} dropped (${k?.droppedRate ?? 0}%), problem cases: ${k?.problemCases ?? 0}.`;

      setSummary(String(data.executiveSummary || autoSummary));
      setChart(data.chart || null);
      setUpdatedAt(data.updatedAt || null);

      setTopReps(Array.isArray(data.topReps) ? data.topReps : []);
      setTopAttorneys(Array.isArray(data.topAttorneys) ? data.topAttorneys : []);
      setTopStates(Array.isArray(data.topStates) ? data.topStates : []);
    } catch (e) {
      setErr(e?.message || "Error");
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    loadMonthlySummary();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [lang]);

  const kpis = useMemo(() => {
    const p = kpiPack || parseKpisFromSummary(summary) || {};

    const toNum = (v) => {
      const n = Number(v);
      return Number.isFinite(n) ? n : null;
    };

    return {
      total: toNum(p.total),
      confirmed: toNum(p.confirmed),
      confirmationRate: toNum(p.confirmationRate),
      dropped: toNum(p.dropped),
      droppedRate: toNum(p.droppedRate),
      problemCases: toNum(p.problemCases),
      active: toNum(p.active),
      referOut: toNum(p.referOut),
      conversionValue: toNum(p.conversionValue),
    };
  }, [kpiPack, summary]);

  // ===== styles =====
  const cardWrap = {
    width: "min(1100px, 100%)",
    margin: "0 auto",
    padding: "14px 14px 110px",
    boxSizing: "border-box",
  };

  const panel = {
    border: `1px solid ${t.border}`,
    background: t.surface,
    borderRadius: 18,
    boxShadow:
      t.mode === "dark"
        ? "0 18px 60px rgba(0,0,0,0.40)"
        : "0 18px 60px rgba(2,6,23,0.10)",
    overflow: "hidden",
  };

  const sectionTitle = {
    fontSize: 14,
    fontWeight: 900,
    color: t.text,
    letterSpacing: 0.2,
  };

  const kpiGrid = {
    display: "grid",
    gridTemplateColumns: "repeat(4, minmax(0, 1fr))",
    gap: 10,
    marginTop: 12,
  };

  const kpiCard = {
    border: `1px solid ${t.border}`,
    background: t.mode === "dark" ? "rgba(15,23,42,0.55)" : "rgba(248,250,252,0.95)",
    borderRadius: 14,
    padding: "12px 12px",
    boxSizing: "border-box",
    minHeight: 88,
  };

  const kpiTop = {
    display: "flex",
    alignItems: "center",
    gap: 10,
    marginBottom: 10,
    minWidth: 0,
  };

  const kpiIcon = (tone = "neutral") => ({
    width: 34,
    height: 34,
    borderRadius: 999,
    display: "grid",
    placeItems: "center",
    flexShrink: 0,
    border: `1px solid ${t.border}`,
    background:
      tone === "good"
        ? t.mode === "dark"
          ? "rgba(34,197,94,0.14)"
          : "rgba(34,197,94,0.10)"
        : tone === "warn"
        ? t.mode === "dark"
          ? "rgba(250,204,21,0.14)"
          : "rgba(250,204,21,0.14)"
        : tone === "bad"
        ? t.mode === "dark"
          ? "rgba(248,113,113,0.14)"
          : "rgba(248,113,113,0.12)"
        : t.mode === "dark"
        ? "rgba(255,255,255,0.06)"
        : "rgba(15,23,42,0.04)",
    fontSize: 16,
  });

  const kpiLabel = {
    fontSize: 12,
    fontWeight: 950,
    color: t.text,
    whiteSpace: "nowrap",
    overflow: "hidden",
    textOverflow: "ellipsis",
  };

  const kpiSub = { fontSize: 11, fontWeight: 850, color: t.textMuted, marginTop: 2 };

  const kpiValue = {
    fontSize: 22,
    fontWeight: 1000,
    color: t.text,
    lineHeight: 1.05,
  };

  const kpiFoot = { fontSize: 11, fontWeight: 850, color: t.textMuted, marginTop: 6 };

  const summaryBox = {
    marginTop: 10,
    border: `1px solid ${t.border}`,
    background: t.mode === "dark" ? "rgba(15,23,42,0.55)" : "rgba(248,250,252,0.95)",
    borderRadius: 14,
    padding: 14,
    color: t.text,
    lineHeight: 1.55,
  };

  const errorBox = {
    marginTop: 10,
    borderRadius: 14,
    padding: 12,
    fontSize: 12,
    fontWeight: 900,
    color: t.mode === "dark" ? "#fecaca" : "#b91c1c",
    background: t.mode === "dark" ? "rgba(185,28,28,0.18)" : "#fee2e2",
    border: t.mode === "dark" ? "1px solid rgba(248,113,113,0.35)" : "1px solid #fecaca",
  };

  const topRow = {
    display: "flex",
    alignItems: "center",
    justifyContent: "space-between",
    gap: 10,
    padding: "14px 14px",
    borderBottom: `1px solid ${t.border}`,
    background: t.surface,
  };

  const headerLeft = {
    display: "flex",
    alignItems: "center",
    gap: 12,
    minWidth: 0,
  };

  const headerRight = { display: "flex", alignItems: "center", gap: 12, flex: "0 0 auto" };

  const retryBtn = {
    ...s.langBtn(t),
    fontWeight: 900,
  };

  const fabBtn = {
    position: "fixed",
    right: 16,
    bottom: `calc(16px + env(safe-area-inset-bottom))`,
    height: 52,
    padding: "0 14px 0 12px",
    borderRadius: 999,
    border: `1px solid ${t.border}`,
    background: t.blue,
    color: "#fff",
    display: "inline-flex",
    alignItems: "center",
    gap: 10,
    cursor: "pointer",
    zIndex: 9999,
    boxShadow:
      t.mode === "dark"
        ? "0 18px 40px rgba(0,0,0,0.45)"
        : "0 18px 40px rgba(15,23,42,0.18)",
  };

  const fabImg = {
    width: 24,
    height: 24,
    objectFit: "contain",
    borderRadius: 999,
    background: "rgba(255,255,255,0.15)",
    padding: 4,
  };

  const fabText = {
    fontSize: 13,
    fontWeight: 950,
    letterSpacing: 0.2,
    whiteSpace: "nowrap",
  };

  const fabHint = {
    fontSize: 11,
    fontWeight: 800,
    opacity: 0.9,
    marginTop: -2,
  };

  const responsiveStyle = `
    @media (max-width: 980px) {
      .kpi-grid { grid-template-columns: repeat(2, minmax(0, 1fr)) !important; }
    }
    @media (max-width: 520px) {
      .kpi-grid { grid-template-columns: 1fr !important; }
    }
  `;

  const toneDropped = (kpis.droppedRate ?? 0) >= 2 ? "warn" : "neutral";

  return (
    <>
      <style>{responsiveStyle}</style>

      <div style={s.page(t)}>
        <header style={s.header(t)}>
          <img src={logoWatermark} alt="" aria-hidden="true" style={s.headerWatermark(t)} />

          <div style={s.headerLeft}>
            <div style={s.avatar(t)}>
              <img src={logoAvatar} alt="305 No Fault" style={s.avatarLogo} />
            </div>

            <div style={{ lineHeight: 1.05, minWidth: 0 }}>
              <div style={s.title(t)}>{ui.title}</div>
              <div style={s.subTitle(t)}>{ui.sub}</div>
            </div>
          </div>

          <div style={headerRight}>
            <div style={s.pill(t)}>
              <span style={s.dotOnline} />
              <span style={s.pillText(t)}>{ui.online}</span>
            </div>

            <button
              type="button"
              onClick={() => setLang((x) => (x === "en" ? "es" : "en"))}
              style={s.langBtn(t)}
              title={lang === "en" ? "Español" : "English"}
            >
              {lang === "en" ? "EN" : "ES"}
            </button>

            <button
              type="button"
              onClick={() => setTheme((x) => (x === "dark" ? "light" : "dark"))}
              style={s.themeBtn(t)}
              title={theme === "dark" ? "Modo día" : "Modo noche"}
            >
              {theme === "dark" ? "☀️" : "🌙"}
            </button>

            <button
              type="button"
              onClick={() => {
                signOut(auth);
                nav("/login", { replace: true });
              }}
              style={{ ...s.langBtn(t), marginLeft: 6 }}
              title="Logout"
            >
              ⎋
            </button>
          </div>
        </header>

        <div style={cardWrap}>
          <div style={panel}>
            <div style={topRow}>
              <div style={headerLeft}>
                <div style={{ minWidth: 0 }}>
                  <div style={sectionTitle}>{ui.kpiTitle}</div>
                  <div style={{ fontSize: 12, fontWeight: 800, color: t.textMuted, marginTop: 2 }}>
                    {loading
                      ? "…"
                      : `${ui.updated}: ${
                          updatedAt ? new Date(updatedAt).toLocaleString() : new Date().toLocaleString()
                        }`}
                  </div>
                </div>
              </div>

              <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
                <button type="button" onClick={loadMonthlySummary} disabled={loading} style={retryBtn}>
                  {ui.retry}
                </button>
              </div>
            </div>

            <div style={{ padding: 14 }}>
              {/* ===== KPI GRID (solo 4) ===== */}
              <div className="kpi-grid" style={kpiGrid}>
                <div style={kpiCard}>
                  <div style={kpiTop}>
                    <div style={kpiIcon("neutral")}>📊</div>
                    <div style={{ minWidth: 0 }}>
                      <div style={kpiLabel}>Total cases</div>
                      <div style={kpiSub}>Gross</div>
                    </div>
                  </div>
                  <div style={kpiValue}>{fmt(kpis.total)}</div>
                  <div style={kpiFoot}>Cases</div>
                </div>

                <div style={kpiCard}>
                  <div style={kpiTop}>
                    <div style={kpiIcon("good")}>💵</div>
                    <div style={{ minWidth: 0 }}>
                      <div style={kpiLabel}>{lang === "es" ? "Valor de conversión" : "Conversion value"}</div>
                      <div style={kpiSub}></div>
                    </div>
                  </div>
                  <div style={kpiValue}>{(kpis.conversionValue)}</div>
                  <div style={kpiFoot}>Total</div>
                </div>

                <div style={kpiCard}>
                  <div style={kpiTop}>
                    <div style={kpiIcon("good")}>✅</div>
                    <div style={{ minWidth: 0 }}>
                      <div style={kpiLabel}>Confirmed</div>
                      <div style={kpiSub}>Cases</div>
                    </div>
                  </div>
                  <div style={kpiValue}>{fmt(kpis.confirmed)}</div>
                  <div style={kpiFoot}>Cases</div>
                </div>

                <div style={kpiCard}>
                  <div style={kpiTop}>
                    <div style={kpiIcon(toneDropped)}>⚠️</div>
                    <div style={{ minWidth: 0 }}>
                      <div style={kpiLabel}>Dropped rate</div>
                      <div style={kpiSub}>%</div>
                    </div>
                  </div>
                  <div style={kpiValue}>{fmtPct(kpis.droppedRate ?? null)}</div>
                  <div style={kpiFoot}>Rate</div>
                </div>
              </div>

              {err && <div style={errorBox}>{err}</div>}

              {/* ===== Executive Summary ===== */}
              <div style={{ marginTop: 12 }}>
                <div style={sectionTitle}>{ui.exec}</div>

                <div style={summaryBox}>
                  {loading ? (
                    <span style={{ opacity: 0.9 }}>Loading…</span>
                  ) : (
                    <>
                      <div style={{ fontSize: 13, fontWeight: 900, color: t.text, lineHeight: 1.45 }}>
                        {buildExecOneLiner(kpis, lang)}
                      </div>

                      <Accordion
                        title={lang === "es" ? "Ver análisis detallado" : "View detailed analysis"}
                        open={openDetails}
                        setOpen={setOpenDetails}
                        t={t}
                      >
                        {summary ? (
                          <div style={{ display: "grid", gap: 10 }}>
                            {splitBullets(summary).map((line, i) => (
                              <div
                                key={i}
                                style={{
                                  display: "flex",
                                  gap: 10,
                                  alignItems: "flex-start",
                                  padding: "10px 12px",
                                  borderRadius: 12,
                                  border: `1px solid ${t.border}`,
                                  background: t.mode === "dark" ? "rgba(255,255,255,0.04)" : "rgba(15,23,42,0.03)",
                                }}
                              >
                                <div style={{ fontSize: 16, lineHeight: "18px", marginTop: 1 }}>{pickIcon(line)}</div>
                                <div style={{ fontSize: 13, fontWeight: 850, color: t.text, lineHeight: 1.45 }}>
                                  {line}
                                </div>
                              </div>
                            ))}
                          </div>
                        ) : (
                          <div style={{ padding: 6, opacity: 0.85 }}>—</div>
                        )}
                      </Accordion>
                    </>
                  )}
                </div>

                {/* ===== Chart colapsable ===== */}
                <Accordion
                  title={lang === "es" ? "Ver distribución de estatus" : "View status distribution"}
                  open={openChart}
                  setOpen={setOpenChart}
                  t={t}
                >
                  <MiniChart chart={adaptChartForMiniChart(chart)} t={t} lang={lang} />
                </Accordion>

                {/* ===== TOP 10 REPS colapsable ===== */}
                <Accordion title={ui.top10Title} open={openReps} setOpen={setOpenReps} t={t}>
                  {topReps?.length ? (
                    <table style={{ width: "100%", borderCollapse: "collapse" }}>
                      <thead>
                        <tr style={{ textAlign: "left" }}>
                          <th style={{ padding: "10px 12px", borderBottom: `1px solid ${t.border}` }}>{ui.repCol}</th>
                          <th style={{ padding: "10px 12px", borderBottom: `1px solid ${t.border}` }}>TTD</th>
                          <th style={{ padding: "10px 12px", borderBottom: `1px solid ${t.border}` }}>Converted</th>
                        </tr>
                      </thead>
                      <tbody>
                        {topReps.map((r, i) => {
                          const name = r?.name ?? r?.submitterName ?? "—";
                          const ttd = Number(r?.ttd ?? r?.total ?? 0);
                          const convertedValue = Number(r?.convertedValue ?? 0);
                          return (
                            <tr key={`${name}-${i}`}>
                              <td style={{ padding: "10px 12px", borderBottom: `1px solid ${t.border}` }}>{name}</td>
                              <td style={{ padding: "10px 12px", borderBottom: `1px solid ${t.border}` }}>{fmt(ttd)}</td>
                              <td style={{ padding: "10px 12px", borderBottom: `1px solid ${t.border}` }}>
                                {Number(convertedValue).toFixed(2)}
                              </td>
                            </tr>
                          );
                        })}
                      </tbody>
                    </table>
                  ) : (
                    <div style={{ padding: 12, opacity: 0.85 }}>—</div>
                  )}
                </Accordion>

                {/* ===== TOP 10 ATTORNEYS colapsable ===== */}
                <Accordion title={ui.top10AttorneysTitle} open={openAtts} setOpen={setOpenAtts} t={t}>
                  {topAttorneys?.length ? (
                    <table style={{ width: "100%", borderCollapse: "collapse" }}>
                      <thead>
                        <tr style={{ textAlign: "left" }}>
                          <th style={{ padding: "10px 12px", borderBottom: `1px solid ${t.border}` }}>{ui.attCol}</th>
                          <th style={{ padding: "10px 12px", borderBottom: `1px solid ${t.border}` }}>TTD</th>
                          <th style={{ padding: "10px 12px", borderBottom: `1px solid ${t.border}` }}>Converted</th>
                        </tr>
                      </thead>
                      <tbody>
                        {topAttorneys.map((a, i) => {
                          const name = a?.name ?? a?.attorneyName ?? "—";
                          const ttd = Number(a?.ttd ?? a?.total ?? 0);
                          const convertedValue = Number(a?.convertedValue ?? 0);
                          return (
                            <tr key={`${name}-${i}`}>
                              <td style={{ padding: "10px 12px", borderBottom: `1px solid ${t.border}` }}>{name}</td>
                              <td style={{ padding: "10px 12px", borderBottom: `1px solid ${t.border}` }}>{fmt(ttd)}</td>
                              <td style={{ padding: "10px 12px", borderBottom: `1px solid ${t.border}` }}>
                                 {Number(convertedValue).toFixed(2)}
                              </td>
                            </tr>
                          );
                        })}
                      </tbody>
                    </table>
                  ) : (
                    <div style={{ padding: 12, opacity: 0.85 }}>—</div>
                  )}
                </Accordion>

                  {/* ===== TOP 10 STATES colapsable ===== */}
                <Accordion title={ui.top10StatesTitle} open={openStates} setOpen={setOpenStates} t={t}>
                  {topStates?.length ? (
                    <table style={{ width: "100%", borderCollapse: "collapse" }}>
                      <thead>
                        <tr style={{ textAlign: "left" }}>
                          <th style={{ padding: "10px 12px", borderBottom: `1px solid ${t.border}` }}>{ui.stateCol}</th>
                          <th style={{ padding: "10px 12px", borderBottom: `1px solid ${t.border}` }}>TTD</th>
                          <th style={{ padding: "10px 12px", borderBottom: `1px solid ${t.border}` }}>Converted</th>
                        </tr>
                      </thead>
                      <tbody>
                        {topStates.map((stateItem, i) => {
                          const name = stateItem?.name ?? stateItem?.officeLabel ?? "—";
                          const ttd = Number(stateItem?.ttd ?? stateItem?.total ?? 0);
                          const convertedValue = Number(stateItem?.convertedValue ?? 0);
                          return (
                            <tr key={`${name}-${i}`}>
                              <td style={{ padding: "10px 12px", borderBottom: `1px solid ${t.border}` }}>{name}</td>
                              <td style={{ padding: "10px 12px", borderBottom: `1px solid ${t.border}` }}>{fmt(ttd)}</td>
                              <td style={{ padding: "10px 12px", borderBottom: `1px solid ${t.border}` }}>
                                {Number(convertedValue).toFixed(2)}
                              </td>
                            </tr>
                          );
                        })}
                      </tbody>
                    </table>
                  ) : (
                    <div style={{ padding: 12, opacity: 0.85 }}>—</div>
                  )}
                </Accordion>
              </div>
            </div>
          </div>
        </div>

        {/* ✅ FAB */}
        <button
          type="button"
          onClick={() => nav("/chat")}
          style={fabBtn}
          title={lang === "es" ? "Abrir chat" : "Open chat"}
          aria-label={lang === "es" ? "Abrir chat" : "Open chat"}
        >
          <img src={logoAvatar} alt="" aria-hidden="true" style={fabImg} />
          <div style={{ display: "flex", flexDirection: "column", lineHeight: 1.05, alignItems: "flex-start" }}>
            <div style={fabText}>{ui.chatCta}</div>
            <div style={fabHint}>{ui.chatHint}</div>
          </div>
          <div style={{ fontSize: 18, marginLeft: 4 }} aria-hidden="true">
            💬
          </div>
        </button>
      </div>
    </>
  );
}
