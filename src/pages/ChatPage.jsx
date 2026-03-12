import React, { useEffect, useMemo, useRef, useState } from "react";

import logoAvatar from "../assets/logo_avatar.png";
import logoWatermark from "../assets/logo_watermark.png";

import { makeTheme } from "../chat/theme";
import s from "../chat/styles";
import { auth, db } from "../firebase";

import { onAuthStateChanged, signOut } from "firebase/auth";
import { sendChatMessage, resolveUserNameByEmail } from "../api";

import { makeId, readStoredName, isLongText, clampStyle, getInitials } from "../chat/utils";
import { STORAGE_KEYS } from "../constants";
import {
  upsertUserDoc,
  loadConversationsFromFirestore,
  saveMessageToFirestore,
  loadMessagesFromFirestore,
  groupConversations,
  fmtShortDate,
  fmtTime,
  dayKey,
  fmtDayLabel,
} from "../chat/firestore";

import BotPrettyAnswer from "../chat/components/BotPrettyAnswer";
import CardsBlock from "../chat/components/CardsBlock";
import LinksBar from "../chat/components/LinksBar";
import LogsReviewLayout from "../chat/components/LogsReviewLayout";
import MiniChart from "../chat/components/MiniChart";
import NameModal from "../chat/components/NameModal";
import { useNavigate } from "react-router-dom";

import { doc, getDoc } from "firebase/firestore";
import { serverTimestamp } from "firebase/firestore";
import { getApp } from "firebase/app";

/** Pick options: primeros 8 + búsqueda (resto colapsado) */
function PickOptionsWithSearch({ options, messageId, onPickOption, loading, t, lang }) {
  const [filter, setFilter] = useState("");
  const showSearch = options.length > 8;
  const filtered = !filter.trim()
    ? options
    : options.filter((opt) =>
        cleanPickLabel(opt?.label || opt?.value || "").toLowerCase().includes(filter.trim().toLowerCase())
      );
  // Sin búsqueda: mostrar solo 8; con búsqueda: mostrar todos los filtrados
  const toShow = !filter.trim() ? filtered.slice(0, 8) : filtered;
  const hiddenCount = !filter.trim() && options.length > 8 ? options.length - 8 : 0;
  return (
    <div style={{ display: "grid", gap: 8, marginTop: 12 }}>
      {showSearch && (
        <>
          <input
            type="text"
            value={filter}
            onChange={(e) => setFilter(e.target.value)}
            placeholder={lang === "es" ? "Buscar para ver más..." : "Search to see more..."}
            style={{
              padding: "10px 14px",
              borderRadius: 12,
              border: `1px solid ${t.border}`,
              background: t.mode === "dark" ? "rgba(15,23,42,0.5)" : "rgba(248,250,252,0.95)",
              color: t.text,
              fontSize: 14,
              outline: "none",
            }}
          />
          {hiddenCount > 0 && (
            <div style={{ fontSize: 12, opacity: 0.8, color: t.textMuted || t.text }}>
              {lang === "es" ? `+${hiddenCount} más. Busca para filtrar.` : `+${hiddenCount} more. Search to filter.`}
            </div>
          )}
        </>
      )}
      {toShow.map((opt, displayIdx) => {
        const origIdx = options.indexOf(opt);
        return (
          <button
            key={`${messageId}-pick-${origIdx}`}
            type="button"
            style={{
              ...pickStyles.option(t),
              cursor: loading ? "not-allowed" : "pointer",
              opacity: loading ? 0.6 : 1,
            }}
            onClick={() => onPickOption(opt, origIdx)}
            disabled={loading}
            title={cleanPickLabel(opt?.label || "")}
          >
            <div style={pickStyles.badge(t)}>{displayIdx + 1}</div>
            <div style={{ ...pickStyles.name(t), flex: 1, whiteSpace: "normal", textOverflow: "unset" }}>
              {cleanPickLabel(opt?.label || opt?.value || "") || "(sin nombre)"}
            </div>
            <div style={{ opacity: 0.7, fontWeight: 900 }}>›</div>
          </button>
        );
      })}
    </div>
  );
}

/** Limpia label para UI: SOLO nombre (sin correo, sin "·", sin repetición) */
function cleanPickLabel(label = "") {
  const raw = String(label || "");
  let s2 = raw.replace(/\S+@\S+\.\S+/g, "").trim();
  s2 = s2.split("·")[0].trim();
  s2 = s2.split("-")[0].trim();
  s2 = s2.replace(/\s+/g, " ").trim();
  return s2;
}

export default function ChatPage() {
  const navigate = useNavigate();

  const [uid, setUid] = useState(null);

  const [conversations, setConversations] = useState([]);
  const [loadingConvs, setLoadingConvs] = useState(false);
  const [drawerOpen, setDrawerOpen] = useState(false);

  // Scope UI (lo manda el backend en cada respuesta)
  const [scopeUi, setScopeUi] = useState({ mode: "general", label: "General" });

  const [theme, setTheme] = useState(() => {
    const saved = localStorage.getItem(STORAGE_KEYS.THEME);
    return saved === "light" ? "light" : "dark";
  });

  const [lang, setLang] = useState(() => {
    const saved = localStorage.getItem(STORAGE_KEYS.LANG);
    return saved === "es" ? "es" : "en";
  });

  const [clientId, setClientId] = useState(() => {
    const saved = localStorage.getItem(STORAGE_KEYS.CLIENT_ID);
    if (saved) return saved;
    const id = makeId();
    localStorage.setItem(STORAGE_KEYS.CLIENT_ID, id);
    return id;
  });

  const [userName, setUserName] = useState(() => readStoredName(STORAGE_KEYS.USER_NAME));
  const [askNameOpen, setAskNameOpen] = useState(false);

  // Header menu (⋯)
  const [menuOpen, setMenuOpen] = useState(false);

  // evita que te “regrese” a lastClientId cuando seleccionas otra conversación
  const didInitClientIdRef = useRef(false);

  // si cargamos historial, NO reemplazar por welcome luego
  const historyLoadedRef = useRef(false);

  // autoscroll inteligente
  const listRef = useRef(null);
  const [isNearBottom, setIsNearBottom] = useState(true);
  const [unreadCount, setUnreadCount] = useState(0);

  // search en conversaciones
  const [convQ, setConvQ] = useState("");

  useEffect(() => {
    try {
      const app = getApp();
      console.log("[FIREBASE] projectId =", app?.options?.projectId);
      console.log("[FIREBASE] authDomain =", app?.options?.authDomain);
    } catch (e) {
      console.warn("[FIREBASE] getApp() failed", e);
    }
  }, []);

  useEffect(() => {
    const unsub = onAuthStateChanged(auth, async (fbUser) => {
      try {
        if (!fbUser) {
          setUid(null);
          setConversations([]);
          historyLoadedRef.current = false;
          didInitClientIdRef.current = false;
          // reset scope cuando no hay user
          setScopeUi({ mode: "general", label: "General" });
          return;
        }

        setUid(fbUser.uid);

        // SOLO UNA VEZ: toma lastClientId si existe
        if (!didInitClientIdRef.current) {
          didInitClientIdRef.current = true;
          try {
            const uref = doc(db, "users", fbUser.uid);
            const usnap = await getDoc(uref);
            const last = usnap.exists() ? usnap.data()?.lastClientId : null;

            if (last && String(last).trim() && last !== clientId) {
              localStorage.setItem(STORAGE_KEYS.CLIENT_ID, last);
              setClientId(last);
            }
          } catch (e) {
            console.warn("[FS] get user doc failed:", e);
          }
        }

        // upsert users/{uid}
        try {
          await upsertUserDoc(fbUser.uid, {
            email: fbUser.email || null,
            lastSeenAt: serverTimestamp(),
            lastClientId: localStorage.getItem(STORAGE_KEYS.CLIENT_ID) || clientId,
            updatedAt: serverTimestamp(),
          });
        } catch (e) {
          console.error("[FS] upsertUserDoc failed:", e);
        }

        // nombre
        const email = (fbUser.email || "").trim().toLowerCase();
        const saved = readStoredName(STORAGE_KEYS.USER_NAME);

        if (saved) {
          setUserName(saved);
          setAskNameOpen(false);
        } else if (email) {
          try {
            const r = await resolveUserNameByEmail(email);
            if (r?.ok && r?.found && r?.name) {
              localStorage.setItem(STORAGE_KEYS.USER_NAME, r.name);
              setUserName(r.name);
              setAskNameOpen(false);
            } else {
              setAskNameOpen(true);
            }
          } catch {
            setAskNameOpen(true);
          }
        } else {
          setAskNameOpen(true);
        }
      } catch (err) {
        console.error("onAuthStateChanged error:", err);
        setAskNameOpen(true);
      }
    });

    return () => unsub();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const t = useMemo(() => makeTheme(theme), [theme]);

  const ui = useMemo(() => {
    const first = userName ? String(userName).trim().split(/\s+/)[0] : "";
    const namePart = first ? ` ${first}` : "";
    if (lang === "es") {
      return {
        welcome:
          `¡Hola${namePart}! 👋 Soy Nexus, tu asistente de datos.\n\n` +
          `¿En qué puedo ayudarte hoy? Puedes preguntar por confirmed, dropped, problem, crédito o links de logs/PDF.\n\n` +
          `Puedes elegir un filtro (scope) arriba para enfocar las consultas por oficina, equipo, director, submitter u otra dimensión.`,
        placeholder: "Escribe aquí…",
        online: "Online",
        more: "Ver más",
        less: "Ver menos",
        typing: "Escribiendo…",
        error: "Ocurrió un error hablando con el asistente.",
        invalid: "Hubo un problema: ",
        pickTitle: "Hay varias coincidencias. Elige una opción:",
        pickCancel: "Cancelar",
        convTitle: "Conversaciones",
        newChat: "Nuevo chat",
        emptyConv: "—",
        searchConv: "Buscar…",
        jumpBottom: "Bajar",
        back: "Ir al dashboard",
        logout: "Cerrar sesión",
        menu: "Menú",
        dashboard: "Dashboard",
      };
    }
    return {
      welcome:
        `Hey${namePart}! 👋 I'm Nexus, your data assistant.\n\n` +
        `How can I help you today? Ask about confirmed, dropped, problem, credit, or log/PDF links.\n\n` +
        `You can select a scope filter above to focus queries by office, team, director, submitter, or other dimensions.`,
      placeholder: "Type here…",
      online: "Online",
      more: "Show more",
      less: "Show less",
      typing: "Typing…",
      error: "There was an error talking to the assistant.",
      invalid: "There was a problem: ",
      pickTitle: "Multiple matches found. Pick one:",
      pickCancel: "Cancel",
      convTitle: "Conversations",
      newChat: "New chat",
      emptyConv: "—",
      searchConv: "Search…",
      jumpBottom: "Jump",
      back: "Go to dashboard",
      logout: "Sign out",
      menu: "Menu",
      dashboard: "Dashboard",
    };
  }, [lang, userName]);

  const [messages, setMessages] = useState(() => [
    { id: makeId(), from: "bot", text: ui.welcome, createdAt: Date.now() },
  ]);

  // solo actualizar welcome si NO hay historial cargado
  useEffect(() => {
    if (historyLoadedRef.current) return;
    setMessages((prev) => {
      if (!Array.isArray(prev) || prev.length === 0) return prev;
      const first = prev[0];
      if (first?.from === "bot") return [{ ...first, text: ui.welcome }, ...prev.slice(1)];
      return prev;
    });
  }, [ui.welcome]);

  const [input, setInput] = useState("");
  const [loading, setLoading] = useState(false);

  const [showAllPrompts, setShowAllPrompts] = useState(false);
  const [pendingPick, setPendingPick] = useState(null);
  const [pickSearchFilter, setPickSearchFilter] = useState("");
  const [collapsedDays, setCollapsedDays] = useState(new Set());

  const refreshConversations = async (opts = {}) => {
    if (!uid) return;
    if (opts?.silent !== true) setLoadingConvs(true);
    try {
      const items = await loadConversationsFromFirestore({ uid, max: 60 });
      setConversations(items);
    } catch (e) {
      console.warn("[FS] load conversations failed:", e);
    } finally {
      if (opts?.silent !== true) setLoadingConvs(false);
    }
  };

  // cargar lista de conversaciones cuando hay uid
  useEffect(() => {
    if (!uid) return;
    refreshConversations({ silent: false });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [uid]);

  // cargar historial cuando cambie clientId
  useEffect(() => {
    if (!uid || !clientId) return;

    (async () => {
      try {
        const history = await loadMessagesFromFirestore({ uid, clientId, max: 80 });
        if (history.length > 0) {
          historyLoadedRef.current = true;
          setMessages(history);

          // RESTAURAR SCOPE desde el historial (último mensaje que lo tenga)
          const lastWithScope = [...history].reverse().find((m) => m?.meta?.scope?.label);
          if (lastWithScope?.meta?.scope?.label) setScopeUi(lastWithScope.meta.scope);
          else setScopeUi({ mode: "general", label: "General" });
        } else {
          historyLoadedRef.current = false;
          setMessages([{ id: makeId(), from: "bot", text: ui.welcome, createdAt: Date.now() }]);
          // reset scope si no hay historial
          setScopeUi({ mode: "general", label: "General" });
        }

        setUnreadCount(0);
        setIsNearBottom(true);
        requestAnimationFrame(() => {
          const el = listRef.current;
          if (el) el.scrollTop = el.scrollHeight;
        });
      } catch (e) {
        console.error("loadMessagesFromFirestore error:", e);
      }
    })();
  }, [uid, clientId, ui.welcome]);

  const quickPrompts = useMemo(() => {
    if (lang === "es") {
      return [
        { label: "Cambiar filtro", preset: "change_scope" },
        { label: "Confirmados (mes)", preset: "confirmed_month" },
        { label: "Mejor confirmación (año)", preset: "best_confirmation_year" },
        { label: "Dropped últimos 3 meses", preset: "dropped_last_3_months" },
        { label: "Resumen (semana)", preset: "summary_week" },
        { label: "Crédito (mes)", preset: "credit_month" },
        { label: "Dropped hoy (oficina)", preset: "dropped_today_office" },
      ];
    }
    return [
      { label: "Change scope", preset: "change_scope" },
      { label: "Confirmed (month)", preset: "confirmed_month" },
      { label: "Best confirmation (year)", preset: "best_confirmation_year" },
      { label: "Dropped last 3 months", preset: "dropped_last_3_months" },
      { label: "Summary (week)", preset: "summary_week" },
      { label: "Credit (month)", preset: "credit_month" },
      { label: "Dropped today (office)", preset: "dropped_today_office" },
    ];
  }, [lang]);

  const visiblePrompts = useMemo(() => {
    const base = showAllPrompts ? quickPrompts : quickPrompts.slice(0, 4);
    return [...base, { label: showAllPrompts ? ui.less : ui.more, __toggle: true }];
  }, [quickPrompts, showAllPrompts, ui.more, ui.less]);

  useEffect(() => localStorage.setItem(STORAGE_KEYS.THEME, theme), [theme]);
  useEffect(() => localStorage.setItem(STORAGE_KEYS.LANG, lang), [lang]);

  // autoscroll inteligente + unread
  const handleListScroll = () => {
    const el = listRef.current;
    if (!el) return;
    const threshold = 140;
    const near = el.scrollHeight - (el.scrollTop + el.clientHeight) < threshold;
    setIsNearBottom(near);
    if (near) setUnreadCount(0);
  };

  useEffect(() => {
    const el = listRef.current;
    if (!el) return;
    el.addEventListener("scroll", handleListScroll, { passive: true });
    return () => el.removeEventListener("scroll", handleListScroll);
  }, []);

  useEffect(() => {
    const el = listRef.current;
    if (!el) return;

    if (isNearBottom) {
      el.scrollTop = el.scrollHeight;
      setUnreadCount(0);
    } else {
      setUnreadCount((c) => c + 1);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [messages.length]);

  const scrollToBottom = () => {
    const el = listRef.current;
    if (!el) return;
    el.scrollTop = el.scrollHeight;
    setUnreadCount(0);
    setIsNearBottom(true);
  };

  // Cerrar menú y modal de scope con ESC
  useEffect(() => {
    const onKey = (e) => {
      if (e.key === "Escape") {
        setMenuOpen(false);
        if (pendingPick?.options?.length && !loading) {
          setPendingPick(null);
          setPickSearchFilter("");
        }
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [pendingPick?.options?.length, loading]);

  const pushBotError = (text) =>
    setMessages((prev) => [...prev, { id: makeId(), from: "bot", text, createdAt: Date.now() }]);

  const toggleExpanded = (id) => {
    setMessages((prev) => prev.map((m) => (m.id === id ? { ...m, expanded: !m.expanded } : m)));
  };

  const saveUserName = (name) => {
    const n = String(name || "").trim();
    if (!n) return;

    localStorage.setItem(STORAGE_KEYS.USER_NAME, n);
    setUserName(n);
    setAskNameOpen(false);

    const botText =
      lang === "es" ? `Perfecto, ${n}. ¿Qué quieres revisar hoy?` : `Perfect, ${n}. What do you want to review today?`;

    setMessages((prev) => [...prev, { id: makeId(), from: "bot", text: botText, createdAt: Date.now() }]);

    if (uid) {
      saveMessageToFirestore({
        uid,
        clientId,
        from: "bot",
        text: botText,
        meta: { system: "name_saved" },
        lang,
      }).catch(console.error);
    }
  };

  const handleSendText = async (text, options = {}) => {
    const trimmed = (text || "").trim();
    if (!trimmed || loading) return;

    if (/^cambiar mi nombre$/i.test(trimmed) || /^change my name$/i.test(trimmed)) {
      setAskNameOpen(true);
      return;
    }

    if (!options?.preset) setPendingPick(null);

    const userMsg = { id: makeId(), from: "user", text: trimmed, createdAt: Date.now() };
    setMessages((prev) => [...prev, userMsg]);

    if (uid) {
      saveMessageToFirestore({
        uid,
        clientId,
        from: "user",
        text: trimmed,
        meta: options?.preset ? { preset: options.preset } : null,
        lang,
      }).catch((e) => console.error("[FS] user message save failed:", e));

      upsertUserDoc(uid, {
        lastClientId: clientId,
        lastSeenAt: serverTimestamp(),
        updatedAt: serverTimestamp(),
      }).catch(() => {});
    }

    setLoading(true);

    try {
      const meta = {
        ...(options?.preset ? { preset: options.preset } : {}),
        ...(scopeUi?.label && scopeUi.label !== "General" ? { scope: scopeUi } : {}),
      };
      const data = await sendChatMessage(
        trimmed,
        lang,
        clientId,
        userName,
        options?.preset,
        Object.keys(meta).length ? meta : null
      );

      if (data?.ok) {
        // Solo popup para scope type (General, Office, POD...). Candidatos (person, attorney, etc.) van en el chat
        setPendingPick(data.pick?.type === "scope_type" ? data.pick : null);

        // actualizar scope en UI si backend lo envía
        if (data?.scope?.label) setScopeUi(data.scope);

        // Prioridad: pdfItems (array) -> pdfLinks (object) -> links (legacy)
        const linksPayload = data.pdfItems || data.pdfLinks || data.links || null;

        const botMeta = {
          rowCount: data.rowCount,
          links: linksPayload,
          chart: data.chart || null,
          cards: Array.isArray(data.cards) ? data.cards : null,
          aiComment: data.aiComment || null,
          preset: options?.preset || null,
          scope: data.scope || null,
          pick: data.pick || null,
          mode: data.mode || null,
          logsPreview: Array.isArray(data.logsPreview) ? data.logsPreview : null,
          logsPdfLink: data.logsPdfLink || null,
          peerComparison: data.peerComparison || null,
          analysisText: data.analysisText || null,
          performanceDiagnosis: data.performanceDiagnosis || null,
        };

        const botMsg = {
          id: makeId(),
          from: "bot",
          text: data.answer,
          expanded: false,
          meta: botMeta,
          suggestions: Array.isArray(data.suggestions) ? data.suggestions : [],
          createdAt: Date.now(),
        };

        setMessages((prev) => [...prev, botMsg]);

        if (uid) {
          saveMessageToFirestore({
            uid,
            clientId,
            from: "bot",
            text: data.answer,
            meta: botMeta,
            lang,
          }).catch((e) => console.error("[FS] bot message save failed:", e));

          upsertUserDoc(uid, {
            lastClientId: clientId,
            lastSeenAt: serverTimestamp(),
            updatedAt: serverTimestamp(),
          }).catch(() => {});

          refreshConversations({ silent: true });
        }
      } else {
        pushBotError(`${ui.invalid}${data?.error || "Invalid response"}`);
      }
    } catch (e) {
      console.error(e);
      pushBotError(ui.error);
    } finally {
      setLoading(false);
    }
  };

  const onPickOption = async (opt, index) => {
    if (loading) return;

    // Enviar índice 1-based ("1", "2"...) Y value como fallback para que el backend resuelva
    const msg = String(index + 1);
    setMessages((prev) => [...prev, { id: makeId(), from: "user", text: msg, createdAt: Date.now() }]);

    if (uid) {
      saveMessageToFirestore({
        uid,
        clientId,
        from: "user",
        text: msg,
        meta: {
          pick: true,
          pickedIndex: index + 1,
          pickedLabel: cleanPickLabel(opt?.label || ""),
        },
        lang,
      }).catch((e) => console.error("[FS] pick save failed:", e));
    }

    setLoading(true);
    try {
      // Enviamos índice 1-based + value/label en meta para que el backend resuelva el pick
      const meta = { pick: true, pickIndex: index, pickedIndex: index + 1, pickValue: opt?.value || opt?.label };
      if (import.meta.env.DEV) {
        console.log("[ChatPage] onPickOption envía msg=", msg, "clientId=", clientId, "meta=", meta);
      }
      const data = await sendChatMessage(msg, lang, clientId, userName, null, meta);

      if (data?.ok) {
        // actualizar scope en UI si backend lo envía (también en picks)
        if (data?.scope?.label) setScopeUi(data.scope);

        const linksPayload = data.pdfItems || data.pdfLinks || data.links || null;

        const botMeta = {
          rowCount: data.rowCount,
          links: linksPayload,
          chart: data.chart || null,
          cards: Array.isArray(data.cards) ? data.cards : null,
          aiComment: data.aiComment || null,
          preset: null,
          scope: data.scope || null,
          pick: data.pick || null,
          mode: data.mode || null,
          logsPreview: Array.isArray(data.logsPreview) ? data.logsPreview : null,
          logsPdfLink: data.logsPdfLink || null,
          peerComparison: data.peerComparison || null,
          analysisText: data.analysisText || null,
          performanceDiagnosis: data.performanceDiagnosis || null,
        };

        setMessages((prev) => [
          ...prev,
          {
            id: makeId(),
            from: "bot",
            text: data.answer,
            expanded: false,
            meta: botMeta,
            suggestions: Array.isArray(data.suggestions) ? data.suggestions : [],
            createdAt: Date.now(),
          },
        ]);

        // Solo popup para scope type. Candidatos van en el chat (con opciones clicables)
        setPendingPick(data.pick?.type === "scope_type" ? data.pick : null);

        if (uid) {
          saveMessageToFirestore({
            uid,
            clientId,
            from: "bot",
            text: data.answer,
            meta: botMeta,
            lang,
          }).catch((e) => console.error("[FS] bot pick-answer save failed:", e));

          refreshConversations({ silent: true });
        }
      } else {
        pushBotError(`${ui.invalid}${data?.error || "Invalid response"}`);
      }
    } catch (e) {
      console.error(e);
      pushBotError(ui.error);
    } finally {
      setLoading(false);
    }
  };

  const onSubmit = async (e) => {
    e.preventDefault();
    await handleSendText(input);
    setInput("");
  };

  const onQuick = (item) => {
    if (loading) return;

    if (item.__toggle) {
      setShowAllPrompts((v) => !v);
      return;
    }

    if (item.preset === "change_name") {
      setAskNameOpen(true);
      return;
    }

    handleSendText(item.label, { preset: item.preset });
  };

  const startNewChat = () => {
    const id = makeId();
    localStorage.setItem(STORAGE_KEYS.CLIENT_ID, id);
    historyLoadedRef.current = false;
    setClientId(id);
    setDrawerOpen(false);
    setUnreadCount(0);
    setIsNearBottom(true);
    setMenuOpen(false);

    // reset scope en chat nuevo
    setScopeUi({ mode: "general", label: "General" });
  };

  const openConversation = (cid) => {
    if (!cid) return;
    localStorage.setItem(STORAGE_KEYS.CLIENT_ID, cid);
    setClientId(cid);
    setDrawerOpen(false);
    setUnreadCount(0);
    setIsNearBottom(true);
    setMenuOpen(false);
    // (scopeUi se restablece cuando carga el historial en el useEffect)
  };

  const grouped = useMemo(() => groupConversations(conversations || [], lang), [conversations, lang]);

  const groupedFiltered = useMemo(() => {
    const q = String(convQ || "").trim().toLowerCase();
    if (!q) return grouped;

    const filtered = [];
    for (const g of grouped) {
      const items = (g.items || []).filter((c) => {
        const txt = String(c.lastText || "").toLowerCase();
        return txt.includes(q);
      });
      if (items.length) filtered.push({ ...g, items });
    }
    return filtered;
  }, [grouped, convQ]);

  // helper: en vez de que `pendingPick` afecte TODOS los mensajes,
  // solo tratamos "raw" el ÚLTIMO mensaje bot cuando hay pick activo.
  const isPickPromptMessage = (msgIndex) => {
    if (!pendingPick?.options?.length) return false;
    return msgIndex === messages.length - 1;
  };

  let lastDay = null;

  return (
    <>
      <style>{`
        .chat-input::placeholder {
          color: ${t.mode === "dark" ? "rgba(203,213,225,0.75)" : "rgba(71,85,105,0.75)"};
          font-weight: 500;
        }

        .chat-shell {
          width: 100%;
          height: 100%;
          display: flex;
          min-height: 100vh;
        }

        .chat-main {
          flex: 1 1 auto;
          min-width: 0;
          display: flex;
          flex-direction: column;
          position: relative;
        }

        .conv-sidebar {
          width: 320px;
          flex: 0 0 320px;
          border-right: 1px solid ${t.border};
          background: ${t.mode === "dark" ? "rgba(2,6,23,0.55)" : "rgba(248,250,252,0.98)"};
          backdrop-filter: blur(10px);
          display: none;
          flex-direction: column;
        }

        .conv-top {
          display: flex;
          align-items: center;
          justify-content: space-between;
          padding: 12px 12px;
          border-bottom: 1px solid ${t.border};
        }

        .conv-title {
          font-weight: 950;
          font-size: 13px;
          color: ${t.text};
          letter-spacing: .2px;
        }

        .icon-btn {
          width: 42px;
          height: 42px;
          border-radius: 13px;
          border: 1px solid ${t.mode === "dark" ? "rgba(148,163,184,0.40)" : t.border};
          background: ${t.mode === "dark" ? "rgba(30,41,59,0.62)" : "rgba(255,255,255,0.88)"};
          color: ${t.mode === "dark" ? "rgba(226,232,240,0.95)" : "rgba(15,23,42,0.92)"};
          display: flex;
          align-items: center;
          justify-content: center;
          padding: 0;
          line-height: 1;
          cursor: pointer;
          box-shadow: ${t.mode === "dark" ? "0 10px 26px rgba(0,0,0,0.30)" : "0 10px 26px rgba(15,23,42,0.10)"};
          transition: transform .12s ease, filter .12s ease, background .12s ease;
        }
        .icon-btn:hover {
          transform: translateY(-1px);
          filter: brightness(${t.mode === "dark" ? 1.06 : 1.02});
          background: ${t.mode === "dark" ? "rgba(51,65,85,0.70)" : "rgba(255,255,255,0.95)"};
        }
        .icon-btn > span {
          display: block;
          line-height: 1;
          font-size: 18px;
          color: inherit;
        }

        .conv-new {
          margin: 12px;
          padding: 10px 12px;
          border-radius: 14px;
          border: 1px solid ${t.border};
          background: ${t.mode === "dark" ? "rgba(59,130,246,0.16)" : "rgba(59,130,246,0.10)"};
          color: ${t.text};
          font-weight: 900;
          cursor: pointer;
          display: flex;
          gap: 10px;
          align-items: center;
          justify-content: center;
          transition: transform .12s ease;
        }
        .conv-new:hover { transform: translateY(-1px); }

        .conv-search {
          margin: 0 12px 12px;
          padding: 10px 12px;
          border-radius: 14px;
          border: 1px solid ${t.border};
          background: ${t.mode === "dark" ? "rgba(15,23,42,0.35)" : "rgba(255,255,255,0.85)"};
          color: ${t.text};
          font-weight: 900;
          outline: none;
        }

        .conv-list {
          padding: 10px 12px 14px;
          overflow: auto;
          flex: 1;
        }

        .conv-group-title {
          font-size: 11px;
          font-weight: 950;
          letter-spacing: .18em;
          color: ${t.textMuted};
          margin: 12px 6px 8px;
        }

        .conv-item {
          width: 100%;
          text-align: left;
          border: 1px solid ${t.border};
          background: ${t.mode === "dark" ? "rgba(15,23,42,0.35)" : "rgba(255,255,255,0.9)"};
          border-radius: 14px;
          padding: 10px 12px;
          display: flex;
          align-items: center;
          justify-content: space-between;
          gap: 10px;
          margin-bottom: 10px;
          cursor: pointer;
          transition: transform .12s ease, box-shadow .12s ease;
        }
        .conv-item:hover { transform: translateY(-1px); }

        .conv-item.active {
          outline: 2px solid ${t.blue};
          outline-offset: 1px;
        }

        .conv-left {
          min-width: 0;
          display: flex;
          flex-direction: column;
          gap: 4px;
        }

        .conv-name {
          font-weight: 950;
          font-size: 13px;
          color: ${t.text};
          white-space: nowrap;
          overflow: hidden;
          text-overflow: ellipsis;
          max-width: 100%;
          display: flex;
          align-items: center;
          gap: 8px;
        }

        .conv-dot {
          width: 8px;
          height: 8px;
          border-radius: 50%;
          background: rgba(34,197,94,.9);
          box-shadow: 0 0 0 3px rgba(34,197,94,.12);
          flex: 0 0 auto;
        }

        .conv-snippet {
          font-weight: 800;
          font-size: 12px;
          color: ${t.textMuted};
          white-space: nowrap;
          overflow: hidden;
          text-overflow: ellipsis;
          max-width: 100%;
        }

        .conv-date {
          flex: 0 0 auto;
          font-weight: 900;
          font-size: 12px;
          color: ${t.textMuted};
        }

        .drawer-overlay { position: fixed; inset: 0; background: rgba(0,0,0,0.35); z-index: 9998; }
        .drawer {
          position: fixed; top: 0; left: 0; height: 100%; width: min(340px, 88vw);
          z-index: 9999; display: flex; flex-direction: column;
          border-right: 1px solid ${t.border};
          background: ${t.mode === "dark" ? "rgba(2,6,23,0.92)" : "rgba(255,255,255,0.98)"};
          backdrop-filter: blur(12px);
        }

        @media (min-width: 980px) {
          .conv-sidebar { display: flex; }
          .hamburger-only { display: none !important; }
        }
        @media (max-width: 979px) {
          .hamburger-only { display: flex !important; }
        }

        .msg-in { animation: fadeUp .14s ease-out; }
        @keyframes fadeUp { from { opacity:0; transform: translateY(6px);} to { opacity:1; transform: translateY(0);} }

        .scroll-down {
          position: absolute;
          right: 16px;
          bottom: 92px;
          z-index: 50;
          border-radius: 999px;
          border: 1px solid ${t.border};
          background: ${t.mode === "dark" ? "rgba(15,23,42,0.78)" : "rgba(255,255,255,0.92)"};
          backdrop-filter: blur(10px);
          color: ${t.text};
          font-weight: 950;
          padding: 10px 12px;
          display: flex;
          align-items: center;
          gap: 10px;
          cursor: pointer;
          box-shadow: ${t.mode === "dark" ? "0 10px 30px rgba(0,0,0,0.35)" : "0 10px 30px rgba(15,23,42,0.10)"};
          transition: transform .12s ease;
        }
        .scroll-down:hover { transform: translateY(-1px); }

        .scroll-badge {
          min-width: 26px;
          height: 22px;
          padding: 0 8px;
          border-radius: 999px;
          display: grid;
          place-items: center;
          font-size: 12px;
          font-weight: 950;
          background: ${t.mode === "dark" ? "rgba(59,130,246,0.20)" : "rgba(59,130,246,0.14)"};
          border: 1px solid ${t.mode === "dark" ? "rgba(59,130,246,0.25)" : "rgba(59,130,246,0.20)"};
          color: ${t.text};
        }

        /* ✅ Sección “Attachments/Insights” dentro del bubble bot */
        .meta-stack {
          margin-top: 10px;
          display: grid;
          gap: 10px;
        }

        .soft-sep {
          height: 1px;
          background: ${t.mode === "dark" ? "rgba(148,163,184,0.14)" : "rgba(15,23,42,0.08)"};
          margin: 10px 0;
        }

        .scope-pill:hover {
          border-color: ${t.mode === "dark" ? "rgba(148,163,184,0.25)" : "rgba(15,23,42,0.15)"} !important;
          background: ${t.mode === "dark" ? "rgba(30,41,59,0.6)" : "rgba(241,245,249,0.9)"} !important;
        }
        .scope-pill.filtering:hover {
          border-color: ${t.mode === "dark" ? "rgba(56,189,248,0.5)" : "rgba(59,130,246,0.45)"} !important;
          background: ${t.mode === "dark" ? "rgba(56,189,248,0.16)" : "rgba(59,130,246,0.12)"} !important;
        }

        .quick-chip:hover {
          transform: translateY(-1px);
          border-color: ${t.mode === "dark" ? "rgba(148,163,184,0.25)" : "rgba(15,23,42,0.12)"} !important;
          background: ${t.mode === "dark" ? "rgba(30,41,59,0.6)" : "rgba(226,232,240,0.8)"} !important;
        }

        .input-wrap:focus-within {
          border-color: ${t.mode === "dark" ? "rgba(59,130,246,0.4)" : "rgba(59,130,246,0.35)"} !important;
          box-shadow: ${t.mode === "dark" ? "0 0 0 3px rgba(59,130,246,0.15)" : "0 0 0 3px rgba(59,130,246,0.12)"} !important;
        }

        .day-separator {
          display: flex;
          justify-content: center;
          margin: 16px 0 12px;
        }
        .day-separator span {
          padding: 6px 14px;
          border-radius: 10px;
          font-size: 11px;
          font-weight: 800;
          letter-spacing: 0.12em;
          text-transform: uppercase;
          color: ${t.textMuted};
          background: ${t.mode === "dark" ? "rgba(15,23,42,0.5)" : "rgba(255,255,255,0.9)"};
          border: 1px solid ${t.border};
        }

        @media (max-width: 480px) {
          .header-online { display: none; }
          .header-scope-pill { max-width: 140px !important; }
        }
      `}</style>

      <div style={s.page(t)}>
        <div className="chat-shell">
          {/* ===== Desktop sidebar ===== */}
          <aside className="conv-sidebar">
            <div className="conv-top">
              <div className="conv-title">{ui.convTitle}</div>
              <button className="icon-btn" type="button" onClick={refreshConversations} title="Refresh">
                <span>↻</span>
              </button>
            </div>

            <button type="button" className="conv-new" onClick={startNewChat}>
              ＋ {ui.newChat}
            </button>

            <input
              className="conv-search"
              value={convQ}
              onChange={(e) => setConvQ(e.target.value)}
              placeholder={ui.searchConv}
            />

            <div className="conv-list">
              {loadingConvs ? (
                <div style={{ padding: 10, color: t.textMuted, fontWeight: 900 }}>Loading…</div>
              ) : groupedFiltered.length ? (
                groupedFiltered.map((g) => (
                  <div key={g.title}>
                    <div className="conv-group-title">{g.title}</div>
                    {g.items.map((c) => {
                      const active = c.clientId === clientId;
                      const date = fmtShortDate(c.updatedAt || c.createdAt, lang);
                      const snippet = (c.lastText || "").trim() || ui.emptyConv;
                      const who = c.lastFrom === "user" ? (lang === "es" ? "Tú" : "You") : "Nexus";

                      return (
                        <button
                          key={c.clientId}
                          type="button"
                          className={`conv-item ${active ? "active" : ""}`}
                          onClick={() => openConversation(c.clientId)}
                          title={snippet}
                        >
                          <div className="conv-left">
                            <div className="conv-name">
                              <span className="conv-dot" />
                              {who}
                            </div>
                            <div className="conv-snippet">{snippet}</div>
                          </div>
                          <div className="conv-date">{date}</div>
                        </button>
                      );
                    })}
                  </div>
                ))
              ) : (
                <div style={{ padding: 10, color: t.textMuted, fontWeight: 900 }}>—</div>
              )}
            </div>
          </aside>

          {/* ===== Mobile drawer ===== */}
          {drawerOpen ? (
            <>
              <div className="drawer-overlay" onClick={() => setDrawerOpen(false)} />
              <div className="drawer">
                <div className="conv-top">
                  <div className="conv-title">{ui.convTitle}</div>
                  <button className="icon-btn" type="button" onClick={() => setDrawerOpen(false)} title="Close">
                    <span>✕</span>
                  </button>
                </div>

                <button type="button" className="conv-new" onClick={startNewChat}>
                  ＋ {ui.newChat}
                </button>

                <input
                  className="conv-search"
                  value={convQ}
                  onChange={(e) => setConvQ(e.target.value)}
                  placeholder={ui.searchConv}
                />

                <div className="conv-list">
                  {loadingConvs ? (
                    <div style={{ padding: 10, color: t.textMuted, fontWeight: 900 }}>Loading…</div>
                  ) : groupedFiltered.length ? (
                    groupedFiltered.map((g) => (
                      <div key={g.title}>
                        <div className="conv-group-title">{g.title}</div>
                        {g.items.map((c) => {
                          const active = c.clientId === clientId;
                          const date = fmtShortDate(c.updatedAt || c.createdAt, lang);
                          const snippet = (c.lastText || "").trim() || ui.emptyConv;
                          const who = c.lastFrom === "user" ? (lang === "es" ? "Tú" : "You") : "Nexus";

                          return (
                            <button
                              key={c.clientId}
                              type="button"
                              className={`conv-item ${active ? "active" : ""}`}
                              onClick={() => openConversation(c.clientId)}
                              title={snippet}
                            >
                              <div className="conv-left">
                                <div className="conv-name">
                                  <span className="conv-dot" />
                                  {who}
                                </div>
                                <div className="conv-snippet">{snippet}</div>
                              </div>
                              <div className="conv-date">{date}</div>
                            </button>
                          );
                        })}
                      </div>
                    ))
                  ) : (
                    <div style={{ padding: 10, color: t.textMuted, fontWeight: 900 }}>—</div>
                  )}
                </div>
              </div>
            </>
          ) : null}

          {/* ===== Main chat area ===== */}
          <div className="chat-main">
            <header style={s.header(t)}>
              <img src={logoWatermark} alt="" aria-hidden="true" style={s.headerWatermark(t)} />

              <div style={s.headerLeft}>
            
                <button
                  type="button"
                  className="icon-btn hamburger-only"
                  onClick={() => {
                    setDrawerOpen(true);
                    refreshConversations({ silent: false });
                    setMenuOpen(false);
                  }}
                  title="Menu"
                  style={{ marginRight: 10 }}
                >
                  <span>☰</span>
                </button>

         
                <button
                  type="button"
                  onClick={() => navigate("/dashboard")}
                  title={lang === "es" ? "Ir al dashboard" : "Go to dashboard"}
                  style={{
                    border: "none",
                    background: "transparent",
                    padding: 0,
                    cursor: "pointer",
                    display: "flex",
                    flexShrink: 0,
                  }}
                >
                  <div style={s.avatar(t)}>
                    <img src={logoAvatar} alt="305 No Fault" style={s.avatarLogo} />
                  </div>
                </button>

                <div style={s.headerTitleBlock}>
                  <div style={s.title(t)}>Nexus Assistant</div>
                  <div style={s.subTitle(t)} title={userName ? `${userName} · 305 No Fault` : "305 No Fault"}>
                    {userName ? `${userName} · 305 No Fault` : "305 No Fault"}
                  </div>
                </div>
              </div>

              <div style={s.headerRight}>
                <div style={{ display: "flex", alignItems: "center", gap: 8, position: "relative" }}>
                  <div className="header-online" style={s.pill(t)}>
                    <span style={s.dotOnline} />
                    <span style={s.pillText(t)}>{ui.online}</span>
                  </div>

                  <button
                    type="button"
                    className={`scope-pill header-scope-pill ${(scopeUi?.filtering || (scopeUi?.label && scopeUi.label.includes(":"))) ? "filtering" : ""}`}
                    onClick={() => handleSendText(lang === "es" ? "Cambiar filtro" : "Change scope")}
                    style={{
                      ...s.pill(t),
                      cursor: "pointer",
                      maxWidth: 320,
                      overflow: "hidden",
                      ...((scopeUi?.filtering || (scopeUi?.label && scopeUi.label.includes(":"))) && {
                        borderColor: t.mode === "dark" ? "rgba(56,189,248,0.4)" : "rgba(59,130,246,0.4)",
                        background: t.mode === "dark" ? "rgba(56,189,248,0.12)" : "rgba(59,130,246,0.08)",
                      }),
                    }}
                    title={scopeUi?.changeHint || (lang === "es" ? "Cambiar filtro/alcance" : "Change filter/scope")}
                  >
                    <span style={s.pillText(t)}>
                      {(scopeUi?.filtering || (scopeUi?.label && scopeUi.label.includes(":"))) ? "🔍" : "📌"} {lang === "es" ? "Filtro:" : "Scope:"}{" "}
                      {scopeUi?.label || (lang === "es" ? "General" : "General")}
                    </span>
                  </button>

                  <button
                    type="button"
                    onClick={() => {
                      setLang((x) => (x === "en" ? "es" : "en"));
                      setMenuOpen(false);
                    }}
                    style={s.langBtn(t)}
                    title={lang === "en" ? "Español" : "English"}
                  >
                    {lang === "en" ? "EN" : "ES"}
                  </button>

                  <button
                    type="button"
                    onClick={() => {
                      setTheme((x) => (x === "dark" ? "light" : "dark"));
                      setMenuOpen(false);
                    }}
                    style={s.themeBtn(t)}
                    title={theme === "dark" ? "Modo día" : "Modo noche"}
                  >
                    {theme === "dark" ? "☀️" : "🌙"}
                  </button>

                  {/* ✅ Menú ⋯ (dashboard + logout) */}
                  <button
                    type="button"
                    className="icon-btn"
                    onClick={() => setMenuOpen((v) => !v)}
                    title={ui.menu}
                  >
                    <span style={{ fontSize: 20, transform: "translateY(-1px)" }}>⋯</span>
                  </button>
                </div>
              </div>
            </header>

            {!isNearBottom && unreadCount > 0 ? (
              <button type="button" className="scroll-down" onClick={scrollToBottom} title={ui.jumpBottom}>
                <span style={{ fontSize: 16 }}>↓</span>
                <span style={{ fontSize: 12, fontWeight: 950, opacity: 0.95 }}>{ui.jumpBottom}</span>
                <span className="scroll-badge">{unreadCount}</span>
              </button>
            ) : null}

            <main ref={listRef} style={s.list(t)}>
              {messages.map((m, idx) => {
                const isUser = m.from === "user";
                const long = !isUser && isLongText(m.text);
                const expanded = !!m.expanded;

                const dk = dayKey(m.createdAt);
                const showDay = dk && dk !== lastDay;
                if (showDay) lastDay = dk;

                const isLogsReview = !isUser && m?.meta?.mode === "logs_performance_review";
                const hasCards = !isLogsReview && Array.isArray(m?.meta?.cards) && m.meta.cards.length > 0;
                const hasChart = !isLogsReview && !!m?.meta?.chart;
                const hasLinks = !isLogsReview && !!m?.meta?.links;

                const rawPickPrompt = !isUser && isPickPromptMessage(idx);

                return (
                  <React.Fragment key={m.id}>
                    {showDay && (
                      <div className="day-separator">
                        <span>{fmtDayLabel(m.createdAt, lang)}</span>
                      </div>
                    )}

                    <div className="msg-in" style={isUser ? s.rowUser : s.rowBot}>
                      {!isUser && (
                        <div style={s.bubbleAvatar(t)}>
                          <img src={logoAvatar} alt="Nexus" style={s.bubbleLogo} />
                        </div>
                      )}

                      <div style={isUser ? s.bubbleUser(t) : s.bubbleBot(t)}>
                        <div style={{ display: "flex", justifyContent: "space-between", gap: 10, alignItems: "baseline" }}>
                          <div style={{ flex: 1, minWidth: 0 }}>
                            {/* ✅ BLOQUES (cards/chart/links) primero: sensación “dashboard-like” */}
                            {isLogsReview ? (
                              <>
                                <LogsReviewLayout
                                meta={{
                                  logsPdfLink: m.meta.logsPdfLink,
                                  logsPreview: m.meta.logsPreview,
                                  peerComparison: m.meta.peerComparison,
                                  analysisText: m.meta.analysisText,
                                  performanceDiagnosis: m.meta.performanceDiagnosis,
                                }}
                                  text={m.text}
                                  t={t}
                                  lang={lang}
                                />
                                {Array.isArray(m?.suggestions) && m.suggestions.length > 0 && (
                                  <div style={{ ...s.suggestionsRow(t), marginTop: 12 }}>
                                    {m.suggestions.map((suggText, i) => (
                                      <button
                                        key={`${m.id}-sugg-${i}`}
                                        style={s.suggestionChip(t)}
                                        onClick={() => handleSendText(suggText)}
                                        title={suggText}
                                      >
                                        ✨ {suggText}
                                      </button>
                                    ))}
                                  </div>
                                )}
                              </>
                            ) : (
                              <>
                            {(hasCards || hasChart || hasLinks) ? (
                              <div className="meta-stack">
                                {hasCards ? <CardsBlock cards={m.meta.cards} t={t} /> : null}
                                {hasChart ? <MiniChart chart={m.meta.chart} t={t} lang={lang} /> : null}
                                {hasLinks ? <LinksBar links={m.meta.links} text={m.text} t={t} lang={lang} /> : null}
                                <div className="soft-sep" />
                              </div>
                            ) : null}

                            <div style={s.messageText(t, isUser)}>
                              {!isUser ? (
                                <>
                                  {(() => {
                                    const hasPickOptions = m?.meta?.pick?.options?.length > 0 && m?.meta?.pick?.type !== "scope_type";
                                    const displayText = hasPickOptions
                                      ? String(m.text || "").split(/\n\n\d+\)/)[0].trim()
                                      : m.text;
                                    return rawPickPrompt ? (
                                      <div style={{ whiteSpace: "pre-wrap" }}>{displayText}</div>
                                    ) : hasPickOptions ? (
                                      <BotPrettyAnswer text={displayText} t={t} lang={lang} />
                                    ) : long && !expanded ? (
                                      <div style={clampStyle(4)}>{m.text}</div>
                                    ) : (
                                      <BotPrettyAnswer text={m.text} t={t} lang={lang} />
                                    );
                                  })()}

                                  {/* ✅ Opciones clicables con búsqueda cuando hay muchas */}
                                  {!isUser && m?.meta?.pick?.options?.length > 0 && m?.meta?.pick?.type !== "scope_type" && (
                                    <PickOptionsWithSearch
                                      options={m.meta.pick.options}
                                      messageId={m.id}
                                      onPickOption={onPickOption}
                                      loading={loading}
                                      t={t}
                                      lang={lang}
                                    />
                                  )}
                                  {/* ✅ Suggestions siempre al final */}
                                  {Array.isArray(m?.suggestions) && m.suggestions.length > 0 && (
                                    <div style={s.suggestionsRow(t)}>
                                      {m.suggestions.map((text, i) => (
                                        <button
                                          key={`${m.id || "m"}-sugg-${i}`}
                                          style={s.suggestionChip(t)}
                                          onClick={() => handleSendText(text)}
                                          title={text}
                                        >
                                          ✨ {text}
                                        </button>
                                      ))}
                                    </div>
                                  )}
                                </>
                              ) : (
                                <div style={{ whiteSpace: "pre-wrap" }}>{m.text}</div>
                              )}
                            </div>
                              </>
                            )}
                          </div>

                          <div style={{ fontSize: 11, fontWeight: 900, opacity: 0.6, whiteSpace: "nowrap" }}>
                            {fmtTime(m.createdAt, lang)}
                          </div>
                        </div>

                        {!isUser && long && (
                          <button type="button" onClick={() => toggleExpanded(m.id)} style={s.moreBtn(t)}>
                            {expanded ? ui.less : ui.more}
                          </button>
                        )}
                      </div>

                      {isUser && <div style={s.bubbleAvatarUser(t)}>{getInitials(userName)}</div>}
                    </div>
                  </React.Fragment>
                );
              })}

              {loading && (
                <div style={s.rowBot} className="msg-in">
                  <div style={s.bubbleAvatar(t)}>
                    <img src={logoAvatar} alt="Nexus" style={s.bubbleLogo} />
                  </div>
                  <div style={s.bubbleBot(t)}>
                    <span style={{ opacity: 0.9 }}>{ui.typing}</span>
                  </div>
                </div>
              )}

              <div style={{ height: 10 }} />
            </main>

            {pendingPick?.options?.length > 0 ? null : (
              <div style={s.suggestWrap(t)}>
                <div style={s.suggestScroll}>
                  {visiblePrompts.map((item) => (
                    <button
                      key={item.label}
                      type="button"
                      className="quick-chip"
                      onClick={() => onQuick(item)}
                      style={s.suggestChip(t, !!item.__toggle)}
                      disabled={loading}
                      title={item.label}
                    >
                      ✨ {item.label}
                    </button>
                  ))}
                </div>
              </div>
            )}

            {/* Indicador visible de filtro activo: mostrar siempre que haya scope focus, aunque no haya valor aún */}
            {scopeUi?.mode === "focus" ? (
              <button
                type="button"
                onClick={() => handleSendText(lang === "es" ? "Cambiar filtro" : "Change scope")}
                style={{
                  display: "flex",
                  alignItems: "center",
                  justifyContent: "center",
                  gap: 8,
                  width: "100%",
                  padding: "8px 14px",
                  margin: "0 12px 6px",
                  borderRadius: 12,
                  border: `1px solid ${t.mode === "dark" ? "rgba(56,189,248,0.35)" : "rgba(59,130,246,0.35)"}`,
                  background: t.mode === "dark" ? "rgba(56,189,248,0.12)" : "rgba(59,130,246,0.10)",
                  color: t.text,
                  fontSize: 12,
                  fontWeight: 800,
                  cursor: "pointer",
                  textAlign: "center",
                }}
                title={scopeUi?.changeHint || (lang === "es" ? "Click para cambiar filtro" : "Click to change filter")}
              >
                <span style={{ opacity: 0.9 }}>🔍</span>
                <span>{lang === "es" ? "Filtrando por:" : "Filtering by:"}</span>
                <span style={{ fontWeight: 950, color: t.mode === "dark" ? "rgba(125,211,252,0.95)" : "rgba(37,99,235,0.95)" }}>
                  {scopeUi?.badge || scopeUi?.label}
                </span>
                <span style={{ fontSize: 10, opacity: 0.7 }}>· {lang === "es" ? "click para cambiar" : "click to change"}</span>
              </button>
            ) : null}

            <form onSubmit={onSubmit} style={s.composer(t)}>
              <div className="input-wrap" style={s.inputWrap(t)}>
                <textarea
                  className="chat-input"
                  value={input}
                  onChange={(e) => setInput(e.target.value)}
                  placeholder={ui.placeholder}
                  style={{
                    ...s.input(t),
                    resize: "none",
                    minHeight: 38,
                    maxHeight: 92,
                    paddingTop: 9,
                    paddingBottom: 9,
                    paddingLeft: 14,
                    paddingRight: 14,
                    lineHeight: 1.25,
                    overflow: "auto",
                    fontFamily:
                      'ui-sans-serif, system-ui, -apple-system, "Segoe UI", Roboto, Helvetica, Arial, "Apple Color Emoji", "Segoe UI Emoji"',
                    fontSize: 13,
                    fontWeight: 700,
                    letterSpacing: "0.2px",
                  }}
                  disabled={loading}
                  rows={1}
                  onKeyDown={(e) => {
                    if (e.key === "Enter" && !e.shiftKey) {
                      e.preventDefault();
                      if (!loading && input.trim()) {
                        handleSendText(input);
                        setInput("");
                      }
                    }
                  }}
                />

                <button
                  type="submit"
                  disabled={loading || !input.trim()}
                  style={{
                    ...s.send(t),
                    opacity: loading || !input.trim() ? 0.55 : 1,
                    cursor: loading || !input.trim() ? "not-allowed" : "pointer",
                  }}
                  title="Send"
                >
                  ➤
                </button>
              </div>
            </form>
          </div>
        </div>

        {askNameOpen && <NameModal t={t} lang={lang} onSave={saveUserName} onSkip={() => setAskNameOpen(false)} />}

        {pendingPick?.options?.length > 0 && (
          <div
            style={s.modalOverlay(t)}
            onClick={(e) => { if (e.target === e.currentTarget && !loading) { setPendingPick(null); setPickSearchFilter(""); } }}
          >
            <div style={pickStyles.modalCard(t)} onClick={(e) => e.stopPropagation()}>
              <div style={pickStyles.modalHeader(t)}>
                <span style={pickStyles.modalTitle(t)}>{ui.pickTitle}</span>
                <button
                  type="button"
                  disabled={loading}
                  onClick={() => { setPendingPick(null); setPickSearchFilter(""); }}
                  style={pickStyles.cancelSmall(t)}
                  title={ui.pickCancel}
                >
                  ✕
                </button>
              </div>
              {pendingPick.type !== "scope_type" && pendingPick.options.length > 8 && (
                <div style={{ padding: "8px 16px 12px", flexShrink: 0 }}>
                  <input
                    type="text"
                    value={pickSearchFilter}
                    onChange={(e) => setPickSearchFilter(e.target.value)}
                    placeholder={lang === "es" ? "Buscar para ver más..." : "Search to see more..."}
                    style={{
                      width: "100%",
                      padding: "10px 14px",
                      borderRadius: 12,
                      border: `1px solid ${t.border}`,
                      background: t.mode === "dark" ? "rgba(15,23,42,0.5)" : "rgba(248,250,252,0.95)",
                      color: t.text,
                      fontSize: 14,
                      outline: "none",
                    }}
                    autoFocus
                  />
                  {!pickSearchFilter.trim() && pendingPick.options.length > 8 && (
                    <div style={{ fontSize: 12, opacity: 0.8, marginTop: 6, color: t.textMuted || t.text }}>
                      {lang === "es" ? `+${pendingPick.options.length - 8} más. Busca para filtrar.` : `+${pendingPick.options.length - 8} more. Search to filter.`}
                    </div>
                  )}
                </div>
              )}
              <div style={pickStyles.modalGrid}>
                {(() => {
                  const filtered = !pickSearchFilter.trim()
                    ? pendingPick.options
                    : pendingPick.options.filter((opt) =>
                        cleanPickLabel(opt?.label || opt?.value || "").toLowerCase().includes(pickSearchFilter.trim().toLowerCase())
                      );
                  const useLimit = pendingPick.type !== "scope_type" && !pickSearchFilter.trim() && pendingPick.options.length > 8;
                  const toShow = useLimit ? filtered.slice(0, 8) : filtered;
                  return toShow.map((opt, displayIdx) => {
                  const origIdx = pendingPick.options.indexOf(opt);
                  const onlyName = cleanPickLabel(opt?.label || "");
                  return (
                    <button
                      key={`${opt.id || opt.label}-${origIdx}`}
                      type="button"
                      onClick={() => onPickOption(opt, origIdx)}
                      disabled={loading}
                      style={{
                        ...pickStyles.option(t),
                        opacity: loading ? 0.6 : 1,
                        cursor: loading ? "not-allowed" : "pointer",
                      }}
                      title={onlyName}
                    >
                      <div style={pickStyles.badge(t)}>{displayIdx + 1}</div>
                      <div style={{ minWidth: 0, flex: 1 }}>
                        <div style={pickStyles.name(t)}>{onlyName || "(sin nombre)"}</div>
                      </div>
                      <div style={{ opacity: 0.7, fontWeight: 900 }}>›</div>
                    </button>
                  );
                });
                })()}
              </div>
              <div style={pickStyles.modalFooter(t)}>
                <button
                  type="button"
                  disabled={loading}
                  onClick={() => { setPendingPick(null); setPickSearchFilter(""); }}
                  style={pickStyles.cancel(t)}
                >
                  {ui.pickCancel}
                </button>
              </div>
            </div>
          </div>
        )}
      </div>

       {menuOpen ? (
        <>
          <div
            onClick={() => setMenuOpen(false)}
            style={{
              position: "fixed",
              inset: 0,
              zIndex: 9998,
              background: "transparent",
            }}
          />
          <div
            style={{
              position: "fixed",
              top: 72,
              right: 16,
              zIndex: 9999,
              width: 240,
              borderRadius: 14,
              border: `1px solid ${t.mode === "dark" ? "rgba(148,163,184,0.35)" : t.border}`,
              background: t.mode === "dark" ? "rgba(2,6,23,0.92)" : "rgba(255,255,255,0.98)",
              backdropFilter: "blur(12px)",
              boxShadow:
                t.mode === "dark"
                  ? "0 18px 50px rgba(0,0,0,0.45)"
                  : "0 18px 50px rgba(15,23,42,0.12)",
              overflow: "hidden",
            }}
          >
            <button
              type="button"
              onClick={() => {
                setMenuOpen(false);
                navigate("/dashboard");
              }}
              style={menuItemStyle(t)}
            >
              <span style={{ fontSize: 16 }}>←</span>
              <span>{ui.back}</span>
            </button>

            <div style={{ height: 1, background: t.border }} />

            <button
              type="button"
              onClick={() => {
                setMenuOpen(false);
                signOut(auth);
              }}
              style={menuItemStyle(t)}
            >
              <span style={{ fontSize: 16 }}>🚪</span>
              <span>{ui.logout}</span>
            </button>
          </div>
        </>
      ) : null}
    </>
  );
}

function menuItemStyle(t) {
  return {
    width: "100%",
    padding: "12px 12px",
    display: "flex",
    alignItems: "center",
    gap: 10,
    border: 0,
    background: "transparent",
    cursor: "pointer",
    color: t.mode === "dark" ? "rgba(226,232,240,0.95)" : "rgba(15,23,42,0.92)",
    fontWeight: 900,
    fontSize: 13,
  };
}


const pickStyles = {
  modalCard: (t) => ({
    width: "min(440px, 92vw)",
    maxHeight: "min(70vh, 400px)",
    display: "flex",
    flexDirection: "column",
    borderRadius: 18,
    background: t.surface,
    border: `1px solid ${t.border}`,
    boxShadow: t.mode === "dark" ? "0 25px 60px rgba(0,0,0,0.60)" : "0 25px 60px rgba(15,23,42,0.18)",
    overflow: "hidden",
  }),
  modalHeader: (t) => ({
    display: "flex",
    alignItems: "center",
    justifyContent: "space-between",
    gap: 10,
    padding: "16px 16px 12px",
    borderBottom: `1px solid ${t.border}`,
    flexShrink: 0,
  }),
  modalTitle: (t) => ({
    fontWeight: 900,
    fontSize: 14,
    color: t.text,
  }),
  modalGrid: {
    padding: 12,
    overflowY: "auto",
    display: "grid",
    gap: 8,
    flex: 1,
    minHeight: 0,
  },
  modalFooter: (t) => ({
    display: "flex",
    justifyContent: "flex-end",
    padding: "12px 16px 16px",
    borderTop: `1px solid ${t.border}`,
  }),
  cancelSmall: (t) => ({
    padding: "6px 10px",
    borderRadius: 999,
    border: `1px solid ${t.border}`,
    background: t.surface2,
    color: t.textMuted,
    fontSize: 12,
    fontWeight: 900,
    cursor: "pointer",
    flexShrink: 0,
  }),
  title: (t) => ({
    fontWeight: 900,
    fontSize: 12,
    letterSpacing: 0.2,
    opacity: 0.9,
    marginBottom: 10,
    color: t.mode === "dark" ? "rgba(226,232,240,0.95)" : "rgba(15,23,42,0.9)",
  }),
  grid: { display: "grid", gap: 10 },
  option: (t) => ({
    display: "flex",
    alignItems: "center",
    gap: 10,
    width: "100%",
    textAlign: "left",
    padding: "10px 12px",
    borderRadius: 14,
    border: t.mode === "dark" ? "1px solid rgba(148,163,184,0.16)" : "1px solid rgba(15,23,42,0.10)",
    background: t.mode === "dark" ? "rgba(15,23,42,0.35)" : "rgba(248,250,252,0.9)",
  }),
  badge: (t) => ({
    width: 28,
    height: 28,
    borderRadius: 10,
    display: "grid",
    placeItems: "center",
    fontWeight: 900,
    fontSize: 13,
    background: t.mode === "dark" ? "rgba(56,189,248,0.18)" : "rgba(2,132,199,0.12)",
    color: t.mode === "dark" ? "rgba(125,211,252,0.95)" : "rgba(2,132,199,0.95)",
    flex: "0 0 auto",
  }),
  name: (t) => ({
    fontWeight: 900,
    fontSize: 13,
    lineHeight: 1.1,
    color: t.mode === "dark" ? "rgba(226,232,240,0.95)" : "rgba(15,23,42,0.9)",
    whiteSpace: "nowrap",
    overflow: "hidden",
    textOverflow: "ellipsis",
    maxWidth: "100%",
  }),
  footer: { display: "flex", justifyContent: "flex-end", marginTop: 10 },
  cancel: (t) => ({
    padding: "8px 12px",
    borderRadius: 12,
    border: t.mode === "dark" ? "1px solid rgba(148,163,184,0.18)" : "1px solid rgba(15,23,42,0.10)",
    background: t.mode === "dark" ? "rgba(15,23,42,0.35)" : "rgba(248,250,252,0.9)",
    color: t.mode === "dark" ? "rgba(226,232,240,0.9)" : "rgba(15,23,42,0.85)",
    fontWeight: 900,
    fontSize: 12,
  }),
};

