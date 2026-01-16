import React from "react";
import { Navigate, useLocation } from "react-router-dom";
import { useAuth } from "./AuthProvider";

export default function RequireAuth({ children }) {
  const { user } = useAuth();
  const location = useLocation();

  // aún cargando Firebase Auth
  if (user === undefined) return null; // puedes poner un loader si quieres

  // no logueado
  if (!user) return <Navigate to="/login" replace state={{ from: location }} />;

  // logueado
  return children;
}
