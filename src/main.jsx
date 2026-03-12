import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import './index.css'
import App from './App.jsx'

// Parche para CORS: evita que withCredentials=true bloquee requests.
// Necesario si Firebase/axios u otra lib setea withCredentials y causa fallos.
// Para desactivar: eliminar este bloque.
try {
  let _withCredentialsVal = false;
  Object.defineProperty(XMLHttpRequest.prototype, "withCredentials", {
    get: () => _withCredentialsVal,
    set: (v) => { _withCredentialsVal = v; },
    configurable: true,
  });
} catch (e) {
  if (import.meta.env.DEV) console.warn("[XHR] withCredentials override failed:", e);
}

createRoot(document.getElementById('root')).render(
  <StrictMode>
    <App />
  </StrictMode>,
)
