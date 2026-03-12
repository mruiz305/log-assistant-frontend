export function makeTheme(mode) {
  const dark = mode === 'dark';
  return {
    mode,
    bg: dark ? '#0c1222' : '#f8fafc',
    headerBg: dark ? '#0f172a' : '#ffffff',
    surface: dark ? '#151d2e' : '#ffffff',
    surface2: dark ? '#0f172a' : '#f1f5f9',
    border: dark ? 'rgba(148,163,184,0.14)' : 'rgba(15,23,42,0.08)',
    text: dark ? '#f1f5f9' : '#0f172a',
    textMuted: dark ? '#94a3b8' : '#64748b',
    bubbleBotBg: dark ? '#151d2e' : '#ffffff',
    bubbleBotBorder: dark ? 'rgba(148,163,184,0.12)' : 'rgba(15,23,42,0.06)',
    bubbleUserBg: dark ? '#2563eb' : '#2563eb',
    chipBg: dark ? '#1e293b' : '#f8fafc',
    chipBorder: dark ? 'rgba(148,163,184,0.14)' : 'rgba(15,23,42,0.08)',
    blue: '#2563eb',
  };
}
export const lightTheme = makeTheme('light');
