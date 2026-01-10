export function makeTheme(mode) {
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
export const lightTheme = makeTheme('light');
