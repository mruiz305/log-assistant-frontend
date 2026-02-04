import axios from "axios";
import { auth } from "./firebase";

const BASE_URL = (import.meta.env.VITE_API_BASE_URL || "").trim();
if (!BASE_URL) throw new Error("Missing VITE_API_BASE_URL");
console.log("VITE_API_BASE_URL =", import.meta.env.VITE_API_BASE_URL);

// BASE_URL esperado: https://nexus.1800notifications.com/api
const api = axios.create({ baseURL: BASE_URL });

export async function resolveUserNameByEmail(email) {
  const user = auth.currentUser;
  if (!user) throw new Error("Not authenticated");

  const token = await user.getIdToken();

  const res = await api.get("/auth/resolve-user", {
    params: { email },
    headers: {
      Authorization: `Bearer ${token}`,
    },
  });

  return res.data;
}

export async function fetchWeeklyDashboard(lang = "en") {
  const user = auth.currentUser;
  if (!user) throw new Error("Not authenticated");

  const token = await user.getIdToken();

  const res = await api.get("/dashboard/summary/week", {
    params: { lang },
    headers: {
      Authorization: `Bearer ${token}`,
    },
  });

  return res.data;
}

export async function fetchMonthlyDashboard(lang = "en") {
  const user = auth.currentUser;
  if (!user) throw new Error("Not authenticated");

  const token = await user.getIdToken();

  const res = await api.get("/dashboard/summary/month", {
    params: { lang },
    headers: {
      Authorization: `Bearer ${token}`,
    },
  });

  return res.data;
}

export async function sendChatMessage(
  message,
  lang = "en",
  clientId = null,
  userName = null,
  preset = null,
  meta = null
) {
  const user = auth.currentUser;
  if (!user) throw new Error("Not authenticated");

  const token = await user.getIdToken();

  try {
    console.log("CHAT REQUEST >>>", {
      message,
      lang,
      clientId,
      userName,
      preset,
      meta,
    });

    const res = await api.post(
      "/chat",
      { message, lang, clientId, userName, preset, meta },
      {
        headers: {
          Authorization: `Bearer ${token}`,
        },
      }
    );

    console.log("CHAT RESPONSE >>>", res.data);
    return res.data;
  } catch (err) {
    console.error("CHAT ERROR >>>", err?.response?.status, err?.response?.data || err);
    throw err;
  }
}
