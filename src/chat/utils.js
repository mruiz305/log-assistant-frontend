export function readStoredName(KEY) {
  const raw = localStorage.getItem(KEY);
  return String(raw || '').trim();
}

export function isLongText(text, threshold = 260) {
  return (text || '').length > threshold;
}

export function clampStyle(lines) {
  return {
    display: '-webkit-box',
    WebkitLineClamp: lines,
    WebkitBoxOrient: 'vertical',
    overflow: 'hidden',
  };
}

export function splitLines(text) {
  return String(text || '')
    .split('\n')
    .map((l) => l.trim())
    .filter(Boolean);
}

export function classifyLine(line) {
  const s = line.toLowerCase();

  if (/(baj[oó]|cay[oó]|drop|dropped|problem|rechaz|error|riesgo|alerta)/i.test(s)) {
    return { icon: '⚠️', tone: 'warn' };
  }
  if (/(↓|disminuy|menor|baja|decrec)/i.test(s)) {
    return { icon: '📉', tone: 'down' };
  }
  if (/(subi[oó]|creci[oó]|mejor|top|lider|aument|↑|ganad|converted|confirmed)/i.test(s)) {
    return { icon: '✅', tone: 'good' };
  }

  return { icon: '•', tone: 'neutral' };
}

export function makeId() {
  if (globalThis.crypto && typeof globalThis.crypto.randomUUID === 'function') {
    return globalThis.crypto.randomUUID();
  }

  if (globalThis.crypto && typeof globalThis.crypto.getRandomValues === 'function') {
    const bytes = new Uint8Array(16);
    globalThis.crypto.getRandomValues(bytes);

    bytes[6] = (bytes[6] & 0x0f) | 0x40;
    bytes[8] = (bytes[8] & 0x3f) | 0x80;

    const hex = [...bytes].map((b) => b.toString(16).padStart(2, '0'));
    return (
      hex.slice(0, 4).join('') +
      '-' +
      hex.slice(4, 6).join('') +
      '-' +
      hex.slice(6, 8).join('') +
      '-' +
      hex.slice(8, 10).join('') +
      '-' +
      hex.slice(10, 16).join('')
    );
  }

  return `${Date.now()}-${Math.random().toString(16).slice(2)}`;
}

export function getInitials(name) {
  const n = String(name || '').trim();
  if (!n) return 'U';
  const parts = n.split(/\s+/).filter(Boolean);
  const a = (parts[0] || '').slice(0, 1);
  const b = parts.length > 1 ? (parts[parts.length - 1] || '').slice(0, 1) : '';
  return (a + b).toUpperCase();
}

export function safeNum(n, def = 0) {
  const x = Number(n);
  return Number.isFinite(x) ? x : def;
}

export function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}
export const utils = {
  readStoredName,
  isLongText,   }