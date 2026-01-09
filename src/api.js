import axios from 'axios';

const api = axios.create({
  baseURL: 'http://localhost:4000',
});

export async function sendChatMessage(message, lang = 'en') {
  const res = await api.post('/api/chat', { message, lang });
  return res.data;
}
