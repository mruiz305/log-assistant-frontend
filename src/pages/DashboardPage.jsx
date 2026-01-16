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
import { fetchWeeklyDashboard } from "../api";

const THEME_KEY = "log_assistant_theme";
const LANG_KEY = "log_assistant_lang";
const CLIENT_ID_KEY = "log_assistant_client_id";
const USER_NAME_KEY = "log_assistant_user_name";

function makeId() {
  return Math.random().toString(16).slice(2) + Date.now().toString(16);
}

function readStoredName(key) {
  const raw = localStorage.getItem(key);
  return String(raw || "").trim();
}

/** Extrae métricas desde el texto del summary (sin tocar backend). */
function parseKpisFromSummary(text = "") {
  const raw = String(text || "");
  const t = raw.replace(/\s+/g, " ").trim(); // normaliza espacios para regex

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

  // ✅ TOTAL: soporta "last 7 days: 964 gross cases" y "total 964 gross cases"
  const total =
    pick(/last\s+\d+\s+days:\s*([\d,]+)\s+gross\s+cases/i) ??
    pick(/total\s+([\d,]+)\s+gross\s+cases/i) ??
    pick(/([\d,]+)\s+gross\s+cases/i); // fallback (primer match)

  const confirmed =
    pick(/with\s+([\d,]+)\s+confirmed/i) ??
    pick(/confirmed\s+cases?\s+(?:were|=|total(?:ed)?)\s*([\d,]+)/i);

  const confirmationRate =
    pickPct(/([\d.]+)\s*%\s*confirmation\s*rate/i) ??
    pickPct(/confirmation\s*rate\s*(?:is|=)?\s*([\d.]+)\s*%/i);

  // ✅ DROPPED: soporta "19 cases dropped" y "Dropped cases ... 19 (1.97%)"
  const dropped =
    pick(/([\d,]+)\s+cases\s+dropped/i) ??
    pick(/dropped\s+cases?\s+(?:were|=|total(?:ed)?|low\s+at)?\s*([\d,]+)/i) ??
    pick(/dropped\s+cases?\s+.*?\s([\d,]+)/i);

  // ✅ DROPPED RATE: soporta "1.97% dropped rate" y "(1.97%)" cerca de Dropped
  const droppedRate =
    pickPct(/([\d.]+)\s*%\s*dropped\s*rate/i) ??
    (() => {
      // busca "(x.xx%)" cerca de la frase "Dropped"
      const m = t.match(/dropped[^.]{0,120}\(([\d.]+)\s*%\)/i);
      if (!m) return null;
      const n = Number(m[1]);
      return Number.isFinite(n) ? n : null;
    })();

  // ✅ ACTIVE / REFEROUT: soporta "Active cases totaled 293; referout cases were 589."
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

function adaptChartForMiniChart(chart) {
  if (!chart) return null;

  // Caso dashboard: { title, data:[{label,value}] }
  if (Array.isArray(chart.data) && chart.data.length) {
    const labels = chart.data.map(d => String(d.label));
    const values = chart.data.map(d => Number(d.value) || 0);

    return {
      kind: 'donut',              // 👈 CLAVE
      title: chart.title || '',
      labels,
      values,
      center: {
        label: 'Total',
        value: values.reduce((a, b) => a + b, 0),
      },
    };
  }

  // Caso chat (ya viene bien formado)
  return chart;
}

function splitBullets(text = "") {
  return String(text || "")
    .split("\n")
    .map((l) => l.trim())
    .filter(Boolean)
    .map((l) => l.replace(/^[-•]\s*/, "")); // quita "- " o "• "
}

function pickIcon(line = "", lang = "es") {
  const s = line.toLowerCase();

  if (/(riesgo|risk|alerta|alert)/.test(s)) return "🔴";
  if (/(recom|accion|acción|next step|paso|implementar|revisar)/.test(s)) return "🎯";
  if (/(tasa|rate|%|confirm|confirmad|dropped|caid|caíd)/.test(s)) return "📊";
  if (/(problema|problem)/.test(s)) return "🟡";
  return "ℹ️";
}

function fmtPct(n) {
  if (n === null || n === undefined) return "—";
  return `${n.toFixed(2)}%`;
}

export default function DashboardPage() {
  const nav = useNavigate();

  const [theme, setTheme] = useState(() => {
    const saved = localStorage.getItem(THEME_KEY);
    return saved === "light" ? "light" : "dark";
  });

  const [lang, setLang] = useState(() => {
    const saved = localStorage.getItem(LANG_KEY);
    return saved === "es" ? "es" : "en";
  });

  const [clientId] = useState(() => {
    const saved = localStorage.getItem(CLIENT_ID_KEY);
    if (saved) return saved;
    const id = makeId();
    localStorage.setItem(CLIENT_ID_KEY, id);
    return id;
  });

  const [userName, setUserName] = useState(() => readStoredName(USER_NAME_KEY));

  const t = useMemo(() => makeTheme(theme), [theme]);

  const ui = useMemo(() => {
    if (lang === "es") {
      return {
        title: "Dashboard",
        sub: `305 No Fault${userName ? ` · ${userName}` : ""} · Resumen (semana)`,
        online: "Online",
        exec: "Executive summary",
        retry: "Retry",
        updated: "Updated",
        openChat: "Open chat",
        kpiTitle: "Key metrics (7 days)",
      };
    }
    return {
      title: "Dashboard",
      sub: `305 No Fault${userName ? ` · ${userName}` : ""} · Auto summary (week)`,
      online: "Online",
      exec: "Executive summary",
      retry: "Retry",
      updated: "Updated",
      openChat: "Open chat",
      kpiTitle: "Key metrics (7 days)",
    };
  }, [lang, userName]);

  const [loading, setLoading] = useState(false);
 const [summary, setSummary] = useState("");
const [chart, setChart] = useState(null);


const [kpiPack, setKpiPack] = useState(null);
const [updatedAt, setUpdatedAt] = useState(null);

const [err, setErr] = useState("");


  useEffect(() => localStorage.setItem(THEME_KEY, theme), [theme]);
  useEffect(() => localStorage.setItem(LANG_KEY, lang), [lang]);

  // Resolver userName por email (sin modal)
  useEffect(() => {
    let mounted = true;

    (async () => {
      try {
        const fbUser = auth.currentUser;
        if (!fbUser) return;

        const email = (fbUser.email || "").trim().toLowerCase();
        if (!email) return;

        const saved = readStoredName(USER_NAME_KEY);
        if (saved) return;

        const r = await resolveUserNameByEmail(email);
        if (mounted && r?.ok && r?.found && r?.name) {
          localStorage.setItem(USER_NAME_KEY, r.name);
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

const loadWeeklySummary = async () => {
  setLoading(true);
  setErr("");

  try {
    const data = await fetchWeeklyDashboard(lang);
    if (!data?.ok) throw new Error("Invalid dashboard data");

    // ✅ tu endpoint trae kpis ya listos
    setKpiPack(data.kpis || null);

    // ✅ si no hay answer, arma un summary simple (opcional)
    const k = data.kpis || {};
    const autoSummary =
      lang === "es"
        ? `Últimos 7 días: ${k.total ?? 0} casos, ${k.confirmed ?? 0} confirmados (${k.confirmationRate ?? 0}%), ${k.dropped ?? 0} dropped (${k.droppedRate ?? 0}%), problemas: ${k.problemCases ?? 0}.`
        : `Last 7 days: ${k.total ?? 0} cases, ${k.confirmed ?? 0} confirmed (${k.confirmationRate ?? 0}%), ${k.dropped ?? 0} dropped (${k.droppedRate ?? 0}%), problem cases: ${k.problemCases ?? 0}.`;

    setSummary(String(data.executiveSummary || ""));


    setChart(data.chart || null);
    setUpdatedAt(data.updatedAt || null);
  } catch (e) {
    setErr(e.message);
  } finally {
    setLoading(false);
  }
};


  useEffect(() => {
    loadWeeklySummary();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [lang]);

  const kpis = useMemo(() => {
  const p = kpiPack || {};
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
};


}, [kpiPack]);


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
    boxShadow: t.mode === "dark" ? "0 18px 60px rgba(0,0,0,0.40)" : "0 18px 60px rgba(2,6,23,0.10)",
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
    gridTemplateColumns: "repeat(6, minmax(0, 1fr))",
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

  // ✅ un poco más de separación general
  const headerRight = { display: "flex", alignItems: "center", gap: 12, flex: "0 0 auto" };

  const retryBtn = {
    ...s.langBtn(t),
    fontWeight: 900,
  };

  const fabBtn = {
    position: "fixed",
    right: 16,
    bottom: `calc(16px + env(safe-area-inset-bottom))`,
    width: 56,
    height: 56,
    borderRadius: 999,
    border: `1px solid ${t.border}`,
    background: t.blue,
    color: "#fff",
    display: "grid",
    placeItems: "center",
    cursor: "pointer",
    zIndex: 9999,
    boxShadow:
      t.mode === "dark"
        ? "0 18px 40px rgba(0,0,0,0.45)"
        : "0 18px 40px rgba(15,23,42,0.18)",
  };

  const fabImg = {
    width: 22,
    height: 22,
    objectFit: "contain",
  };

  const responsiveStyle = `
    @media (max-width: 980px) {
      .kpi-grid { grid-template-columns: repeat(3, minmax(0, 1fr)) !important; }
      .kpi-two  { grid-template-columns: 1fr 1fr !important; }
    }
    @media (max-width: 520px) {
      .kpi-grid { grid-template-columns: repeat(2, minmax(0, 1fr)) !important; }
      .kpi-two  { grid-template-columns: 1fr !important; }
    }
  `;

  const toneDropped = (kpis.droppedRate ?? 0) >= 2 ? "warn" : "neutral";
  const toneConfirm = (kpis.confirmationRate ?? 0) >= 2 ? "good" : "neutral";
  const toneProblem = (kpis.problemCases ?? 0) > 0 ? "bad" : "good";

  useEffect(() => {
  console.log("[DashboardPage] chart state =", chart);
}, [chart]);

useEffect(() => {
  console.log("[DashboardPage] kpiPack state =", kpiPack);
}, [kpiPack]);

useEffect(() => {
  console.log("chart raw:", chart);
  console.log("chart adapted:", adaptChartForMiniChart(chart));
}, [chart]);

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

            {/* ✅ logout con separación para que no se vea “pegado” */}
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
                <button type="button" onClick={loadWeeklySummary} disabled={loading} style={retryBtn}>
                  {ui.retry}
                </button>
              </div>
            </div>

            <div style={{ padding: 14 }}>
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
                    <div style={kpiIcon(toneConfirm)}>{toneConfirm === "good" ? "📈" : "📉"}</div>
                    <div style={{ minWidth: 0 }}>
                      <div style={kpiLabel}>Confirmation rate</div>
                      <div style={kpiSub}>%</div>
                    </div>
                  </div>
                  <div style={kpiValue}>{fmtPct(kpis.confirmationRate ?? null)}</div>
                  <div style={kpiFoot}>Rate</div>
                </div>

                <div style={kpiCard}>
                  <div style={kpiTop}>
                    <div style={kpiIcon("neutral")}>🧯</div>
                    <div style={{ minWidth: 0 }}>
                      <div style={kpiLabel}>Dropped</div>
                      <div style={kpiSub}>Cases</div>
                    </div>
                  </div>
                  <div style={kpiValue}>{fmt(kpis.dropped)}</div>
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

                <div style={kpiCard}>
                  <div style={kpiTop}>
                    <div style={kpiIcon(toneProblem)}>{toneProblem === "good" ? "🟢" : "🛑"}</div>
                    <div style={{ minWidth: 0 }}>
                      <div style={kpiLabel}>Problem cases</div>
                      <div style={kpiSub}>Needs attention</div>
                    </div>
                  </div>
                  <div style={kpiValue}>{fmt(kpis.problemCases)}</div>
                  <div style={kpiFoot}>Cases</div>
                </div>
              </div>

              {(kpis.active !== null || kpis.referOut !== null) && (
                <div
                  className="kpi-two"
                  style={{
                    display: "grid",
                    gridTemplateColumns: "1fr 1fr",
                    gap: 10,
                    marginTop: 10,
                  }}
                >
                  <div style={kpiCard}>
                    <div style={kpiTop}>
                      <div style={kpiIcon("neutral")}>🟦</div>
                      <div style={{ minWidth: 0 }}>
                        <div style={kpiLabel}>Active</div>
                        <div style={kpiSub}>Cases</div>
                      </div>
                    </div>
                    <div style={kpiValue}>{fmt(kpis.active)}</div>
                    <div style={kpiFoot}>Cases</div>
                  </div>

                  <div style={kpiCard}>
                    <div style={kpiTop}>
                      <div style={kpiIcon("neutral")}>🔁</div>
                      <div style={{ minWidth: 0 }}>
                        <div style={kpiLabel}>Refer-out</div>
                        <div style={kpiSub}>Cases</div>
                      </div>
                    </div>
                    <div style={kpiValue}>{fmt(kpis.referOut)}</div>
                    <div style={kpiFoot}>Cases</div>
                  </div>
                </div>
              )}

              {err && <div style={errorBox}>{err}</div>}

              <div style={{ marginTop: 12 }}>
                <div style={sectionTitle}>{ui.exec}</div>

<div style={summaryBox}>
  {loading ? (
    <span style={{ opacity: 0.9 }}>Loading…</span>
  ) : summary ? (
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
          <div style={{ fontSize: 16, lineHeight: "18px", marginTop: 1 }}>
            {pickIcon(line, lang)}
          </div>

          <div style={{ fontSize: 13, fontWeight: 850, color: t.text, lineHeight: 1.45 }}>
            {line}
          </div>
        </div>
      ))}
    </div>
  ) : (
    <span style={{ opacity: 0.85 }}>—</span>
  )}
</div>


                <div style={{ marginTop: 12 }}>
                 <MiniChart chart={adaptChartForMiniChart(chart)} t={t} lang={lang} />

                </div>
              </div>
            </div>
          </div>
        </div>

        {/* ✅ FAB */}
        <button
          type="button"
          onClick={() => nav("/chat")}
          style={fabBtn}
          title={ui.openChat}
          aria-label={ui.openChat}
        >
          <img src={logoAvatar} alt="Chat" style={fabImg} />
        </button>
      </div>
    </>
  );
}
