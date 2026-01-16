import axios from 'axios';
import { auth } from './firebase'; 

const BASE_URL =
  (import.meta.env?.VITE_API_BASE_URL || '').trim() ||
  `${window.location.protocol}//${window.location.hostname}:4000`;

const api = axios.create({ baseURL: BASE_URL });

export async function resolveUserNameByEmail(email) {
  const user = auth.currentUser;
  if (!user) throw new Error("Not authenticated");

  const token = await user.getIdToken();

  const res = await api.get("/api/auth/resolve-user", {
    params: { email },
    headers: {
      Authorization: `Bearer ${token}`,
    },
  });

  return res.data; // { ok: true, found: true/false, name?: "..." }
}

export async function fetchWeeklyDashboard(lang = "en") {
  const user = auth.currentUser;
  if (!user) throw new Error("Not authenticated");

  const token = await user.getIdToken();

  const res = await api.get("/api/dashboard/summary/week", {
    params: { lang },
    headers: {
      Authorization: `Bearer ${token}`,
    },
  });

  return res.data;
}

export async function sendChatMessage(
  message,
  lang = 'en',
  clientId = null,
  userName = null,
  preset = null,
  meta = null
) {
  // ✅ Debe haber usuario logueado
  const user = auth.currentUser;
  if (!user) {
    throw new Error('Not authenticated');
  }

  // ✅ Token del usuario actual
  const token = await user.getIdToken();

  const res = await api.post(
    '/api/chat',
    {
      message,
      lang,
      clientId,
      userName,
      preset,
      meta,
    },
    {
      headers: {
        Authorization: `Bearer ${token}`, 
      },
    }
  );

  return res.data;
}
