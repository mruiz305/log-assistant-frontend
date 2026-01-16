import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import './index.css'
import App from './App.jsx'

// 🔎 Detecta quién setea withCredentials
(function () {
  const desc = Object.getOwnPropertyDescriptor(XMLHttpRequest.prototype, "withCredentials");

  try {
    let _val = false;

    Object.defineProperty(XMLHttpRequest.prototype, "withCredentials", {
      get() {
        return _val;
      },
      set(v) {
        _val = v;
      
      },
      configurable: true,
    });

   
  } catch (e) {
    console.warn("[XHRCRED] Could not override withCredentials:", e);
    console.log("[XHRCRED] Current descriptor:", desc);
  }
})();

createRoot(document.getElementById('root')).render(
  <StrictMode>
    <App />
  </StrictMode>,
)
