import axios from 'axios';

const BASE_URL =
  (import.meta.env?.VITE_API_BASE_URL || '').trim() ||
  `${window.location.protocol}//${window.location.hostname}:4000`;

const api = axios.create({ baseURL: BASE_URL });

export async function sendChatMessage(
  message,
  lang = 'en',
  clientId = null,
  userName = null,
  preset = null,
  meta = null
) {
  const res = await api.post('/api/chat', {
    message,
    lang,
    clientId,
    userName,
    preset,
    meta,
  });
  return res.data;
}


