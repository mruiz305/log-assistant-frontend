
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
    position: 'relative',
    overflow: 'hidden',
  }),

  headerWatermark: (t) => ({
    position: 'absolute',
    inset: 0,
    width: '100%',
    height: '100%',
    objectFit: 'contain',
    opacity: t.mode === 'dark' ? 0.045 : 0.06,
    pointerEvents: 'none',
    filter: 'grayscale(1)',
    transform: 'translateX(12px)',
  }),

  headerLeft: {
    display: 'flex',
    alignItems: 'center',
    gap: 10,
    minWidth: 0,
    position: 'relative',
    zIndex: 1,
  },
  headerRight: {
    display: 'flex',
    alignItems: 'center',
    gap: 10,
    flexShrink: 0,
    position: 'relative',
    zIndex: 1,
  },

  avatar: (t) => ({
    width: 36,
    height: 36,
    borderRadius: 999,
    background: t.mode === 'dark' ? 'rgba(255,255,255,0.08)' : '#ffffff',
    border: `1px solid ${t.border}`,
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
    flexShrink: 0,
    overflow: 'hidden',
    padding: 6,
  }),

  avatarLogo: {
    width: '100%',
    height: '100%',
    objectFit: 'contain',
    imageRendering: 'auto',
    filter: 'none',
  },

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
    background: t.mode === 'dark' ? 'rgba(255,255,255,0.08)' : '#ffffff',
    border: `1px solid ${t.border}`,
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
    flexShrink: 0,
    overflow: 'hidden',
    padding: 5,
  }),

  bubbleLogo: {
    width: '100%',
    height: '100%',
    objectFit: 'contain',
    imageRendering: 'auto',
    filter: 'none',
  },

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
    maxWidth: 'min(860px, 78%)', 
    background: t.bubbleBotBg,
    border: `1px solid ${t.bubbleBotBorder}`,
    borderRadius: 18,
    padding: '12px 12px',
  }),

  bubbleUser: (t) => ({
    maxWidth: 'min(860px, 78%)', 
    background: t.bubbleUserBg,
    color: '#fff',
    borderRadius: 18,
    padding: '12px 12px',
  }),

  messageText: (t, isUser) => ({
    fontSize: isUser ? 16 : 14, 
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
    position: 'relative',
    zIndex: 2,
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
    position: 'relative',
    zIndex: 3,
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

  botAnswerWrap: () => ({ display: 'flex', flexDirection: 'column', gap: 8 }),
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

  linksWrap: (t) => ({
    display: 'flex',
    gap: 10,
    flexWrap: 'wrap',
    marginTop: 10,
    alignItems: 'center',
  }),

  linkBtn: (t) => ({
    display: 'inline-flex',
    alignItems: 'center',
    gap: 8,
    padding: '9px 12px',
    borderRadius: 999,
    border:
      t.mode === 'dark'
        ? '1px solid rgba(148,163,184,0.18)'
        : '1px solid rgba(15,23,42,0.10)',
    background:
      t.mode === 'dark'
        ? 'rgba(15,23,42,0.55)'
        : 'rgba(248,250,252,0.95)',
    color: t.text,
    fontSize: 12,
    fontWeight: 950,
    textDecoration: 'none',
    cursor: 'pointer',
    boxShadow:
      t.mode === 'dark'
        ? '0 10px 25px rgba(0,0,0,0.28)'
        : '0 10px 22px rgba(15,23,42,0.10)',
    transform: 'translateY(0)',
    transition: 'transform 140ms ease, box-shadow 140ms ease, border-color 140ms ease',
  }),

  modalOverlay: (t) => ({
    position: 'fixed',
    inset: 0,
    background: t.mode === 'dark' ? 'rgba(0,0,0,0.55)' : 'rgba(15,23,42,0.30)',
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
    padding: 16,
    zIndex: 9999,
  }),

  modalCard: (t) => ({
    width: 'min(420px, 92vw)',
    maxWidth: '92vw',
    boxSizing: 'border-box',
    borderRadius: 18,
    background: t.surface,
    border: `1px solid ${t.border}`,
    boxShadow:
      t.mode === 'dark'
        ? '0 25px 60px rgba(0,0,0,0.60)'
        : '0 25px 60px rgba(15,23,42,0.18)',
    padding: 16,
    overflow: 'hidden',
  }),

  modalTitle: (t) => ({
    fontSize: 16,
    fontWeight: 950,
    color: t.text,
    marginBottom: 6,
  }),

  modalSub: (t) => ({
    fontSize: 13,
    fontWeight: 700,
    color: t.textMuted,
    marginBottom: 12,
    lineHeight: 1.35,
  }),

  modalInput: (t) => ({
    width: '100%',
    maxWidth: '100%',
    boxSizing: 'border-box',
    borderRadius: 12,
    border: `1px solid ${t.border}`,
    padding: '12px 12px',
    background: t.mode === 'dark' ? '#0f172a' : '#ffffff',
    color: t.text,
    outline: 'none',
    fontSize: 14,
    fontWeight: 700,
  }),

  modalActions: {
    display: 'flex',
    justifyContent: 'flex-end',
    gap: 10,
    marginTop: 12,
    flexWrap: 'wrap',
  },

  modalBtnGhost: (t) => ({
    height: 38,
    padding: '0 12px',
    borderRadius: 999,
    border: `1px solid ${t.border}`,
    background: t.surface2,
    color: t.text,
    fontSize: 12,
    fontWeight: 900,
    cursor: 'pointer',
  }),

  modalBtnPrimary: (t) => ({
    height: 38,
    padding: '0 14px',
    borderRadius: 999,
    border: 'none',
    background: t.blue,
    color: '#fff',
    fontSize: 12,
    fontWeight: 950,
  }),

   suggestionsRow: (t) => ({
    display: 'flex',
    flexWrap: 'wrap',
    gap: 10,
    marginTop: 10,
  }),

   suggestionChip: (t) => ({
    border:
      t.mode === 'dark'
        ? '1px solid rgba(148,163,184,0.18)'
        : '1px solid rgba(15,23,42,0.10)',
    background: t.mode === 'dark'
      ? 'rgba(15,23,42,0.35)'
      : 'rgba(248,250,252,0.95)',
    color: t.mode === 'dark'
      ? 'rgba(226,232,240,0.92)'
      : 'rgba(15,23,42,0.90)',
    borderRadius: 999,
    padding: '8px 12px',
    fontSize: 12,
    fontWeight: 900,
    cursor: 'pointer',
    maxWidth: '100%',
    textAlign: 'left',
    whiteSpace: 'normal',      
    lineHeight: 1.2,           
  }),
};

export default s;
