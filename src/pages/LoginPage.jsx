import React, { useEffect, useMemo, useState } from "react";
import { useNavigate } from "react-router-dom";

import {
  signInWithEmailAndPassword,
  signInWithPopup,
  GoogleAuthProvider,
  signOut,
} from "firebase/auth";
import { auth } from "../firebase";

// ✅ Reusa tu theme y estilos del chat (ajusta rutas si tus folders cambian)
import { makeTheme } from "../chat/theme";
import chatStyles from "../chat/styles";

import companyLogo from "../assets/logo.png";

const THEME_KEY = "log_assistant_theme";
console.log("ENV CHECK", {
  VITE_ALLOWED_EMAIL_DOMAIN: import.meta.env.VITE_ALLOWED_EMAIL_DOMAIN,
  MODE: import.meta.env.MODE,
});

function getAllowedDomain() {
  return (import.meta?.env?.VITE_ALLOWED_EMAIL_DOMAIN || "").trim().toLowerCase();
}
function emailAllowed(email, allowedDomain) {
  const e = String(email || "").trim().toLowerCase();
  if (!e || !allowedDomain) return false;
  return e.endsWith("@" + allowedDomain);
}

function friendlyFirebaseError(e) {
  const code = e?.code || "";
  const msg = e?.message || "";

  const map = {
    "auth/configuration-not-found":
      "Firebase Auth no está configurado (revisa Google Provider, authDomain y dominios autorizados).",
    "auth/popup-closed-by-user": "Cerraste la ventana de Google.",
    "auth/popup-blocked":
      "El navegador bloqueó el popup. Permite popups para localhost.",
    "auth/cancelled-popup-request": "Se canceló el popup (intenta de nuevo).",
    "auth/unauthorized-domain":
      "Dominio no autorizado. Agrega localhost en Firebase → Authorized domains.",
    "auth/operation-not-allowed":
      "Ese método de login no está habilitado en Firebase Auth.",
    "auth/invalid-credential": "Credenciales inválidas.",
    "auth/user-not-found": "Ese usuario no existe.",
    "auth/wrong-password": "Contraseña incorrecta.",
    "auth/invalid-email": "Email inválido.",
    "auth/account-exists-with-different-credential":
      "Esa cuenta existe con otro método de acceso. Intenta con el método correcto.",
  };

  return map[code] || msg || "Error de login";
}

export default function LoginPage() {
  const allowedDomain = useMemo(() => getAllowedDomain(), []);
  const [email, setEmail] = useState("");
  const [pass, setPass] = useState("");
  const [err, setErr] = useState("");
  const [loading, setLoading] = useState(false);
  const navigate = useNavigate();

  // ✅ Theme toggle (mismo key que ChatPage)
  const [theme, setTheme] = useState(() => {
    const saved = localStorage.getItem(THEME_KEY);
    return saved === "light" ? "light" : "dark";
  });

  useEffect(() => {
    localStorage.setItem(THEME_KEY, theme);
  }, [theme]);

  const t = useMemo(() => makeTheme(theme), [theme]);

  const rejectIfNotAllowed = async (user) => {
    const userEmail = user?.email || "";
    if (!emailAllowed(userEmail, allowedDomain)) {
      await signOut(auth);
      throw new Error(
        allowedDomain
          ? `Solo se permite iniciar sesión con correos @${allowedDomain}`
          : "Dominio permitido no configurado (VITE_ALLOWED_EMAIL_DOMAIN)."
      );
    }
  };

  const onLoginEmail = async (e) => {
    e.preventDefault();
    setErr("");
    setLoading(true);
    try {
      if (!allowedDomain) {
        setErr("Dominio permitido no configurado (VITE_ALLOWED_EMAIL_DOMAIN).");
        setLoading(false);
        return;
      }

      const userEmail = email.trim().toLowerCase();
     if (!emailAllowed(userEmail, allowedDomain)) {
      setErr(`Solo se permite @${allowedDomain}`);
      setLoading(false);
      return;
    }

      const cred = await signInWithEmailAndPassword(auth, userEmail, pass);
      await rejectIfNotAllowed(cred.user);
     navigate("/dashboard", { replace: true });

    } catch (e2) {
      setErr(friendlyFirebaseError(e2));
    } finally {
      setLoading(false);
    }
  };

  const onLoginGoogle = async () => {
    setErr("");
    setLoading(true);
    try {
      if (!allowedDomain) {
        setErr("Dominio permitido no configurado (VITE_ALLOWED_EMAIL_DOMAIN).");
        return;
      }

      const provider = new GoogleAuthProvider();
      provider.setCustomParameters({
        prompt: "select_account",
        hd: allowedDomain,
      });

      const cred = await signInWithPopup(auth, provider);
      await rejectIfNotAllowed(cred.user);

      navigate("/dashboard", { replace: true });

    } catch (e2) {
      setErr(friendlyFirebaseError(e2));
    } finally {
      setLoading(false);
    }
  };

  // ✅ estilos “computados” usando tu theme (sin chorizo ni archivos nuevos)
  const shellStyle = {
    ...S.shell,
    background: t.mode === "dark" ? "rgba(17,24,39,0.70)" : "rgba(255,255,255,0.92)",
    border: `1px solid ${t.border}`,
  };

  const cardStyle = {
    ...S.card,
    background: t.surface,
    border: `1px solid ${t.border}`,
  };

  const titleStyle = { ...S.title, color: t.text };
  const subtitleStyle = { ...S.subtitle, color: t.textMuted };
  const labelStyle = { ...S.label, color: t.textMuted };

  const inputStyle = {
    ...S.input,
    background: t.mode === "dark" ? "#0f172a" : "#fff",
    border: `1px solid ${t.border}`,
    color: t.text,
  };

  const googleBtnStyle = {
    ...S.googleBtn,
    background: t.surface2,
    border: `1px solid ${t.border}`,
    color: t.text,
  };

  const dividerStyle = {
    ...S.divider,
    background: t.mode === "dark" ? "rgba(255,255,255,0.12)" : "#e2e8f0",
  };

  const orStyle = {
    ...S.or,
    color: t.textMuted,
  };

  const footerHintStyle = {
    ...S.footerHint,
    color: t.textMuted,
  };

  const errorStyle = {
    ...S.error,
    color: t.mode === "dark" ? "#fecaca" : "#b91c1c",
    background: t.mode === "dark" ? "rgba(185,28,28,0.18)" : "#fee2e2",
    border: t.mode === "dark" ? "1px solid rgba(248,113,113,0.35)" : "1px solid #fecaca",
  };

  return (
    <div
      style={{
        ...chatStyles.page(t),
        // ✅ conserva tu gradiente “bonito” pero con modo dark/light
        padding: "clamp(10px, 3vw, 22px)",
        display: "grid",
        placeItems: "center",
        minHeight: "100vh",
        background:
          t.mode === "dark"
            ? "radial-gradient(1200px 600px at 20% 0%, #0b1220 0%, transparent 55%), radial-gradient(900px 500px at 90% 20%, #111827 0%, transparent 60%), #0b1220"
            : "radial-gradient(1200px 600px at 20% 0%, #dbeafe 0%, transparent 55%), radial-gradient(900px 500px at 90% 20%, #ffe4e6 0%, transparent 60%), #f5f7fb",
      }}
    >
      <div style={shellStyle}>
        {/* Panel izquierdo (solo se ve bien en pantallas grandes) */}
        <div style={S.left}>
          <img src={companyLogo} alt="Logo" style={S.bigLogo} />
          <div style={{ ...S.leftTitle, color: t.text }}>Log Assistant</div>
          <div style={{ ...S.leftSub, color: t.textMuted }}>
            Acceso restringido a <b>@{allowedDomain || "—"}</b>
          </div>
        </div>

        {/* Panel derecho (form) */}
        <div style={S.right}>
          <div style={cardStyle}>
            <div style={S.topRow}>
              <img src={companyLogo} alt="Logo" style={S.smallLogo} />
              <div style={{ minWidth: 0 }}>
                <div style={titleStyle}>Iniciar sesión</div>
                <div style={subtitleStyle}>
                  Solo correos <b>@{allowedDomain || "—"}</b>
                </div>
              </div>

              {/* ✅ Toggle theme reutilizando tu estilo del chat */}
              <div style={{ marginLeft: "auto" }}>
                <button
                  type="button"
                  onClick={() => setTheme((x) => (x === "dark" ? "light" : "dark"))}
                  style={chatStyles.themeBtn(t)}
                  title={theme === "dark" ? "Modo día" : "Modo noche"}
                >
                  {theme === "dark" ? "☀️" : "🌙"}
                </button>
              </div>
            </div>

            <button
              type="button"
              onClick={onLoginGoogle}
              disabled={loading}
              style={{ ...googleBtnStyle, opacity: loading ? 0.7 : 1 }}
            >
              <span
              style={{
                ...S.googleIcon,
                background: t.mode === "dark" ? "rgba(255,255,255,0.10)" : "#f1f5f9",
                color: t.mode === "dark" ? "#e5e7eb" : "#111827",
              }}
            >
              G
            </span>

              Continuar con Google
            </button>

            <div style={S.dividerRow}>
              <div style={dividerStyle} />
              <div style={orStyle}>o</div>
              <div style={dividerStyle} />
            </div>

            <form onSubmit={onLoginEmail}>
              <label style={labelStyle}>Email</label>
              <input
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                style={inputStyle}
                autoComplete="email"
                placeholder={`usuario@${allowedDomain || "empresa.com"}`}
              />

              <label style={labelStyle}>Password</label>
              <input
                type="password"
                value={pass}
                onChange={(e) => setPass(e.target.value)}
                style={inputStyle}
                autoComplete="current-password"
                placeholder="••••••••"
              />

              {err && <div style={errorStyle}>{err}</div>}

              <button
                type="submit"
                disabled={loading}
                style={{ ...S.primaryBtn, opacity: loading ? 0.7 : 1 }}
              >
                {loading ? "Entrando..." : "Entrar"}
              </button>
            </form>

           
          </div>
        </div>
      </div>
    </div>
  );
}

// ✅ tus estilos actuales (casi intactos)
const S = {
  shell: {
    width: "min(1100px, 100%)",
    display: "grid",
    gridTemplateColumns: "1fr",
    borderRadius: 22,
    overflow: "hidden",
    boxShadow: "0 25px 90px rgba(0,0,0,0.35)",
  },

  left: {
    display: "none",
    padding: "clamp(18px, 3vw, 32px)",
    background: "linear-gradient(135deg, rgba(37,99,235,0.16), rgba(14,165,233,0.10))",
    borderRight: "1px solid rgba(15, 23, 42, 0.08)",
    boxSizing: "border-box",
  },

  right: {
    padding: "clamp(12px, 2.5vw, 22px)",
    boxSizing: "border-box",
    display: "grid",
    placeItems: "center",
  },

  card: {
    width: "min(460px, 100%)",
    borderRadius: 18,
    padding: "clamp(14px, 2.5vw, 18px)",
    boxSizing: "border-box",
  },

  topRow: { display: "flex", gap: 12, alignItems: "center", marginBottom: 14 },
  smallLogo: { width: 44, height: 44, borderRadius: 12, objectFit: "cover", border: "1px solid #e2e8f0" },

  title: { fontSize: 18, fontWeight: 900, lineHeight: 1.1 },
  subtitle: { fontSize: 12, marginTop: 2 },

  googleBtn: {
    boxSizing: "border-box",
    width: "100%",
    padding: "12px 12px",
    borderRadius: 12,
    cursor: "pointer",
    fontWeight: 800,
    display: "flex",
    alignItems: "center",
    justifyContent: "center",
    gap: 10,
  },

  googleIcon: {
    width: 22,
    height: 22,
    borderRadius: 6,
    display: "grid",
    placeItems: "center",
    fontWeight: 900,
    color: "#111827",
    background: "#f1f5f9",
  },

  dividerRow: { display: "flex", alignItems: "center", gap: 10, margin: "14px 0" },
  divider: { height: 1, flex: 1 },
  or: { fontSize: 12, fontWeight: 800 },

  label: { fontWeight: 800, fontSize: 12 },
  input: {
    boxSizing: "border-box",
    width: "100%",
    padding: 12,
    margin: "6px 0 12px",
    borderRadius: 12,
    outline: "none",
    fontSize: 14,
  },

  primaryBtn: {
    boxSizing: "border-box",
    width: "100%",
    padding: 12,
    fontWeight: 900,
    borderRadius: 12,
    border: "none",
    background: "linear-gradient(135deg, #2563eb, #0ea5e9)",
    color: "white",
    cursor: "pointer",
  },

  error: {
    padding: 10,
    borderRadius: 12,
    fontSize: 12,
    fontWeight: 800,
    marginBottom: 12,
  },

  footerHint: { marginTop: 12, fontSize: 11, lineHeight: 1.3 },

  bigLogo: { width: 86, height: 86, borderRadius: 18, objectFit: "cover", border: "1px solid #e2e8f0" },
  leftTitle: { marginTop: 14, fontSize: 26, fontWeight: 1000 },
  leftSub: { marginTop: 6, fontSize: 13, lineHeight: 1.4 },
};
