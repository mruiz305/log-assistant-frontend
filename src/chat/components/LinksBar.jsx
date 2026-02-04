// src/chat/components/LinksBar.jsx
import s from "../styles";

function extractUrls(text = "") {
  const raw = String(text || "");
  const urls = raw.match(/https?:\/\/[^\s)]+/g) || [];
  return urls.map((u) => u.replace(/[),.]+$/g, "")).filter(Boolean);
}

function normalizePdfLinks({ links, text } = {}) {
  if (!links) links = null;

  // ✅ 1) Si viene como array (pdfItems)
  // Ej: [{ id:'logs', label:'Log completo (PDF)', url:'https://...' }, ...]
  if (Array.isArray(links)) {
    const findBy = (rxList = []) =>
      links.find((x) => {
        const lbl = String(x?.label || x?.title || x?.name || "").toLowerCase();
        const typ = String(x?.type || x?.key || x?.id || "").toLowerCase();
        return rxList.some((rx) => rx.test(lbl) || rx.test(typ));
      });

    const logItem =
      findBy([/log/, /logs/, /completo/, /complete/, /full/]) ||
      links.find((x) => String(x?.url || "").toLowerCase().includes(".pdf")) ||
      links[0] ||
      null;

    const rosterItem = findBy([/roster/]) || (links.length >= 2 ? links[1] : null);

    const logsPdf = logItem?.url || logItem?.href || logItem?.link || null;
    const rosterPdf = rosterItem?.url || rosterItem?.href || rosterItem?.link || null;

    if (!logsPdf && !rosterPdf) return null;
    return { logsPdf, rosterPdf };
  }

  // ✅ 2) Si viene como objeto (pdfLinks)
  if (links && typeof links === "object") {
    const pick = (...keys) => {
      for (const k of keys) {
        const v = links?.[k];
        if (typeof v === "string" && v.trim()) return v.trim();
        if (v && typeof v === "object") {
          const u = v.url || v.href || v.link;
          if (typeof u === "string" && u.trim()) return u.trim();
        }
      }
      return null;
    };

    const logsPdf = pick("logsPdf", "logPdf", "log", "logs", "logUrl", "logs_url");
    const rosterPdf = pick("rosterPdf", "roster", "rosterUrl", "roster_url");

    if (logsPdf || rosterPdf) return { logsPdf, rosterPdf };
  }

  // ✅ 3) Fallback: extraer urls del texto
  const urls = extractUrls(text);
  const logCandidate =
    urls.find((u) => /log|logs|complete|completo/i.test(u)) ||
    urls.find((u) => /drive\.google\.com|\.pdf/i.test(u)) ||
    null;

  const rosterCandidate = urls.find((u) => /roster/i.test(u)) || (urls.length >= 2 ? urls[1] : null);

  if (!logCandidate && !rosterCandidate) return null;
  return { logsPdf: logCandidate, rosterPdf: rosterCandidate };
}

export default function LinksBar({ links, text, t, lang }) {
  const out = normalizePdfLinks({ links, text });
  if (!out) return null;

  const { logsPdf, rosterPdf } = out;

  const title = lang === "es" ? "Documentos" : "Documents";
  const labelLogs = lang === "es" ? "Log completo (PDF)" : "Full log (PDF)";
  const labelRoster = lang === "es" ? "Roster (PDF)" : "Roster (PDF)";

  return (
    <div style={{ marginTop: 10 }}>
      <div style={{ fontSize: 12, fontWeight: 900, opacity: 0.75, marginBottom: 8 }}>
        {title}
      </div>

      <div style={s.linksWrap(t)}>
        {logsPdf && (
          <a
            href={logsPdf}
            target="_blank"
            rel="noreferrer"
            style={s.linkBtn(t)}
            title={logsPdf}
          >
            📄 {labelLogs}
          </a>
        )}

        {rosterPdf && (
          <a
            href={rosterPdf}
            target="_blank"
            rel="noreferrer"
            style={s.linkBtn(t)}
            title={rosterPdf}
          >
            📋 {labelRoster}
          </a>
        )}
      </div>
    </div>
  );
}
