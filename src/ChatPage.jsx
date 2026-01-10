import React, { useEffect, useMemo, useRef, useState } from 'react';
import { sendChatMessage } from './api';

import logoAvatar from './assets/logo_avatar.png';
import logoWatermark from './assets/logo_watermark.png';

import { makeTheme } from './chat/theme';
import s from './chat/styles';

import {
  makeId,
  readStoredName,
  isLongText,
  clampStyle,
  getInitials,
} from './chat/utils';

import BotPrettyAnswer from './chat/components/BotPrettyAnswer';
import LinksBar from './chat/components/LinksBar';
import MiniChart from './chat/components/MiniChart';
import NameModal from './chat/components/NameModal';

const THEME_KEY = 'log_assistant_theme';
const LANG_KEY = 'log_assistant_lang';
const CLIENT_ID_KEY = 'log_assistant_client_id';
const USER_NAME_KEY = 'log_assistant_user_name';

export default function ChatPage() {
  const [theme, setTheme] = useState(() => {
    const saved = localStorage.getItem(THEME_KEY);
    return saved === 'light' ? 'light' : 'dark';
  });

  const [lang, setLang] = useState(() => {
    const saved = localStorage.getItem(LANG_KEY);
    return saved === 'es' ? 'es' : 'en';
  });

  const [clientId] = useState(() => {
    const saved = localStorage.getItem(CLIENT_ID_KEY);
    if (saved) return saved;
    const id = makeId();
    localStorage.setItem(CLIENT_ID_KEY, id);
    return id;
  });

  const [userName, setUserName] = useState(() => readStoredName(USER_NAME_KEY));
  const [askNameOpen, setAskNameOpen] = useState(() => !readStoredName(USER_NAME_KEY));

  useEffect(() => {
    const n = readStoredName(USER_NAME_KEY);
    if (!n && localStorage.getItem(USER_NAME_KEY) !== null) {
      localStorage.removeItem(USER_NAME_KEY);
    }
    if (!n) setAskNameOpen(true);
  }, []);

  const t = useMemo(() => makeTheme(theme), [theme]);

  const ui = useMemo(() => {
    if (lang === 'es') {
      return {
        welcome:
          'Hola 👋 Soy el asistente de logs de 305 No Fault.\n' +
          'Pregúntame por leads, dropped, problem y crédito (convertedValue).',
        placeholder: 'Escribe aquí…',
        online: 'Online',
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
      more: 'Show more',
      less: 'Show less',
      typing: 'Typing…',
      error: 'There was an error talking to the assistant.',
      invalid: 'There was a problem: ',
    };
  }, [lang]);

  const [messages, setMessages] = useState(() => [
    { id: makeId(), from: 'bot', text: ui.welcome },
  ]);

  useEffect(() => {
    setMessages((prev) => {
      if (!Array.isArray(prev) || prev.length === 0) return prev;
      const first = prev[0];
      if (first?.from === 'bot') return [{ ...first, text: ui.welcome }, ...prev.slice(1)];
      return prev;
    });
  }, [ui.welcome]);

  const [input, setInput] = useState('');
  const [loading, setLoading] = useState(false);
  const listRef = useRef(null);

  const [showAllPrompts, setShowAllPrompts] = useState(false);

const quickPrompts = useMemo(() => {
  if (lang === 'es') {
    return [
      { label: 'Confirmados (mes)', preset: 'confirmed_month' },
      { label: 'Mejor confirmación (año)', preset: 'best_confirmation_year' },
      { label: 'Dropped últimos 3 meses', preset: 'dropped_last_3_months' },
      { label: 'Resumen (semana)', preset: 'summary_week' },
      { label: 'Crédito (mes)', preset: 'credit_month' },
      { label: 'Dropped hoy (oficina)', preset: 'dropped_today_office' },
      { label: 'Cambiar mi nombre', preset: 'change_name' },
    ];
  }

  return [
    { label: 'Confirmed (month)', preset: 'confirmed_month' },
    { label: 'Best confirmation (year)', preset: 'best_confirmation_year' },
    { label: 'Dropped last 3 months', preset: 'dropped_last_3_months' },
    { label: 'Summary (week)', preset: 'summary_week' },
    { label: 'Credit (month)', preset: 'credit_month' },
    { label: 'Dropped today (office)', preset: 'dropped_today_office' },
  ];
}, [lang]);

const visiblePrompts = useMemo(() => {
  const base = showAllPrompts ? quickPrompts : quickPrompts.slice(0, 4);
  return [...base, { label: showAllPrompts ? ui.less : ui.more, __toggle: true }];
}, [quickPrompts, showAllPrompts, ui.more, ui.less]);


  useEffect(() => localStorage.setItem(THEME_KEY, theme), [theme]);
  useEffect(() => localStorage.setItem(LANG_KEY, lang), [lang]);

  useEffect(() => {
    const el = listRef.current;
    if (!el) return;
    el.scrollTop = el.scrollHeight;
  }, [messages, loading]);

  const pushBotError = (text) =>
    setMessages((prev) => [...prev, { id: makeId(), from: 'bot', text }]);

  const toggleExpanded = (id) => {
    setMessages((prev) => prev.map((m) => (m.id === id ? { ...m, expanded: !m.expanded } : m)));
  };

  const saveUserName = (name) => {
    const n = String(name || '').trim();
    if (!n) return;
    localStorage.setItem(USER_NAME_KEY, n);
    setUserName(n);
    setAskNameOpen(false);

    setMessages((prev) => [
      ...prev,
      {
        id: makeId(),
        from: 'bot',
        text: lang === 'es'
          ? `Perfecto, ${n}. ¿Qué quieres revisar hoy?`
          : `Perfect, ${n}. What do you want to review today?`,
      },
    ]);
  };

  const handleSendText = async (text, options = {}) => {
    const trimmed = (text || '').trim();
    if (!trimmed || loading) return;

    if (/^cambiar mi nombre$/i.test(trimmed) || /^change my name$/i.test(trimmed)) {
      setAskNameOpen(true);
      return;
    }

    setMessages((prev) => [...prev, { id: makeId(), from: 'user', text: trimmed }]);
    setLoading(true);

    try {
      const data = await sendChatMessage(trimmed, lang, clientId, userName, options?.preset);

      if (data?.ok) {
        setMessages((prev) => [
          ...prev,
          {
            id: makeId(),
            from: 'bot',
            text: data.answer,
            expanded: false,
            meta: { rowCount: data.rowCount, links: data.links || null, chart: data.chart || null },
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

  if (item.preset === 'change_name') {
    setAskNameOpen(true);
    return;
  }

  handleSendText(item.label, { preset: item.preset });
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
          <img src={logoWatermark} alt="" aria-hidden="true" style={s.headerWatermark(t)} />

          <div style={s.headerLeft}>
            <div style={s.avatar(t)}>
              <img src={logoAvatar} alt="305 No Fault" style={s.avatarLogo} />
            </div>

            <div style={{ lineHeight: 1.05, minWidth: 0 }}>
              <div style={s.title(t)}>Nexus Assistant</div>
              <div style={s.subTitle(t)}>305 No Fault{userName ? ` · ${userName}` : ''}</div>
            </div>
          </div>

          <div style={s.headerRight}>
            <div style={s.pill(t)}>
              <span style={s.dotOnline} />
              <span style={s.pillText(t)}>{ui.online}</span>
            </div>

            <button
              type="button"
              onClick={() => setLang((x) => (x === 'en' ? 'es' : 'en'))}
              style={s.langBtn(t)}
              title={lang === 'en' ? 'Español' : 'English'}
            >
              {lang === 'en' ? 'EN' : 'ES'}
            </button>

            <button
              type="button"
              onClick={() => setTheme((x) => (x === 'dark' ? 'light' : 'dark'))}
              style={s.themeBtn(t)}
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
                {!isUser && (
                  <div style={s.bubbleAvatar(t)}>
                    <img src={logoAvatar} alt="Nexus" style={s.bubbleLogo} />
                  </div>
                )}

                <div style={isUser ? s.bubbleUser(t) : s.bubbleBot(t)}>
                  <div style={s.messageText(t, isUser)}>
                    {!isUser ? (
                      <>
                        {long && !expanded ? (
                          <div style={clampStyle(4)}>{m.text}</div>
                        ) : (
                          <BotPrettyAnswer text={m.text} t={t} lang={lang} />
                        )}

                        <LinksBar links={m?.meta?.links} t={t} lang={lang} />
                        <MiniChart chart={m?.meta?.chart} t={t} lang={lang} />
                      </>
                    ) : (
                      <div style={{ whiteSpace: 'pre-wrap' }}>{m.text}</div>
                    )}
                  </div>

                  {!isUser && long && (
                    <button type="button" onClick={() => toggleExpanded(m.id)} style={s.moreBtn(t)}>
                      {expanded ? ui.less : ui.more}
                    </button>
                  )}
                </div>

                {isUser && <div style={s.bubbleAvatarUser(t)}>{getInitials(userName)}</div>}
              </div>
            );
          })}

          {loading && (
            <div style={s.rowBot}>
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
              title="Send"
            >
              ➤
            </button>
          </div>
        </form>
      </div>

      {askNameOpen && (
        <NameModal t={t} lang={lang} onSave={saveUserName} onSkip={() => setAskNameOpen(false)} />
      )}
    </>
  );
}
