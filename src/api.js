import axios from 'axios';

const BASE_URL =
  (import.meta.env?.VITE_API_BASE_URL || '').trim() ||
  `${window.location.protocol}//${window.location.hostname}:4000`;

const api = axios.create({
  baseURL: BASE_URL,
});

export async function sendChatMessage(message, lang = 'en') {
  const res = await api.post('/api/chat', { message, lang });
  return res.data;
}
