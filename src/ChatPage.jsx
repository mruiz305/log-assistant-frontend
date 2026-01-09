// src/ChatPage.jsx
import React, { useEffect, useMemo, useRef, useState } from 'react';
import { sendChatMessage } from './api';

const THEME_KEY = 'log_assistant_theme'; // 'dark' | 'light'
const LANG_KEY = 'log_assistant_lang';   // 'en' | 'es'  ✅ NUEVO

function isLongText(text, threshold = 260) {
  return (text || '').length > threshold;
}

function clampStyle(lines) {
  return {
    display: '-webkit-box',
    WebkitLineClamp: lines,
    WebkitBoxOrient: 'vertical',
    overflow: 'hidden',
  };
}

function splitLines(text) {
  return String(text || '')
    .split('\n')
    .map((l) => l.trim())
    .filter(Boolean);
}

function classifyLine(line) {
  const s = line.toLowerCase();

  // alertas / negativo
  if (/(baj[oó]|cay[oó]|drop|dropped|problem|rechaz|error|riesgo|alerta)/i.test(s)) {
    return { icon: '⚠️', tone: 'warn' };
  }

  // bajando
  if (/(↓|disminuy|menor|baja|decrec)/i.test(s)) {
    return { icon: '📉', tone: 'down' };
  }

  // positivo
  if (/(subi[oó]|creci[oó]|mejor|top|lider|aument|↑|ganad|converted|confirmed)/i.test(s)) {
    return { icon: '✅', tone: 'good' };
  }

  return { icon: '•', tone: 'neutral' };
}

function LinksBar({ links, t, lang }) {
  if (!links || (!links.logsPdf && !links.rosterPdf)) return null;

  const labelLogs = lang === 'es' ? 'Logs PDF' : 'PDF Logs';
  const labelRoster = lang === 'es' ? 'Roster PDF' : 'PDF Roster';

  return (
    <div style={s.linksWrap(t)}>
      {links.logsPdf && (
        <a
          href={links.logsPdf}
          target="_blank"
          rel="noreferrer"
          style={s.linkBtn(t)}
          title={links.logsPdf}
        >
          📄 {labelLogs}
        </a>
      )}

      {links.rosterPdf && (
        <a
          href={links.rosterPdf}
          target="_blank"
          rel="noreferrer"
          style={s.linkBtn(t)}
          title={links.rosterPdf}
        >
          📄 {labelRoster}
        </a>
      )}
    </div>
  );
}

function BotPrettyAnswer({ text, t, lang }) {
  const lines = splitLines(text);

  const bulletLines = lines
    .map((l) => l.replace(/^[-•]\s*/, '').trim())
    .filter((l) => l.length > 0);

  const looksLikeBullets =
    lines.length >= 2 && lines.filter((l) => /^[-•]\s+/.test(l)).length >= 2;

  if (!looksLikeBullets) {
    return <div style={{ whiteSpace: 'pre-wrap' }}>{text}</div>;
  }

  return (
    <div style={s.botAnswerWrap(t)}>
      <div style={s.botAnswerHeader(t)}>{lang === 'es' ? 'Resumen' : 'Summary'}</div>

      <div style={s.botAnswerList(t)}>
        {bulletLines.map((line, idx) => {
          const { icon, tone } = classifyLine(line);
          return (
            <div key={idx} style={s.botAnswerItem(t, tone)}>
              <div style={s.botAnswerIcon(t, tone)}>{icon}</div>
              <div style={s.botAnswerText(t)}>{line}</div>
            </div>
          );
        })}
      </div>
    </div>
  );
}

export default function ChatPage() {
  const [theme, setTheme] = useState(() => {
    const saved = localStorage.getItem(THEME_KEY);
    return saved === 'light' ? 'light' : 'dark';
  });

  // ✅ Default inglés
  const [lang, setLang] = useState(() => {
    const saved = localStorage.getItem(LANG_KEY);
    return saved === 'es' ? 'es' : 'en';
  });

  const t = useMemo(() => makeTheme(theme), [theme]);

  // ✅ textos UI por idioma
  const ui = useMemo(() => {
    if (lang === 'es') {
      return {
        welcome:
          'Hola 👋 Soy el asistente de logs de 305 No Fault.\n' +
          'Pregúntame por leads, dropped, problem y crédito (convertedValue).',
        placeholder: 'Escribe aquí…',
        online: 'Online',
        prompts: [
          'Confirmados (mes)',
          'Mejor confirmación (año)',
          'Dropped últimos 3 meses',
          'Resumen (semana)',
          'Crédito (mes)',
          'Dropped hoy (oficina)',
        ],
        more: 'Ver más',
        less: 'Ver menos',
        typing: 'Escribiendo…',
        error: 'Ocurrió un error hablando con el asistente.',
        invalid: 'Hubo un problema: ',
      };
    }
    return {
      welcome:
        'Hi 👋 I’m the 305 No Fault logs assistant.\n' +
        'Ask me about leads, dropped, problem, and credit (convertedValue).',
      placeholder: 'Type here…',
      online: 'Online',
      prompts: [
        'Confirmed (month)',
        'Best confirmation (year)',
        'Dropped last 3 months',
        'Summary (week)',
        'Credit (month)',
        'Dropped today (office)',
      ],
      more: 'Show more',
      less: 'Show less',
      typing: 'Typing…',
      error: 'There was an error talking to the assistant.',
      invalid: 'There was a problem: ',
    };
  }, [lang]);

  const [messages, setMessages] = useState(() => [
    { id: crypto.randomUUID(), from: 'bot', text: '' },
  ]);

  // ✅ cuando cambie el idioma, actualiza el mensaje de bienvenida (solo si es el primer mensaje)
  useEffect(() => {
    setMessages((prev) => {
      if (!Array.isArray(prev) || prev.length === 0) return prev;
      const first = prev[0];
      if (first?.from === 'bot') {
        const rest = prev.slice(1);
        return [{ ...first, text: ui.welcome }, ...rest];
      }
      return prev;
    });
  }, [ui.welcome]);

  const [input, setInput] = useState('');
  const [loading, setLoading] = useState(false);

  const listRef = useRef(null);

  // =========================
  // Quick prompts
  // =========================
  const [showAllPrompts, setShowAllPrompts] = useState(false);

  const quickPrompts = useMemo(
    () => ui.prompts.map((label) => ({ label })),
    [ui.prompts]
  );

  const visiblePrompts = useMemo(() => {
    const base = showAllPrompts ? quickPrompts : quickPrompts.slice(0, 4);
    return [
      ...base,
      { label: showAllPrompts ? ui.less : ui.more, __toggle: true },
    ];
  }, [quickPrompts, showAllPrompts, ui.more, ui.less]);

  useEffect(() => {
    localStorage.setItem(THEME_KEY, theme);
  }, [theme]);

  useEffect(() => {
    localStorage.setItem(LANG_KEY, lang);
  }, [lang]);

  useEffect(() => {
    const el = listRef.current;
    if (!el) return;
    el.scrollTop = el.scrollHeight;
  }, [messages, loading]);

  const pushBotError = (text) =>
    setMessages((prev) => [...prev, { id: crypto.randomUUID(), from: 'bot', text }]);

  const toggleExpanded = (id) => {
    setMessages((prev) =>
      prev.map((m) => (m.id === id ? { ...m, expanded: !m.expanded } : m))
    );
  };

  const handleSendText = async (text) => {
    const trimmed = (text || '').trim();
    if (!trimmed || loading) return;

    setMessages((prev) => [
      ...prev,
      { id: crypto.randomUUID(), from: 'user', text: trimmed },
    ]);
    setLoading(true);

    try {
      // ✅ manda lang al backend
      const data = await sendChatMessage(trimmed, lang);

      if (data?.ok) {
        setMessages((prev) => [
          ...prev,
          {
            id: crypto.randomUUID(),
            from: 'bot',
            text: data.answer,
            expanded: false,
            meta: { rowCount: data.rowCount, links: data.links || null },
          },
        ]);
      } else {
        pushBotError(`${ui.invalid}${data?.error || 'Invalid response'}`);
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
    setInput('');
  };

  const onQuick = (item) => {
    if (loading) return;

    if (item.__toggle) {
      setShowAllPrompts((v) => !v);
      return;
    }

    handleSendText(item.label);
  };

  return (
    <>
      <style>{`
        .chat-input::placeholder {
          color: ${
            t.mode === 'dark'
              ? 'rgba(203,213,225,0.75)'
              : 'rgba(71,85,105,0.75)'
          };
          font-weight: 600;
        }
      `}</style>

      <div style={s.page(t)}>
        <header style={s.header(t)}>
          <div style={s.headerLeft}>
            <div style={s.avatar(t)}>B</div>
            <div style={{ lineHeight: 1.05, minWidth: 0 }}>
              <div style={s.title(t)}>Log Assistant</div>
              <div style={s.subTitle(t)}>305 No Fault</div>
            </div>
          </div>

          <div style={s.headerRight}>
            <div style={s.pill(t)}>
              <span style={s.dotOnline} />
              <span style={s.pillText(t)}>{ui.online}</span>
            </div>

            {/* ✅ Toggle idioma */}
            <button
              type="button"
              onClick={() => setLang((x) => (x === 'en' ? 'es' : 'en'))}
              style={s.langBtn(t)}
              aria-label="Change language"
              title={lang === 'en' ? 'Español' : 'English'}
            >
              {lang === 'en' ? 'EN' : 'ES'}
            </button>

            <button
              type="button"
              onClick={() => setTheme((x) => (x === 'dark' ? 'light' : 'dark'))}
              style={s.themeBtn(t)}
              aria-label="Cambiar tema"
              title={theme === 'dark' ? 'Modo día' : 'Modo noche'}
            >
              {theme === 'dark' ? '☀️' : '🌙'}
            </button>
          </div>
        </header>

        <main ref={listRef} style={s.list(t)}>
          {messages.map((m) => {
            const isUser = m.from === 'user';
            const long = !isUser && isLongText(m.text);
            const expanded = !!m.expanded;

            return (
              <div key={m.id} style={isUser ? s.rowUser : s.rowBot}>
                {!isUser && <div style={s.bubbleAvatar(t)}>B</div>}

                <div style={isUser ? s.bubbleUser(t) : s.bubbleBot(t)}>
                  <div style={s.messageText(t, isUser)}>
                    {!isUser && long && !expanded ? (
                      <div style={clampStyle(4)}>{m.text}</div>
                   ) : !isUser ? (
                      <>
                        <BotPrettyAnswer text={m.text} t={t} lang={lang} />
                        <LinksBar links={m?.meta?.links} t={t} lang={lang} />
                      </>
                    ) : (

                      <div style={{ whiteSpace: 'pre-wrap' }}>{m.text}</div>
                    )}
                  </div>

                  {!isUser && long && (
                    <button
                      type="button"
                      onClick={() => toggleExpanded(m.id)}
                      style={s.moreBtn(t)}
                    >
                      {expanded ? ui.less : ui.more}
                    </button>
                  )}
                </div>

                {isUser && <div style={s.bubbleAvatarUser(t)}>You</div>}
              </div>
            );
          })}

          {loading && (
            <div style={s.rowBot}>
              <div style={s.bubbleAvatar(t)}>B</div>
              <div style={s.bubbleBot(t)}>
                <span style={{ opacity: 0.9 }}>{ui.typing}</span>
              </div>
            </div>
          )}

          <div style={{ height: 10 }} />
        </main>

        <div style={s.suggestWrap(t)}>
          <div style={s.suggestScroll}>
            {visiblePrompts.map((item) => (
              <button
                key={item.label}
                type="button"
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

        <form onSubmit={onSubmit} style={s.composer(t)}>
          <div style={s.inputWrap(t)}>
            <input
              className="chat-input"
              value={input}
              onChange={(e) => setInput(e.target.value)}
              placeholder={ui.placeholder}
              style={s.input(t)}
              disabled={loading}
            />

            <button
              type="submit"
              disabled={loading || !input.trim()}
              style={{
                ...s.send(t),
                opacity: loading || !input.trim() ? 0.55 : 1,
                cursor: loading || !input.trim() ? 'not-allowed' : 'pointer',
              }}
              aria-label="Send"
              title="Send"
            >
              ➤
            </button>
          </div>
        </form>
      </div>
    </>
  );
}

function makeTheme(mode) {
  const dark = mode === 'dark';
  return {
    mode,
    bg: dark ? '#0b1220' : '#f5f7fb',
    headerBg: dark ? '#0f172a' : '#ffffff',
    surface: dark ? '#111827' : '#ffffff',
    surface2: dark ? '#0b1220' : '#eef2ff',
    border: dark ? 'rgba(255,255,255,0.18)' : 'rgba(15,23,42,0.12)',
    text: dark ? '#f8fafc' : '#0f172a',
    textMuted: dark ? '#cbd5e1' : '#475569',
    bubbleBotBg: dark ? '#111827' : '#ffffff',
    bubbleBotBorder: dark ? 'rgba(255,255,255,0.16)' : 'rgba(15,23,42,0.10)',
    bubbleUserBg: dark ? '#2563eb' : '#0f62fe',
    chipBg: dark ? '#111827' : '#ffffff',
    chipBorder: dark ? 'rgba(255,255,255,0.18)' : 'rgba(15,23,42,0.12)',
    blue: '#0f62fe',
  };
}

const s = {
  page: (t) => ({
    height: '100dvh',
    width: '100vw',
    minWidth: 0,
    display: 'flex',
    flexDirection: 'column',
    background: t.bg,
    color: t.text,
    fontFamily: '-apple-system, BlinkMacSystemFont, "Segoe UI", system-ui, sans-serif',
    paddingTop: 'env(safe-area-inset-top)',
    WebkitFontSmoothing: 'antialiased',
    MozOsxFontSmoothing: 'grayscale',
  }),

  header: (t) => ({
    height: 56,
    padding: '10px 12px',
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'space-between',
    background: t.headerBg,
    borderBottom: `1px solid ${t.border}`,
    flexShrink: 0,
  }),

  headerLeft: { display: 'flex', alignItems: 'center', gap: 10, minWidth: 0 },
  headerRight: { display: 'flex', alignItems: 'center', gap: 10, flexShrink: 0 },

  avatar: (t) => ({
    width: 36,
    height: 36,
    borderRadius: 999,
    background: t.mode === 'dark' ? '#0b1220' : '#0f172a',
    color: '#fff',
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
    fontWeight: 900,
    flexShrink: 0,
  }),

  title: (t) => ({ fontSize: 14, fontWeight: 900, color: t.text }),
  subTitle: (t) => ({ fontSize: 12, color: t.textMuted }),

  pill: (t) => ({
    display: 'flex',
    alignItems: 'center',
    gap: 6,
    padding: '6px 10px',
    borderRadius: 999,
    border: `1px solid ${t.border}`,
    background: t.surface2,
  }),

  dotOnline: { width: 8, height: 8, borderRadius: 999, background: '#22c55e' },
  pillText: (t) => ({ fontSize: 12, color: t.textMuted, fontWeight: 800 }),

  // ✅ botón idioma
  langBtn: (t) => ({
    height: 36,
    padding: '0 12px',
    borderRadius: 999,
    border: `1px solid ${t.border}`,
    background: t.surface2,
    color: t.text,
    cursor: 'pointer',
    fontSize: 12,
    fontWeight: 900,
    letterSpacing: 0.2,
  }),

  themeBtn: (t) => ({
    width: 36,
    height: 36,
    borderRadius: 999,
    border: `1px solid ${t.border}`,
    background: t.surface2,
    color: t.text,
    cursor: 'pointer',
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
    fontSize: 16,
  }),

  list: (t) => ({
    flex: 1,
    minHeight: 0,
    overflowY: 'auto',
    padding: '12px 10px',
    background: t.mode === 'dark' ? '#0b1220' : '#f5f7fb',
  }),

  rowBot: { display: 'flex', gap: 8, alignItems: 'flex-end', marginBottom: 10 },
  rowUser: {
    display: 'flex',
    gap: 8,
    alignItems: 'flex-end',
    justifyContent: 'flex-end',
    marginBottom: 10,
  },

  bubbleAvatar: (t) => ({
    width: 28,
    height: 28,
    borderRadius: 999,
    background: t.mode === 'dark' ? '#0b1220' : '#0f172a',
    color: '#fff',
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
    fontSize: 12,
    fontWeight: 900,
    flexShrink: 0,
  }),

  bubbleAvatarUser: () => ({
    width: 28,
    height: 28,
    borderRadius: 999,
    background: '#facc15',
    color: '#4a3410',
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
    fontSize: 11,
    fontWeight: 900,
    flexShrink: 0,
  }),

  bubbleBot: (t) => ({
    maxWidth: '78%',
    background: t.bubbleBotBg,
    border: `1px solid ${t.bubbleBotBorder}`,
    borderRadius: 18,
    padding: '12px 12px',
  }),

  bubbleUser: (t) => ({
    maxWidth: '78%',
    background: t.bubbleUserBg,
    color: '#fff',
    borderRadius: 18,
    padding: '12px 12px',
  }),

  messageText: (t, isUser) => ({
    fontSize: 16,
    lineHeight: 1.45,
    fontWeight: 600,
    color: isUser ? '#ffffff' : t.text,
  }),

  moreBtn: (t) => ({
    marginTop: 10,
    padding: '7px 12px',
    borderRadius: 999,
    border: `1px solid ${t.border}`,
    background: t.surface2,
    color: t.text,
    fontSize: 12,
    fontWeight: 900,
    cursor: 'pointer',
  }),

  suggestWrap: (t) => ({
    padding: '10px 10px 8px',
    borderTop: `1px solid ${t.border}`,
    background: t.mode === 'dark' ? t.headerBg : '#ffffff',
    flexShrink: 0,
  }),

  suggestScroll: {
    display: 'flex',
    gap: 10,
    overflowX: 'auto',
    WebkitOverflowScrolling: 'touch',
    paddingBottom: 2,
    paddingRight: 6,
  },

  suggestChip: (t, isToggle) => ({
    flex: '0 0 auto',
    borderRadius: 999,
    border: `1px solid ${t.chipBorder}`,
    padding: '9px 12px',
    background: isToggle
      ? t.mode === 'dark'
        ? 'rgba(250,204,21,0.12)'
        : 'rgba(15,98,254,0.10)'
      : t.mode === 'dark'
      ? t.chipBg
      : '#f1f5f9',
    color: t.text,
    cursor: 'pointer',
    textAlign: 'left',
    fontSize: 12,
    fontWeight: 900,
    whiteSpace: 'nowrap',
  }),

  composer: (t) => ({
    padding: '10px 10px calc(10px + env(safe-area-inset-bottom))',
    background: t.bg,
    flexShrink: 0,
  }),

  inputWrap: (t) => ({
    display: 'flex',
    alignItems: 'center',
    gap: 10,
    background: t.mode === 'dark' ? '#0f172a' : '#ffffff',
    border: `2px solid ${
      t.mode === 'dark' ? 'rgba(255,255,255,0.18)' : 'rgba(15,23,42,0.16)'
    }`,
    borderRadius: 999,
    padding: '10px 10px 10px 14px',
    boxShadow:
      t.mode === 'dark'
        ? '0 10px 30px rgba(0,0,0,0.35)'
        : '0 10px 25px rgba(15,23,42,0.08)',
  }),

  input: (t) => ({
    flex: 1,
    minWidth: 0,
    border: 'none',
    outline: 'none',
    background: 'transparent',
    color: t.text,
    fontSize: 16,
    fontWeight: 600,
  }),

  send: (t) => ({
    width: 40,
    height: 40,
    borderRadius: 999,
    border: 'none',
    background: t.blue,
    color: '#fff',
    fontSize: 16,
    fontWeight: 900,
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
  }),

  botAnswerWrap: (t) => ({ display: 'flex', flexDirection: 'column', gap: 8 }),
  botAnswerHeader: (t) => ({
    fontSize: 12,
    fontWeight: 900,
    color: t.textMuted,
    letterSpacing: 0.2,
  }),
  botAnswerList: () => ({ display: 'flex', flexDirection: 'column', gap: 8 }),

  botAnswerItem: (t, tone) => ({
    display: 'flex',
    alignItems: 'flex-start',
    gap: 10,
    padding: '10px 10px',
    borderRadius: 14,
    border: `1px solid ${
      t.mode === 'dark' ? 'rgba(255,255,255,0.12)' : 'rgba(15,23,42,0.10)'
    }`,
    background:
      tone === 'good'
        ? t.mode === 'dark'
          ? 'rgba(34,197,94,0.12)'
          : 'rgba(34,197,94,0.10)'
        : tone === 'warn'
        ? t.mode === 'dark'
          ? 'rgba(250,204,21,0.12)'
          : 'rgba(250,204,21,0.14)'
        : tone === 'down'
        ? t.mode === 'dark'
          ? 'rgba(59,130,246,0.10)'
          : 'rgba(59,130,246,0.10)'
        : t.mode === 'dark'
        ? 'rgba(255,255,255,0.04)'
        : 'rgba(15,23,42,0.03)',
  }),

  botAnswerIcon: (t, tone) => ({
    width: 26,
    height: 26,
    borderRadius: 999,
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
    flexShrink: 0,
    fontSize: 14,
    background:
      tone === 'good'
        ? 'rgba(34,197,94,0.18)'
        : tone === 'warn'
        ? 'rgba(250,204,21,0.22)'
        : tone === 'down'
        ? 'rgba(59,130,246,0.18)'
        : t.mode === 'dark'
        ? 'rgba(255,255,255,0.08)'
        : 'rgba(15,23,42,0.08)',
  }),

  botAnswerText: (t) => ({
    fontSize: 14,
    fontWeight: 700,
    lineHeight: 1.35,
    color: t.text,
  }),

  // ✅ Links PDF
  linksWrap: (t) => ({
    display: 'flex',
    gap: 10,
    flexWrap: 'wrap',
    marginTop: 10,
  }),

  linkBtn: (t) => ({
    display: 'inline-flex',
    alignItems: 'center',
    gap: 8,
    padding: '8px 12px',
    borderRadius: 999,
    border: `1px solid ${t.border}`,
    background: t.surface2,
    color: t.text,
    fontSize: 12,
    fontWeight: 900,
    textDecoration: 'none',
    cursor: 'pointer',
  }),
};





