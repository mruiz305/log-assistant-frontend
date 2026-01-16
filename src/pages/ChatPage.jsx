import React, { useEffect, useMemo, useRef, useState } from 'react';

import logoAvatar from '../assets/logo_avatar.png';
import logoWatermark from '../assets/logo_watermark.png';

import { makeTheme } from '../chat/theme';
import s from '../chat/styles';
import { auth, db } from '../firebase'; // ✅ usa el db del mismo initializeApp

import { onAuthStateChanged, signOut } from 'firebase/auth';
import { sendChatMessage, resolveUserNameByEmail } from '../api';

import {
  makeId,
  readStoredName,
  isLongText,
  clampStyle,
  getInitials,
} from '../chat/utils';

import BotPrettyAnswer from '../chat/components/BotPrettyAnswer';
import LinksBar from '../chat/components/LinksBar';
import MiniChart from '../chat/components/MiniChart';
import NameModal from '../chat/components/NameModal';
import { useNavigate } from 'react-router-dom';

import {
  doc,
  collection,
  addDoc,
  serverTimestamp,
  query,
  orderBy,
  limit,
  getDocs,
  setDoc,
  getDoc, // ✅ NUEVO
} from 'firebase/firestore';

import { getApp } from 'firebase/app';

const THEME_KEY = 'log_assistant_theme';
const LANG_KEY = 'log_assistant_lang';
const CLIENT_ID_KEY = 'log_assistant_client_id';
const USER_NAME_KEY = 'log_assistant_user_name';

/** ✅ Limpia label para UI: SOLO nombre (sin correo, sin "·", sin repetición) */
function cleanPickLabel(label = '') {
  const raw = String(label || '');

  // quita emails
  let s2 = raw.replace(/\S+@\S+\.\S+/g, '').trim();

  // corta por separadores comunes
  s2 = s2.split('·')[0].trim();
  s2 = s2.split('-')[0].trim();

  // normaliza espacios
  s2 = s2.replace(/\s+/g, ' ').trim();

  return s2;
}

/* =========================
   Firestore helpers
   users/{uid}/conversations/{clientId}/messages/{autoId}
========================= */

function fsConversationDocRef(uid, clientId) {
  return doc(db, 'users', uid, 'conversations', clientId);
}

function fsMessagesColRef(uid, clientId) {
  return collection(db, 'users', uid, 'conversations', clientId, 'messages');
}

async function upsertUserDoc(uid, data) {
  if (!uid) return;
  await setDoc(doc(db, 'users', uid), data, { merge: true });
}

async function saveMessageToFirestore({ uid, clientId, from, text, meta, lang }) {
  try {
    const _uid = String(uid || '').trim();
    const _clientId = String(clientId || '').trim();
    const _text = String(text || '').trim();

    console.log('[FS] saveMessage inputs:', {
      uid: _uid,
      clientId: _clientId,
      from,
      textLen: _text.length,
      lang,
      meta,
    });

    if (!_uid || !_clientId || !_text) {
      console.warn('[FS] saveMessage skipped: missing uid/clientId/text');
      return;
    }

    // ✅ crea/actualiza el doc de conversación (clave para poder “encontrar” la última conversación)
    await setDoc(
      fsConversationDocRef(_uid, _clientId),
      {
        createdAt: serverTimestamp(),
        updatedAt: serverTimestamp(),
        lastLang: lang || 'en',
      },
      { merge: true }
    );

    const colRef = fsMessagesColRef(_uid, _clientId);
    console.log('[FS] saving to path:', `users/${_uid}/conversations/${_clientId}/messages`);

    const ref = await addDoc(colRef, {
      from, // 'user' | 'bot'
      text: _text,
      lang: lang || 'en',
      meta: meta || null,
      createdAt: serverTimestamp(),
    });

    console.log('[FS] ✅ saved message id:', ref.id);
    return ref.id;
  } catch (e) {
    console.error('[FS] ❌ saveMessage failed:', e);
    throw e;
  }
}

async function loadMessagesFromFirestore({ uid, clientId, max = 80 }) {
  try {
    const _uid = String(uid || '').trim();
    const _clientId = String(clientId || '').trim();

    console.log('[FS] loadMessages inputs:', { uid: _uid, clientId: _clientId, max });

    if (!_uid || !_clientId) return [];

    const colRef = fsMessagesColRef(_uid, _clientId);

    // ⚠️ IMPORTANTE:
    // Si te falla por "requires index" o por createdAt null en docs viejos,
    // cambia orderBy('createdAt','asc') por orderBy('__name__','asc') temporalmente.
    const q2 = query(colRef, orderBy('createdAt', 'asc'), limit(max));
    const snap = await getDocs(q2);

    const msgs = [];
    snap.forEach((d) => {
      const x = d.data() || {};
      msgs.push({
        id: d.id,
        from: x.from || 'bot',
        text: x.text || '',
        meta: x.meta || null,
        expanded: false,
      });
    });

    console.log('[FS] ✅ loaded messages count:', msgs.length);
    return msgs;
  } catch (e) {
    console.error('[FS] ❌ loadMessages failed:', e);
    throw e;
  }
}

export default function ChatPage() {
  const navigate = useNavigate();

  const [uid, setUid] = useState(null);

  const [theme, setTheme] = useState(() => {
    const saved = localStorage.getItem(THEME_KEY);
    return saved === 'light' ? 'light' : 'dark';
  });

  const [lang, setLang] = useState(() => {
    const saved = localStorage.getItem(LANG_KEY);
    return saved === 'es' ? 'es' : 'en';
  });

  // ✅ ahora clientId es editable (para poder cambiar al lastClientId del user)
  const [clientId, setClientId] = useState(() => {
    const saved = localStorage.getItem(CLIENT_ID_KEY);
    if (saved) return saved;
    const id = makeId();
    localStorage.setItem(CLIENT_ID_KEY, id);
    return id;
  });

  const [userName, setUserName] = useState(() => readStoredName(USER_NAME_KEY));
  const [askNameOpen, setAskNameOpen] = useState(false);

  // ✅ DEBUG: confirma proyecto firebase real
  useEffect(() => {
    try {
      const app = getApp();
      console.log('[FIREBASE] projectId =', app?.options?.projectId);
      console.log('[FIREBASE] authDomain =', app?.options?.authDomain);
    } catch (e) {
      console.warn('[FIREBASE] getApp() failed', e);
    }
  }, []);

  useEffect(() => {
    const unsub = onAuthStateChanged(auth, async (fbUser) => {
      try {
        if (!fbUser) {
          console.log('[AUTH] signed out');
          setUid(null);
          return;
        }

        console.log('[AUTH] signed in:', { uid: fbUser.uid, email: fbUser.email });
        setUid(fbUser.uid);

        // ✅ lee lastClientId del user y cambia el clientId local si hace falta
        try {
          const uref = doc(db, 'users', fbUser.uid);
          const usnap = await getDoc(uref);
          const last = usnap.exists() ? usnap.data()?.lastClientId : null;

          console.log('[FS] user.lastClientId =', last);

          if (last && String(last).trim() && last !== clientId) {
            console.log('[FS] switching clientId to lastClientId:', last);
            localStorage.setItem(CLIENT_ID_KEY, last);
            setClientId(last);
          }
        } catch (e) {
          console.warn('[FS] get user doc failed:', e);
        }

        // ✅ PROBE: actualiza users/{uid}
        try {
          await upsertUserDoc(fbUser.uid, {
            email: fbUser.email || null,
            lastSeenAt: serverTimestamp(),
            lastClientId: localStorage.getItem(CLIENT_ID_KEY) || clientId,
            updatedAt: serverTimestamp(),
          });
          console.log('[FS] ✅ upsertUserDoc ok: users/' + fbUser.uid);
        } catch (e) {
          console.error('[FS] ❌ upsertUserDoc failed (rules?):', e);
        }

        const email = (fbUser.email || '').trim().toLowerCase();
        if (!email) {
          setAskNameOpen(true);
          return;
        }

        const saved = readStoredName(USER_NAME_KEY);
        if (saved) {
          setUserName(saved);
          setAskNameOpen(false);
          return;
        }

        const r = await resolveUserNameByEmail(email);

        if (r?.ok && r?.found && r?.name) {
          localStorage.setItem(USER_NAME_KEY, r.name);
          setUserName(r.name);
          setAskNameOpen(false);
          return;
        }

        setAskNameOpen(true);
      } catch (err) {
        console.error('resolveUserNameByEmail error:', err);
        setAskNameOpen(true);
      }
    });

    return () => unsub();
  }, [clientId]);

  const t = useMemo(() => makeTheme(theme), [theme]);

  const ui = useMemo(() => {
    const name = userName ? `, ${userName}` : '';

    if (lang === 'es') {
      return {
        welcome:
          `Hola${name} 👋 Soy Nexus.\n` +
          `¿Qué quieres revisar hoy?\n` +
          `(confirmed/dropped/problem/credit y links de logs/PDF).`,
        placeholder: 'Escribe aquí…',
        online: 'Online',
        more: 'Ver más',
        less: 'Ver menos',
        typing: 'Escribiendo…',
        error: 'Ocurrió un error hablando con el asistente.',
        invalid: 'Hubo un problema: ',
        pickTitle: 'Hay varias coincidencias. Elige una opción:',
        pickCancel: 'Cancelar',
      };
    }

    return {
      welcome:
        `Hi${name} 👋 I’m Nexus.\n` +
        `What do you want to review today?\n` +
        `(confirmed/dropped/problem/credit and logs/PDF links).`,
      placeholder: 'Type here…',
      online: 'Online',
      more: 'Show more',
      less: 'Show less',
      typing: 'Typing…',
      error: 'There was an error talking to the assistant.',
      invalid: 'There was a problem: ',
      pickTitle: 'Multiple matches found. Pick one:',
      pickCancel: 'Cancel',
    };
  }, [lang, userName]);

  const [messages, setMessages] = useState(() => [
    { id: makeId(), from: 'bot', text: ui.welcome },
  ]);

  // ✅ si no hay historial, el welcome se mantiene
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

  // ✅ cuando el backend pide escoger una persona/entidad
  const [pendingPick, setPendingPick] = useState(null);

  // ✅ Cargar historial cuando ya existe uid + clientId
  useEffect(() => {
    if (!uid || !clientId) return;

    (async () => {
      try {
        console.log('[FS] loading chat history now...', { uid, clientId });
        const history = await loadMessagesFromFirestore({ uid, clientId, max: 80 });

        if (history.length > 0) {
          setMessages(history);
        } else {
          console.log('[FS] no history found for this clientId');

          // ✅ si NO hay historial, al menos deja el welcome
          setMessages([{ id: makeId(), from: 'bot', text: ui.welcome }]);
        }
      } catch (e) {
        console.error('loadMessagesFromFirestore error:', e);
      }
    })();
  }, [uid, clientId, ui.welcome]);

  const quickPrompts = useMemo(() => {
    if (lang === 'es') {
      return [
        { label: 'Confirmados (mes)', preset: 'confirmed_month' },
        { label: 'Mejor confirmación (año)', preset: 'best_confirmation_year' },
        { label: 'Dropped últimos 3 meses', preset: 'dropped_last_3_months' },
        { label: 'Resumen (semana)', preset: 'summary_week' },
        { label: 'Crédito (mes)', preset: 'credit_month' },
        { label: 'Dropped hoy (oficina)', preset: 'dropped_today_office' },
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
  }, [messages, loading, pendingPick]);

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

    const botText =
      lang === 'es'
        ? `Perfecto, ${n}. ¿Qué quieres revisar hoy?`
        : `Perfect, ${n}. What do you want to review today?`;

    setMessages((prev) => [...prev, { id: makeId(), from: 'bot', text: botText }]);

    if (uid) {
      saveMessageToFirestore({
        uid,
        clientId,
        from: 'bot',
        text: botText,
        meta: { system: 'name_saved' },
        lang,
      }).catch(console.error);
    }
  };

  const handleSendText = async (text, options = {}) => {
    const trimmed = (text || '').trim();
    if (!trimmed || loading) return;

    if (/^cambiar mi nombre$/i.test(trimmed) || /^change my name$/i.test(trimmed)) {
      setAskNameOpen(true);
      return;
    }

    if (!options?.preset) setPendingPick(null);

    const userMsg = { id: makeId(), from: 'user', text: trimmed };
    setMessages((prev) => [...prev, userMsg]);

    if (uid) {
      saveMessageToFirestore({
        uid,
        clientId,
        from: 'user',
        text: trimmed,
        meta: options?.preset ? { preset: options.preset } : null,
        lang,
      }).catch((e) => console.error('[FS] user message save failed:', e));

      // ✅ actualiza lastClientId cuando se usa
      upsertUserDoc(uid, {
        lastClientId: clientId,
        lastSeenAt: serverTimestamp(),
        updatedAt: serverTimestamp(),
      }).catch(() => {});
    } else {
      console.warn('[FS] uid is null, cannot save user message');
    }

    setLoading(true);

    try {
      const data = await sendChatMessage(trimmed, lang, clientId, userName, options?.preset);

      if (data?.ok) {
        setPendingPick(data.pick || null);

        const botMeta = { rowCount: data.rowCount, links: data.links || null, chart: data.chart || null };
        const botMsg = {
          id: makeId(),
          from: 'bot',
          text: data.answer,
          expanded: false,
          meta: botMeta,
        };

        setMessages((prev) => [...prev, botMsg]);

        if (uid) {
          saveMessageToFirestore({
            uid,
            clientId,
            from: 'bot',
            text: data.answer,
            meta: botMeta,
            lang,
          }).catch((e) => console.error('[FS] bot message save failed:', e));

          upsertUserDoc(uid, {
            lastClientId: clientId,
            lastSeenAt: serverTimestamp(),
            updatedAt: serverTimestamp(),
          }).catch(() => {});
        }
      } else {
        const errText = `${ui.invalid}${data?.error || 'Invalid response'}`;
        pushBotError(errText);
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

    const msg = String(index + 1);
    setMessages((prev) => [...prev, { id: makeId(), from: 'user', text: msg }]);

    if (uid) {
      saveMessageToFirestore({
        uid,
        clientId,
        from: 'user',
        text: msg,
        meta: {
          pick: true,
          pickedIndex: index + 1,
          pickedLabel: cleanPickLabel(opt?.label || ''),
        },
        lang,
      }).catch((e) => console.error('[FS] pick save failed:', e));
    }

    setLoading(true);
    try {
      const data = await sendChatMessage(msg, lang, clientId, userName);

      if (data?.ok) {
        const botMeta = { rowCount: data.rowCount, links: data.links || null, chart: data.chart || null };

        setMessages((prev) => [
          ...prev,
          { id: makeId(), from: 'bot', text: data.answer, expanded: false, meta: botMeta },
        ]);

        setPendingPick(data.pick || null);

        if (uid) {
          saveMessageToFirestore({
            uid,
            clientId,
            from: 'bot',
            text: data.answer,
            meta: botMeta,
            lang,
          }).catch((e) => console.error('[FS] bot pick-answer save failed:', e));
        }
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
              <button
                type="button"
                onClick={() => navigate('/dashboard')}
                title={lang === 'es' ? 'Ir al dashboard' : 'Go to dashboard'}
                style={{
                  border: 'none',
                  background: 'transparent',
                  padding: 0,
                  cursor: 'pointer',
                  display: 'grid',
                }}
              >
                <div style={s.avatar(t)}>
                  <img src={logoAvatar} alt="305 No Fault" style={s.avatarLogo} />
                </div>
              </button>
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

            <button
              type="button"
              onClick={() => signOut(auth)}
              style={s.langBtn(t)}
              title="Logout"
            >
              ⎋
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
                        {(() => {
                          if (pendingPick?.options?.length > 0) {
                            return <div style={{ whiteSpace: 'pre-wrap' }}>{m.text}</div>;
                          }

                          if (long && !expanded) return <div style={clampStyle(4)}>{m.text}</div>;
                          return <BotPrettyAnswer text={m.text} t={t} lang={lang} />;
                        })()}

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

          {/* ✅ Picker dentro del chat */}
          {pendingPick?.options?.length > 0 && (
            <div style={s.rowBot}>
              <div style={s.bubbleAvatar(t)}>
                <img src={logoAvatar} alt="Nexus" style={s.bubbleLogo} />
              </div>

              <div style={{ ...s.bubbleBot(t), padding: 0, background: 'transparent', border: 'none' }}>
                <div style={pickStyles.wrapInline(t)}>
                  <div style={pickStyles.title(t)}>{ui.pickTitle}</div>

                  <div style={pickStyles.grid}>
                    {pendingPick.options.map((opt, idx) => {
                      const onlyName = cleanPickLabel(opt?.label || '');
                      return (
                        <button
                          key={`${opt.id || opt.label}-${idx}`}
                          type="button"
                          onClick={() => onPickOption(opt, idx)}
                          disabled={loading}
                          style={{
                            ...pickStyles.option(t),
                            opacity: loading ? 0.6 : 1,
                            cursor: loading ? 'not-allowed' : 'pointer',
                          }}
                          title={onlyName}
                        >
                          <div style={pickStyles.badge(t)}>{idx + 1}</div>

                          <div style={{ minWidth: 0, flex: 1 }}>
                            <div style={pickStyles.name(t)}>{onlyName || '(sin nombre)'}</div>
                          </div>

                          <div style={{ opacity: 0.7, fontWeight: 900 }}>›</div>
                        </button>
                      );
                    })}
                  </div>

                  <div style={pickStyles.footer}>
                    <button
                      type="button"
                      disabled={loading}
                      onClick={() => setPendingPick(null)}
                      style={{
                        ...pickStyles.cancel(t),
                        opacity: loading ? 0.6 : 1,
                        cursor: loading ? 'not-allowed' : 'pointer',
                      }}
                    >
                      {ui.pickCancel}
                    </button>
                  </div>
                </div>
              </div>
            </div>
          )}

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

        {/* ✅ oculta sugerencias mientras hay pick */}
        {pendingPick?.options?.length > 0 ? null : (
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
        )}

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

/* ✅ estilos locales SOLO para el panel pick (no toca tu styles.js) */
const pickStyles = {
  wrapInline: (t) => ({
    margin: 0,
    padding: '12px 12px',
    borderRadius: 14,
    border:
      t.mode === 'dark'
        ? '1px solid rgba(148,163,184,0.18)'
        : '1px solid rgba(15,23,42,0.10)',
    background: t.mode === 'dark' ? 'rgba(2,6,23,0.35)' : 'rgba(255,255,255,0.85)',
    backdropFilter: 'blur(8px)',
  }),
  title: (t) => ({
    fontWeight: 900,
    fontSize: 12,
    letterSpacing: 0.2,
    opacity: 0.9,
    marginBottom: 10,
    color: t.mode === 'dark' ? 'rgba(226,232,240,0.95)' : 'rgba(15,23,42,0.9)',
  }),
  grid: {
    display: 'grid',
    gap: 10,
  },
  option: (t) => ({
    display: 'flex',
    alignItems: 'center',
    gap: 10,
    width: '100%',
    textAlign: 'left',
    padding: '10px 12px',
    borderRadius: 14,
    border:
      t.mode === 'dark'
        ? '1px solid rgba(148,163,184,0.16)'
        : '1px solid rgba(15,23,42,0.10)',
    background: t.mode === 'dark' ? 'rgba(15,23,42,0.35)' : 'rgba(248,250,252,0.9)',
  }),
  badge: (t) => ({
    width: 28,
    height: 28,
    borderRadius: 10,
    display: 'grid',
    placeItems: 'center',
    fontWeight: 900,
    fontSize: 13,
    background: t.mode === 'dark' ? 'rgba(56,189,248,0.18)' : 'rgba(2,132,199,0.12)',
    color: t.mode === 'dark' ? 'rgba(125,211,252,0.95)' : 'rgba(2,132,199,0.95)',
    flex: '0 0 auto',
  }),
  name: (t) => ({
    fontWeight: 900,
    fontSize: 13,
    lineHeight: 1.1,
    color: t.mode === 'dark' ? 'rgba(226,232,240,0.95)' : 'rgba(15,23,42,0.9)',
    whiteSpace: 'nowrap',
    overflow: 'hidden',
    textOverflow: 'ellipsis',
    maxWidth: '100%',
  }),
  footer: {
    display: 'flex',
    justifyContent: 'flex-end',
    marginTop: 10,
  },
  cancel: (t) => ({
    padding: '8px 12px',
    borderRadius: 12,
    border:
      t.mode === 'dark'
        ? '1px solid rgba(148,163,184,0.18)'
        : '1px solid rgba(15,23,42,0.10)',
    background: t.mode === 'dark' ? 'rgba(15,23,42,0.35)' : 'rgba(248,250,252,0.9)',
    color: t.mode === 'dark' ? 'rgba(226,232,240,0.9)' : 'rgba(15,23,42,0.85)',
    fontWeight: 900,
    fontSize: 12,
  }),
};
