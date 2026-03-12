/**
 * Helpers de Firestore para conversaciones y mensajes.
 * Estructura: users/{uid}/conversations/{clientId}/messages/{autoId}
 */
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
  getDoc,
} from "firebase/firestore";
import { db } from "../firebase";

function fsConversationDocRef(uid, clientId) {
  return doc(db, "users", uid, "conversations", clientId);
}

function fsMessagesColRef(uid, clientId) {
  return collection(db, "users", uid, "conversations", clientId, "messages");
}

export function toDateSafe(ts) {
  if (!ts) return null;
  if (typeof ts.toDate === "function") return ts.toDate();
  const d = new Date(ts);
  return Number.isNaN(d.getTime()) ? null : d;
}

function startOfDay(d) {
  const x = new Date(d);
  x.setHours(0, 0, 0, 0);
  return x;
}

export function daysDiff(a, b) {
  const A = startOfDay(a).getTime();
  const B = startOfDay(b).getTime();
  return Math.round((A - B) / (24 * 3600 * 1000));
}

export async function upsertUserDoc(uid, data) {
  if (!uid) return;
  await setDoc(doc(db, "users", uid), data, { merge: true });
}

export async function loadConversationsFromFirestore({ uid, max = 50 }) {
  const _uid = String(uid || "").trim();
  if (!_uid) return [];

  const colRef = collection(db, "users", _uid, "conversations");
  const q1 = query(colRef, orderBy("updatedAt", "desc"), limit(max));
  const snap = await getDocs(q1);

  const items = [];
  snap.forEach((d) => {
    const x = d.data() || {};
    items.push({
      clientId: d.id,
      createdAt: x.createdAt || null,
      updatedAt: x.updatedAt || null,
      lastText: x.lastText || "",
      lastFrom: x.lastFrom || "bot",
      lastLang: x.lastLang || "en",
    });
  });

  return items;
}

export async function saveMessageToFirestore({ uid, clientId, from, text, meta, lang }) {
  const _uid = String(uid || "").trim();
  const _clientId = String(clientId || "").trim();
  const _text = String(text || "").trim();

  if (!_uid || !_clientId || !_text) return;

  const convRef = fsConversationDocRef(_uid, _clientId);
  const convSnap = await getDoc(convRef);

  await setDoc(
    convRef,
    {
      createdAt: convSnap.exists() ? convSnap.data()?.createdAt || serverTimestamp() : serverTimestamp(),
      updatedAt: serverTimestamp(),
      lastLang: lang || "en",
      lastText: _text.slice(0, 140),
      lastFrom: from,
    },
    { merge: true }
  );

  const colRef = fsMessagesColRef(_uid, _clientId);
  await addDoc(colRef, {
    from,
    text: _text,
    lang: lang || "en",
    meta: meta || null,
    createdAt: serverTimestamp(),
  });
}

export async function loadMessagesFromFirestore({ uid, clientId, max = 80 }) {
  const _uid = String(uid || "").trim();
  const _clientId = String(clientId || "").trim();
  if (!_uid || !_clientId) return [];

  const colRef = fsMessagesColRef(_uid, _clientId);
  const q2 = query(colRef, orderBy("createdAt", "asc"), limit(max));
  const snap = await getDocs(q2);

  const msgs = [];
  snap.forEach((d) => {
    const x = d.data() || {};
    msgs.push({
      id: d.id,
      from: x.from || "bot",
      text: x.text || "",
      lang: x.lang || "en",
      meta: x.meta || null,
      expanded: false,
      suggestions: Array.isArray(x?.meta?.suggestions) ? x.meta.suggestions : [],
      createdAt: x.createdAt || null,
    });
  });

  return msgs;
}

/** Agrupa conversaciones por hoy, ayer, semana, mes, anteriores */
export function groupConversations(convs, lang) {
  const now = new Date();
  const out = new Map();

  const label = (key) => {
    const es = { today: "HOY", yesterday: "AYER", week: "ESTA SEMANA", month: "ESTE MES", older: "ANTERIORES" };
    const en = { today: "TODAY", yesterday: "YESTERDAY", week: "THIS WEEK", month: "THIS MONTH", older: "OLDER" };
    return (lang === "es" ? es : en)[key] || key;
  };

  for (const c of convs) {
    const d = toDateSafe(c.updatedAt) || toDateSafe(c.createdAt) || null;

    let key = "older";
    if (d) {
      const diff = daysDiff(now, d);
      if (diff === 0) key = "today";
      else if (diff === 1) key = "yesterday";
      else if (diff <= 7) key = "week";
      else if (now.getFullYear() === d.getFullYear() && now.getMonth() === d.getMonth()) key = "month";
      else key = "older";
    }

    if (!out.has(key)) out.set(key, { title: label(key), items: [] });
    out.get(key).items.push(c);
  }

  const order = ["today", "yesterday", "week", "month", "older"];
  return order.filter((k) => out.has(k)).map((k) => out.get(k));
}

export function fmtShortDate(ts, lang) {
  const d = toDateSafe(ts);
  if (!d) return "";
  try {
    return d.toLocaleDateString(lang === "es" ? "es-ES" : "en-US", { month: "short", day: "numeric" });
  } catch {
    return "";
  }
}

export function fmtTime(ts, lang) {
  const d = toDateSafe(ts);
  if (!d) return "";
  try {
    return d.toLocaleTimeString(lang === "es" ? "es-ES" : "en-US", { hour: "2-digit", minute: "2-digit" });
  } catch {
    return "";
  }
}

export function dayKey(ts) {
  const d = toDateSafe(ts);
  if (!d) return null;
  const x = new Date(d);
  x.setHours(0, 0, 0, 0);
  return x.getTime();
}

export function fmtDayLabel(ts, lang) {
  const d = toDateSafe(ts);
  if (!d) return "";
  const now = new Date();
  const diff = daysDiff(now, d);

  if (lang === "es") {
    if (diff === 0) return "HOY";
    if (diff === 1) return "AYER";
    try {
      return d.toLocaleDateString("es-ES", { month: "short", day: "numeric", year: "numeric" });
    } catch {
      return "";
    }
  } else {
    if (diff === 0) return "TODAY";
    if (diff === 1) return "YESTERDAY";
    try {
      return d.toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric" });
    } catch {
      return "";
    }
  }
}
